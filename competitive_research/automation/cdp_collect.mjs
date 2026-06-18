import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outRoot = path.join(root, 'competitive_research');
const shotDir = path.join(outRoot, 'screenshots');
const rawDir = path.join(outRoot, 'raw');
const pageDir = path.join(rawDir, 'pages');
const artifactDir = path.join(outRoot, 'artifacts');
const profileDir = path.join(outRoot, 'chrome_profile');
const baseUrl = 'http://192.168.11.88:8081/';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9237;

const username = process.env.CR_RESEARCH_USER || 'admin';
const password = process.env.CR_RESEARCH_PASS;
if (!password) {
  throw new Error('Set CR_RESEARCH_PASS before running this script.');
}

await mkdir(shotDir, { recursive: true });
await mkdir(pageDir, { recursive: true });
await mkdir(artifactDir, { recursive: true });
await mkdir(profileDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeName(text, fallback = 'page') {
  return String(text || fallback)
    .trim()
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120) || fallback;
}

async function waitForJson(url, timeoutMs = 15000) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await sleep(300);
  }
  throw lastErr || new Error(`Timed out waiting for ${url}`);
}

class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP websocket timeout')), 10000);
      this.ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.ws.addEventListener('error', (event) => {
        clearTimeout(timer);
        reject(event.error || new Error('CDP websocket error'));
      }, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result || {});
      } else {
        this.events.push(msg);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

async function evalJson(cdp, sessionId, expression, timeoutMs = 30000) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs,
  }, sessionId);
  if (res.exceptionDetails) {
    throw new Error(JSON.stringify(res.exceptionDetails));
  }
  return res.result?.value;
}

async function waitFor(cdp, sessionId, expression, timeoutMs = 20000, intervalMs = 400) {
  const start = Date.now();
  let lastValue;
  while (Date.now() - start < timeoutMs) {
    try {
      lastValue = await evalJson(cdp, sessionId, expression, intervalMs + 1000);
      if (lastValue) return lastValue;
    } catch {}
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for expression: ${expression}; last=${JSON.stringify(lastValue)}`);
}

async function screenshot(cdp, sessionId, filename) {
  const res = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true,
  }, sessionId);
  const file = path.join(shotDir, filename);
  await writeFile(file, Buffer.from(res.data, 'base64'));
  return file;
}

async function collectPage(cdp, sessionId, key, note = '') {
  await sleep(1200);
  const info = await evalJson(cdp, sessionId, `(() => {
    const q = (sel) => Array.from(document.querySelectorAll(sel));
    const visibleText = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.visibility === 'hidden' || style.display === 'none' || rect.width === 0 || rect.height === 0) return '';
      return (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    };
    const controls = q('button, input, textarea, select, [role="button"], [role="menuitem"], .custom-light-menu-item, .ant-menu-item, .cr-btn')
      .map((el, idx) => ({
        idx,
        tag: el.tagName,
        cls: el.className && String(el.className).slice(0, 200),
        text: visibleText(el),
        placeholder: el.getAttribute('placeholder') || '',
        title: el.getAttribute('title') || '',
        aria: el.getAttribute('aria-label') || '',
        disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
        rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
      }))
      .filter(x => x.text || x.placeholder || x.title || x.aria);
    const headings = q('h1,h2,h3,h4,.title,.page-title,.app-header-comp,.custom-light-breadcrumb,.ant-breadcrumb')
      .map(visibleText).filter(Boolean);
    const tables = q('table, .ant-table, .custom-light-table, .cr-table')
      .map((el, idx) => ({
        idx,
        text: visibleText(el).slice(0, 4000),
        headers: Array.from(el.querySelectorAll('th')).map(visibleText).filter(Boolean),
      }));
    const cards = q('.card, .ant-card, .statistic, .app-list-item, .data-card, .overview-card')
      .map((el, idx) => ({ idx, text: visibleText(el).slice(0, 1200) }))
      .filter(x => x.text);
    const menus = q('.custom-light-menu-item, .ant-menu-item, [role="menuitem"], .menu-item, .side-menu-item')
      .map((el, idx) => ({ idx, text: visibleText(el), cls: String(el.className || '').slice(0, 160) }))
      .filter(x => x.text);
    return {
      note: ${JSON.stringify(note)},
      title: document.title,
      url: location.href,
      path: location.pathname + location.search + location.hash,
      bodyText: (document.body.innerText || '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 30000),
      headings,
      controls,
      tables,
      cards,
      menus,
      storageKeys: {
        localStorage: Object.keys(localStorage),
        sessionStorage: Object.keys(sessionStorage),
      },
    };
  })()`);
  const name = `${safeName(key)}.json`;
  await writeFile(path.join(pageDir, name), JSON.stringify(info, null, 2), 'utf8');
  const shot = await screenshot(cdp, sessionId, `${safeName(key)}.png`);
  return { ...info, screenshot: path.relative(outRoot, shot).replaceAll('\\', '/') };
}

async function getNetworkSummary(cdp) {
  const items = [];
  for (const event of cdp.events) {
    if (event.method === 'Network.requestWillBeSent') {
      items.push({
        type: 'request',
        url: event.params.request?.url,
        method: event.params.request?.method,
        documentURL: event.params.documentURL,
      });
    }
    if (event.method === 'Network.responseReceived') {
      items.push({
        type: 'response',
        url: event.params.response?.url,
        status: event.params.response?.status,
        mimeType: event.params.response?.mimeType,
      });
    }
  }
  return items.filter((item) => item.url && !item.url.startsWith('data:'));
}

async function main() {
  if (!existsSync(chromePath)) throw new Error(`Chrome not found: ${chromePath}`);
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--window-size=1440,1000',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const stderr = [];
  chrome.stderr.on('data', (d) => stderr.push(String(d).trim()));

  const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const cdp = new Cdp(version.webSocketDebuggerUrl);
  await cdp.connect();
  const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const attached = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('DOM.enable', {}, sessionId);
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  }, sessionId);

  await cdp.send('Page.navigate', { url: baseUrl }, sessionId);
  await waitFor(cdp, sessionId, `document.readyState === 'complete'`, 20000);
  await waitFor(cdp, sessionId, `!!document.querySelector('#form_item_username')`, 20000);
  await collectPage(cdp, sessionId, '00_login_page', '登录页');

  await evalJson(cdp, sessionId, `(() => {
    function setValue(selector, value) {
      const el = document.querySelector(selector);
      if (!el) throw new Error('missing ' + selector);
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    setValue('#form_item_username', ${JSON.stringify(username)});
    setValue('#form_item_password', ${JSON.stringify(password)});
    const btn = document.querySelector('button[type=submit], .login-btn-wrap button');
    if (!btn) throw new Error('missing submit button');
    btn.click();
    return true;
  })()`);

  await waitFor(cdp, sessionId, `location.href.indexOf('/user/login') === -1 || !!document.body.innerText.match(/登录成功|修改密码|首页|数据看板|智能分析|平台管理/)`, 30000);
  await sleep(4000);
  const afterLogin = await collectPage(cdp, sessionId, '01_after_login', '登录后默认页');

  const runtimeState = await evalJson(cdp, sessionId, `(() => {
    const ls = {};
    for (const key of Object.keys(localStorage)) {
      if (/token|password|secret|key/i.test(key)) ls[key] = '[redacted]';
      else ls[key] = localStorage.getItem(key)?.slice(0, 1000);
    }
    const ss = {};
    for (const key of Object.keys(sessionStorage)) {
      if (/token|password|secret|key/i.test(key)) ss[key] = '[redacted]';
      else ss[key] = sessionStorage.getItem(key)?.slice(0, 1000);
    }
    return { localStorage: ls, sessionStorage: ss };
  })()`);
  await writeFile(path.join(rawDir, 'browser_storage_redacted.json'), JSON.stringify(runtimeState, null, 2), 'utf8');

  const menuApi = await evalJson(cdp, sessionId, `async () => {
    const urls = ['/mc/menu/settings', '/list_api/fast_app', '/list_api/cockpit', '/mc/install_app_config', '/platform/module-switches'];
    const out = {};
    for (const url of urls) {
      try {
        const res = await fetch(url, { credentials: 'include' });
        const text = await res.text();
        out[url] = { status: res.status, ok: res.ok, text: text.slice(0, 30000) };
      } catch (err) {
        out[url] = { error: String(err) };
      }
    }
    return out;
  }`);
  await writeFile(path.join(rawDir, 'post_login_api_probe.json'), JSON.stringify(menuApi, null, 2), 'utf8');

  const menuCandidates = await evalJson(cdp, sessionId, `(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    return Array.from(document.querySelectorAll('a, button, [role="menuitem"], .custom-light-menu-item, .ant-menu-item, .app-list-item, [class*="menu"]'))
      .filter(visible)
      .map((el, idx) => {
        const r = el.getBoundingClientRect();
        return {
          idx,
          tag: el.tagName,
          text: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim(),
          href: el.href || el.getAttribute('href') || '',
          cls: String(el.className || '').slice(0, 180),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        };
      })
      .filter(x => x.text || x.href)
      .slice(0, 500);
  })()`);
  await writeFile(path.join(rawDir, 'menu_candidates_after_login.json'), JSON.stringify(menuCandidates, null, 2), 'utf8');

  // Try known routes from the main shell. Even when a route is protected, the
  // captured page reveals menu highlighting, redirects, empty states, and loaded micro-apps.
  const knownRoutes = [
    ['data_dashboard', '/app/cockpit/#/cockpit'],
    ['business_overview', '/app/business_overview/#/business-overview'],
    ['alarm_img_wall', '/app/alarm_img_wall/'],
    ['video_analysis', '/app/video_analysis/#/video-analysis'],
    ['image_analysis', '/app/image_analysis/#/image-analysis'],
    ['universal_video_input', '/app/universal_video_input/#/universal-video-input'],
    ['algo_info', '/app/algo_info/#/algo-info'],
    ['executive_service', '/app/executive_service/#/executive-service'],
    ['push_callback', '/app/push_callback/#/push-callback'],
    ['algo_log', '/app/algo_log/#/algo-log'],
    ['algo_store', '/app/algo_store/#/algo-store'],
    ['face', '/app/face/#/face'],
    ['algo_base_library', '/app/algo_base_library/#/algo-base-library'],
    ['open_center', '/app/open_center/#/open-center'],
    ['ai_warehouse_management', '/app/ai_warehouse_management/#/ai-warehouse-management'],
    ['system_setting', '/app/system_setting/#/system-setting'],
    ['user_permission', '/app/user_permission/#/user-permission'],
    ['menu_setting', '/app/menu_setting/#/menu-setting'],
  ];
  const pages = [afterLogin];
  for (const [key, route] of knownRoutes) {
    const url = new URL(route, baseUrl).href;
    await cdp.send('Page.navigate', { url }, sessionId);
    await waitFor(cdp, sessionId, `document.readyState === 'complete'`, 20000);
    await sleep(4500);
    pages.push(await collectPage(cdp, sessionId, `route_${key}`, route));
  }
  await writeFile(path.join(rawDir, 'collected_pages_index.json'), JSON.stringify(pages, null, 2), 'utf8');
  await writeFile(path.join(rawDir, 'network_summary.json'), JSON.stringify(await getNetworkSummary(cdp), null, 2), 'utf8');

  cdp.close();
  chrome.kill();
  if (stderr.length) {
    await writeFile(path.join(rawDir, 'chrome_stderr.log'), stderr.join('\n'), 'utf8');
  }
}

main().catch(async (err) => {
  await writeFile(path.join(rawDir, 'cdp_collect_error.log'), err.stack || String(err), 'utf8').catch(() => {});
  console.error(err.stack || err);
  process.exitCode = 1;
});
