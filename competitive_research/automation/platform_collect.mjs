import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outRoot = path.join(root, 'competitive_research');
const shotDir = path.join(outRoot, 'screenshots');
const rawDir = path.join(outRoot, 'raw');
const pageDir = path.join(rawDir, 'platform_pages');
const profileDir = path.join(outRoot, 'chrome_profile_platform');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = 'http://192.168.11.88:8081/';
const port = 9240;
const username = process.env.CR_RESEARCH_USER || 'admin';
const password = process.env.CR_RESEARCH_PASS;
if (!password) throw new Error('Set CR_RESEARCH_PASS before running this script.');

await mkdir(shotDir, { recursive: true });
await mkdir(pageDir, { recursive: true });
await mkdir(profileDir, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const safe = (s) => String(s || 'page').replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '_').replace(/\s+/g, '_').slice(0, 120);
async function waitJson(url) {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
    await sleep(250);
  }
  throw new Error(`Cannot connect ${url}`);
}
class Cdp {
  constructor(ws) { this.wsUrl = ws; this.id = 0; this.pending = new Map(); this.events = []; }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('ws timeout')), 10000);
      this.ws.addEventListener('open', () => { clearTimeout(t); res(); }, { once: true });
      this.ws.addEventListener('error', e => { clearTimeout(t); rej(e.error || new Error('ws error')); }, { once: true });
    });
    this.ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result || {});
      } else this.events.push(m);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    this.ws.send(JSON.stringify(msg));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout ${method}`));
        }
      }, 30000);
    });
  }
  close() { try { this.ws.close(); } catch {} }
}
async function evalJson(cdp, sid, expression, timeout = 30000) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout }, sid);
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
async function waitFor(cdp, sid, expression, timeout = 20000) {
  const st = Date.now();
  while (Date.now() - st < timeout) {
    try { if (await evalJson(cdp, sid, expression, 2000)) return; } catch {}
    await sleep(350);
  }
  throw new Error(`wait timeout ${expression}`);
}
async function shot(cdp, sid, name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true }, sid);
  const file = path.join(shotDir, `${safe(name)}.png`);
  await writeFile(file, Buffer.from(r.data, 'base64'));
  return path.relative(outRoot, file).replaceAll('\\', '/');
}
async function collect(cdp, sid, name, note) {
  await sleep(1200);
  const d = await evalJson(cdp, sid, `(() => {
    const q = s => Array.from(document.querySelectorAll(s));
    const vis = el => { const r=el.getBoundingClientRect(), st=getComputedStyle(el); return r.width>0&&r.height>0&&st.display!=='none'&&st.visibility!=='hidden'; };
    const tx = el => (el.innerText||el.textContent||'').replace(/\\s+/g,' ').trim();
    const ser = (el, idx) => { const r=el.getBoundingClientRect(); return {idx, tag:el.tagName, text:tx(el), placeholder:el.getAttribute('placeholder')||'', cls:String(el.className||'').slice(0,200), rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}}; };
    return {
      note:${JSON.stringify(note)},
      title:document.title,
      url:location.href,
      bodyText:(document.body.innerText||'').replace(/\\n{3,}/g,'\\n\\n').slice(0,40000),
      menus:q('.app-menu-item,.app-menu-text,[class*="menu"],[role="menuitem"]').filter(vis).map(ser).filter(x=>x.text).slice(0,200),
      controls:q('button,input,textarea,select,[role="button"],.cr-btn,.custom-light-btn,.ant-btn').filter(vis).map(ser).filter(x=>x.text||x.placeholder).slice(0,200),
      tables:q('table,.custom-light-table,.ant-table,.el-table').filter(vis).map((el,idx)=>({idx,text:tx(el).slice(0,5000),headers:Array.from(el.querySelectorAll('th')).map(tx).filter(Boolean)})),
      cards:q('.app-list-item,[class*="card"],[class*="overview"]').filter(vis).map(ser).filter(x=>x.text).slice(0,100)
    };
  })()`);
  d.screenshot = await shot(cdp, sid, name);
  await writeFile(path.join(pageDir, `${safe(name)}.json`), JSON.stringify(d, null, 2), 'utf8');
  return d;
}
async function login(cdp, sid) {
  await cdp.send('Page.navigate', { url: baseUrl }, sid);
  await waitFor(cdp, sid, `document.readyState === 'complete'`, 20000);
  await waitFor(cdp, sid, `!!document.querySelector('#form_item_username')`, 20000);
  await evalJson(cdp, sid, `(() => {
    function setVal(sel,val){const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
    setVal('#form_item_username',${JSON.stringify(username)}); setVal('#form_item_password',${JSON.stringify(password)}); document.querySelector('button[type=submit],.login-btn-wrap button').click();
  })()`);
  await waitFor(cdp, sid, `!!localStorage.getItem('token') && location.href.indexOf('/user/login') === -1`, 30000);
  await sleep(5000);
}
async function clickExact(cdp, sid, text) {
  return await evalJson(cdp, sid, `(() => {
    const text=${JSON.stringify(text)};
    const vis=el=>{const r=el.getBoundingClientRect(), st=getComputedStyle(el); return r.width>0&&r.height>0&&st.display!=='none'&&st.visibility!=='hidden';};
    const els=Array.from(document.querySelectorAll('.app-menu-item,.app-menu-text,[class*="menu"],button,[role="button"],div,span,a')).filter(vis).filter(el=>(el.innerText||el.textContent||'').replace(/\\s+/g,'')===text.replace(/\\s+/g,''));
    const el=els.sort((a,b)=>{const ar=a.getBoundingClientRect(), br=b.getBoundingClientRect(); return ar.width*ar.height-br.width*br.height;})[0];
    if(!el) return false; el.click(); return true;
  })()`);
}
async function main() {
  const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--disable-gpu', '--no-sandbox', '--window-size=1440,1000', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] });
  const version = await waitJson(`http://127.0.0.1:${port}/json/version`);
  const cdp = new Cdp(version.webSocketDebuggerUrl);
  await cdp.connect();
  const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId); await cdp.send('Runtime.enable', {}, sessionId); await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await login(cdp, sessionId);
  await clickExact(cdp, sessionId, '平台管理');
  await sleep(4000);
  const results = [];
  results.push(await collect(cdp, sessionId, 'module_平台管理', '点击平台管理一级模块'));
  const candidates = ['用户权限', '系统设置', '菜单设置', '运维中心', '算法商店', '开放能力', '快捷应用', '应用中心', '平台管理'];
  for (const text of candidates) {
    const ok = await clickExact(cdp, sessionId, text);
    await sleep(2500);
    if (ok) results.push(await collect(cdp, sessionId, `submenu_平台管理_${text}`, `平台管理子项：${text}`));
  }
  await writeFile(path.join(pageDir, 'platform_collection_index.json'), JSON.stringify(results, null, 2), 'utf8');
  await writeFile(path.join(pageDir, 'network_summary_platform.json'), JSON.stringify(cdp.events.filter(e => e.method && e.method.startsWith('Network.')).slice(-2000), null, 2), 'utf8');
  cdp.close(); chrome.kill();
}
main().catch(async e => {
  await writeFile(path.join(pageDir, 'platform_collect_error.log'), e.stack || String(e), 'utf8').catch(() => {});
  console.error(e.stack || e);
  process.exitCode = 1;
});
