import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outRoot = path.join(root, 'competitive_research');
const shotDir = path.join(outRoot, 'screenshots');
const rawDir = path.join(outRoot, 'raw');
const clickDir = path.join(rawDir, 'click_pages');
const profileDir = path.join(outRoot, 'chrome_profile_click');
const baseUrl = 'http://192.168.11.88:8081/';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9238;
const username = process.env.CR_RESEARCH_USER || 'admin';
const password = process.env.CR_RESEARCH_PASS;
if (!password) throw new Error('Set CR_RESEARCH_PASS before running this script.');

await mkdir(shotDir, { recursive: true });
await mkdir(clickDir, { recursive: true });
await mkdir(profileDir, { recursive: true });

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function safeName(text) {
  return String(text || 'page').trim().replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '_').replace(/\s+/g, '_').slice(0, 120) || 'page';
}

async function waitForJson(url, timeoutMs = 15000) {
  const start = Date.now();
  let err;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      err = new Error(`HTTP ${res.status}`);
    } catch (e) { err = e; }
    await sleep(250);
  }
  throw err || new Error(`Timeout: ${url}`);
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
      const timer = setTimeout(() => reject(new Error('WebSocket timeout')), 10000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', (event) => { clearTimeout(timer); reject(event.error || new Error('WebSocket error')); }, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result || {});
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
  close() { try { this.ws.close(); } catch {} }
}

async function evalJson(cdp, sessionId, expression, timeout = 30000) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  }, sessionId);
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result?.value;
}

async function waitFor(cdp, sessionId, expression, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await evalJson(cdp, sessionId, expression, 2000);
      if (v) return v;
    } catch {}
    await sleep(400);
  }
  throw new Error(`Timeout waiting for ${expression}`);
}

async function screenshot(cdp, sessionId, name) {
  const res = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true,
  }, sessionId);
  const file = path.join(shotDir, `${safeName(name)}.png`);
  await writeFile(file, Buffer.from(res.data, 'base64'));
  return path.relative(outRoot, file).replaceAll('\\', '/');
}

async function collect(cdp, sessionId, name, note = '') {
  await sleep(1000);
  const info = await evalJson(cdp, sessionId, `(() => {
    const all = (sel) => Array.from(document.querySelectorAll(sel));
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const txt = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    const item = (el, idx) => {
      const r = el.getBoundingClientRect();
      return {
        idx,
        tag: el.tagName,
        text: txt(el),
        placeholder: el.getAttribute('placeholder') || '',
        title: el.getAttribute('title') || '',
        href: el.href || el.getAttribute('href') || '',
        cls: String(el.className || '').slice(0, 220),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      };
    };
    const menus = all('.app-menu-item, .app-menu-text, .custom-light-menu-item, .ant-menu-item, [role="menuitem"], [class*="menu-item"], [class*="app-list-item"]')
      .filter(visible).map(item).filter(x => x.text || x.href);
    const controls = all('button,input,textarea,select,[role="button"],.cr-btn,.custom-light-btn,.ant-btn,.el-button')
      .filter(visible).map(item).filter(x => x.text || x.placeholder || x.title);
    const tables = all('table,.custom-light-table,.ant-table,.el-table')
      .filter(visible).map((el, idx) => ({ idx, text: txt(el).slice(0, 5000), headers: Array.from(el.querySelectorAll('th')).map(txt).filter(Boolean) }));
    const forms = all('form,.custom-light-form,.ant-form,.el-form')
      .filter(visible).map((el, idx) => ({ idx, text: txt(el).slice(0, 3000), inputs: Array.from(el.querySelectorAll('input,textarea,select')).map((x) => ({ placeholder: x.getAttribute('placeholder') || '', value: x.value || '', type: x.type || x.tagName })) }));
    const cards = all('.app-list-item,.card,.ant-card,.el-card,[class*="card"],[class*="overview"],[class*="stat"]')
      .filter(visible).map((el, idx) => ({ idx, text: txt(el).slice(0, 1500), cls: String(el.className || '').slice(0, 180) })).filter(x => x.text);
    return {
      note: ${JSON.stringify(note)},
      title: document.title,
      url: location.href,
      path: location.pathname + location.search + location.hash,
      bodyText: (document.body.innerText || '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 40000),
      menus,
      controls,
      tables,
      forms,
      cards,
    };
  })()`);
  info.screenshot = await screenshot(cdp, sessionId, name);
  await writeFile(path.join(clickDir, `${safeName(name)}.json`), JSON.stringify(info, null, 2), 'utf8');
  return info;
}

async function login(cdp, sessionId) {
  await cdp.send('Page.navigate', { url: baseUrl }, sessionId);
  await waitFor(cdp, sessionId, `document.readyState === 'complete'`, 20000);
  await waitFor(cdp, sessionId, `!!document.querySelector('#form_item_username')`, 20000);
  await evalJson(cdp, sessionId, `(() => {
    function setValue(selector, value) {
      const el = document.querySelector(selector);
      const proto = HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    setValue('#form_item_username', ${JSON.stringify(username)});
    setValue('#form_item_password', ${JSON.stringify(password)});
    document.querySelector('button[type=submit], .login-btn-wrap button').click();
  })()`);
  await waitFor(cdp, sessionId, `!!localStorage.getItem('token') && location.href.indexOf('/user/login') === -1`, 30000);
  await sleep(5000);
  await evalJson(cdp, sessionId, `(() => {
    const close = Array.from(document.querySelectorAll('button,[role="button"],.custom-light-modal-close,.ant-modal-close,.el-dialog__headerbtn,.guide-close'))
      .find(el => /×|关闭|close/i.test(el.innerText || el.textContent || el.getAttribute('aria-label') || el.className || ''));
    if (close) close.click();
    const x = document.elementFromPoint(997, 321);
    if (x && (x.innerText === '×' || x.textContent === '×')) x.click();
    return true;
  })()`);
  await sleep(1200);
}

async function clickText(cdp, sessionId, text, name) {
  const clicked = await evalJson(cdp, sessionId, `(() => {
    const targetText = ${JSON.stringify(text)};
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const candidates = Array.from(document.querySelectorAll('.app-menu-item,.app-menu-text,button,[role="button"],[class*="menu"],[class*="app-list-item"],a,div,span'))
      .filter(visible)
      .filter(el => (el.innerText || el.textContent || '').replace(/\\s+/g, '').includes(targetText.replace(/\\s+/g, '')));
    const el = candidates.sort((a,b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      return (ar.width*ar.height) - (br.width*br.height);
    })[0];
    if (!el) return { ok: false, reason: 'not found', text: targetText };
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    el.click();
    return { ok: true, text: targetText, cls: String(el.className || ''), rect: { x:r.x, y:r.y, w:r.width, h:r.height } };
  })()`);
  await sleep(2500);
  return { clicked, page: await collect(cdp, sessionId, name, `点击 ${text}`) };
}

async function main() {
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1000',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const stderr = [];
  chrome.stderr.on('data', d => stderr.push(String(d).trim()));
  const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const cdp = new Cdp(version.webSocketDebuggerUrl);
  await cdp.connect();
  const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await login(cdp, sessionId);

  const results = [];
  results.push(await collect(cdp, sessionId, 'click_00_home_closed_guide', '登录后关闭新手引导'));

  for (const moduleName of ['数据看板', '智能分析', '数据中心', '平台管理']) {
    results.push(await clickText(cdp, sessionId, moduleName, `module_${moduleName}`));
    // Capture any visible application tiles after the first click.
    const tiles = await evalJson(cdp, sessionId, `(() => Array.from(document.querySelectorAll('.app-list-item,[class*="app-list-item"],[class*="menu"]'))
      .map((el, idx) => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        return { idx, text: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim(), visible: r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cls: String(el.className || '').slice(0, 120) };
      }).filter(x => x.visible && x.text).slice(0, 200))()`);
    await writeFile(path.join(clickDir, `${safeName(`tiles_${moduleName}`)}.json`), JSON.stringify(tiles, null, 2), 'utf8');
    const actionableTiles = tiles
      .filter(t => t.text && t.text !== moduleName && !['数据看板', '智能分析', '数据中心', '平台管理'].includes(t.text))
      .slice(0, 18);
    for (const tile of actionableTiles) {
      if (tile.text.length > 30) continue;
      results.push(await clickText(cdp, sessionId, tile.text, `submenu_${moduleName}_${tile.text}`));
      // Navigate home frame to reset module selection context.
      await cdp.send('Page.navigate', { url: 'http://192.168.11.88:8081/app/main-app/frame' }, sessionId);
      await waitFor(cdp, sessionId, `document.readyState === 'complete'`, 15000);
      await sleep(2500);
      await evalJson(cdp, sessionId, `(() => { const el = Array.from(document.querySelectorAll('.custom-light-modal-close,.ant-modal-close,.el-dialog__headerbtn,button')).find(e => /×|关闭|close/i.test(e.innerText || e.textContent || e.className || '')); if(el) el.click(); return true; })()`);
      await sleep(600);
      await clickText(cdp, sessionId, moduleName, `module_${moduleName}_reset`);
    }
  }
  await writeFile(path.join(clickDir, 'click_collection_index.json'), JSON.stringify(results, null, 2), 'utf8');
  await writeFile(path.join(clickDir, 'network_summary_click.json'), JSON.stringify(cdp.events.filter(e => e.method && e.method.startsWith('Network.')).slice(-3000), null, 2), 'utf8');
  if (stderr.length) await writeFile(path.join(clickDir, 'chrome_stderr_click.log'), stderr.join('\n'), 'utf8');
  cdp.close();
  chrome.kill();
}

main().catch(async err => {
  await mkdir(clickDir, { recursive: true }).catch(() => {});
  await writeFile(path.join(clickDir, 'click_collect_error.log'), err.stack || String(err), 'utf8').catch(() => {});
  console.error(err.stack || err);
  process.exitCode = 1;
});
