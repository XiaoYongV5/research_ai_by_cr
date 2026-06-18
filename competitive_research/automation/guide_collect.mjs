import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outRoot = path.join(root, 'competitive_research');
const shotDir = path.join(outRoot, 'screenshots');
const rawDir = path.join(outRoot, 'raw');
const guideDir = path.join(rawDir, 'guide');
const profileDir = path.join(outRoot, 'chrome_profile_guide');
const baseUrl = 'http://192.168.11.88:8081/';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9239;
const username = process.env.CR_RESEARCH_USER || 'admin';
const password = process.env.CR_RESEARCH_PASS;
if (!password) throw new Error('Set CR_RESEARCH_PASS before running this script.');

await mkdir(shotDir, { recursive: true });
await mkdir(guideDir, { recursive: true });
await mkdir(profileDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safe = (s) => String(s || 'guide').replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '_').replace(/\s+/g, '_').slice(0, 120);

async function waitForJson(url, timeout = 15000) {
  const start = Date.now();
  let err;
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      err = new Error(`HTTP ${res.status}`);
    } catch (e) { err = e; }
    await sleep(250);
  }
  throw err || new Error(`Timeout ${url}`);
}

class Cdp {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 0; this.pending = new Map(); this.events = []; }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket timeout')), 10000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', e => { clearTimeout(timer); reject(e.error || new Error('WebSocket error')); }, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result || {});
      } else this.events.push(msg);
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
  const res = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout }, sessionId);
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result?.value;
}

async function waitFor(cdp, sessionId, expression, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const v = await evalJson(cdp, sessionId, expression, 2000);
      if (v) return v;
    } catch {}
    await sleep(350);
  }
  throw new Error(`Timeout waiting for ${expression}`);
}

async function shot(cdp, sessionId, name) {
  const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true }, sessionId);
  const file = path.join(shotDir, `${safe(name)}.png`);
  await writeFile(file, Buffer.from(res.data, 'base64'));
  return path.relative(outRoot, file).replaceAll('\\', '/');
}

async function collect(cdp, sessionId, name, note) {
  await sleep(800);
  const data = await evalJson(cdp, sessionId, `(() => {
    const all = (sel) => Array.from(document.querySelectorAll(sel));
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const text = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    const serialize = (el, idx) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        idx,
        tag: el.tagName,
        text: text(el),
        cls: String(el.className || '').slice(0, 260),
        id: el.id || '',
        role: el.getAttribute('role') || '',
        aria: el.getAttribute('aria-label') || '',
        src: el.getAttribute('src') || '',
        href: el.href || el.getAttribute('href') || '',
        zIndex: s.zIndex,
        position: s.position,
        display: s.display,
        bg: s.backgroundColor,
        opacity: s.opacity,
        borderRadius: s.borderRadius,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      };
    };
    const overlays = all('body *')
      .filter(visible)
      .map(serialize)
      .filter(x => x.text.includes('欢迎使用人工智能推理平台') || x.text.includes('开始配置') || /modal|dialog|mask|guide|popup|wrapper-card|theme-bg-mask|login-page-layout/i.test(x.cls))
      .slice(0, 120);
    const buttons = all('button,[role="button"],.custom-light-modal-close,.ant-modal-close,.el-dialog__headerbtn')
      .filter(visible).map(serialize).filter(x => x.text || x.aria || /close|btn|button/i.test(x.cls));
    const images = all('img, [style*="background-image"]')
      .filter(visible).map(serialize).filter(x => x.src || x.text || x.rect.w > 100);
    const scripts = Array.from(document.scripts).map(s => s.src).filter(Boolean);
    return {
      note: ${JSON.stringify(note)},
      title: document.title,
      url: location.href,
      bodyText: (document.body.innerText || '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 30000),
      overlays,
      buttons,
      images,
      localStorageKeys: Object.keys(localStorage),
      scripts,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    };
  })()`);
  data.screenshot = await shot(cdp, sessionId, name);
  await writeFile(path.join(guideDir, `${safe(name)}.json`), JSON.stringify(data, null, 2), 'utf8');
  return data;
}

async function login(cdp, sessionId) {
  await cdp.send('Page.navigate', { url: baseUrl }, sessionId);
  await waitFor(cdp, sessionId, `document.readyState === 'complete'`, 20000);
  await waitFor(cdp, sessionId, `!!document.querySelector('#form_item_username')`, 20000);
  await evalJson(cdp, sessionId, `(() => {
    function setValue(selector, value) {
      const el = document.querySelector(selector);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
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
  const states = [];
  states.push(await collect(cdp, sessionId, 'guide_01_initial_modal', '登录后首次展示的新手引导弹窗'));

  const clickStart = await evalJson(cdp, sessionId, `(() => {
    const btn = Array.from(document.querySelectorAll('button,[role="button"],.cr-btn')).find(el => /开始配置/.test(el.innerText || el.textContent || ''));
    if (!btn) return { ok: false, reason: 'start button not found' };
    const r = btn.getBoundingClientRect();
    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    btn.click();
    return { ok: true, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, text: btn.innerText || btn.textContent };
  })()`);
  await sleep(4000);
  states.push({ clickAction: '开始配置', result: clickStart, page: await collect(cdp, sessionId, 'guide_02_after_start_config', '点击开始配置后的页面/弹层') });

  await cdp.send('Page.navigate', { url: 'http://192.168.11.88:8081/app/main-app/frame' }, sessionId);
  await waitFor(cdp, sessionId, `document.readyState === 'complete'`, 15000);
  await sleep(3500);
  states.push(await collect(cdp, sessionId, 'guide_03_after_reload_frame', '返回主框架后弹窗是否复现'));

  const closeResult = await evalJson(cdp, sessionId, `(() => {
    const candidates = Array.from(document.querySelectorAll('button,[role="button"],.custom-light-modal-close,.ant-modal-close,.el-dialog__headerbtn,div,span'))
      .filter(el => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
      })
      .filter(el => /×|关闭|close/i.test(el.innerText || el.textContent || el.getAttribute('aria-label') || el.className || ''));
    const el = candidates.sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height) - (b.getBoundingClientRect().width * b.getBoundingClientRect().height))[0];
    if (!el) return { ok: false, reason: 'close not found' };
    const r = el.getBoundingClientRect();
    el.click();
    return { ok: true, text: el.innerText || el.textContent || '', cls: String(el.className || ''), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  })()`);
  await sleep(1200);
  states.push({ clickAction: '关闭按钮', result: closeResult, page: await collect(cdp, sessionId, 'guide_04_after_close', '点击关闭后的看板页面') });

  await writeFile(path.join(guideDir, 'guide_collection_index.json'), JSON.stringify(states, null, 2), 'utf8');
  await writeFile(path.join(guideDir, 'network_summary_guide.json'), JSON.stringify(cdp.events.filter(e => e.method && e.method.startsWith('Network.')).slice(-2000), null, 2), 'utf8');
  if (stderr.length) await writeFile(path.join(guideDir, 'chrome_stderr_guide.log'), stderr.join('\n'), 'utf8');
  cdp.close();
  chrome.kill();
}

main().catch(async err => {
  await writeFile(path.join(guideDir, 'guide_collect_error.log'), err.stack || String(err), 'utf8').catch(() => {});
  console.error(err.stack || err);
  process.exitCode = 1;
});
