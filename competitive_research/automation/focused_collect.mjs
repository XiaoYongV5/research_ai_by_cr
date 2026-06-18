import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outRoot = path.join(root, 'competitive_research');
const shotRoot = path.join(outRoot, 'screenshots_focused');
const rawDir = path.join(outRoot, 'raw', 'focused_interactions');
const profileDir = path.join(outRoot, 'chrome_profile_focused');
const baseUrl = 'http://192.168.11.88:8081/';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.CR_RESEARCH_PORT || 9265);
const username = process.env.CR_RESEARCH_USER || 'admin';
const password = process.env.CR_RESEARCH_PASS;

if (!password) throw new Error('Set CR_RESEARCH_PASS before running this script.');

const scopeArg = (process.argv.find((arg) => arg.startsWith('--scope=')) || '--scope=all').split('=')[1];

const modules = {
  dashboard: { title: '数据看板', folder: '01_dashboard' },
  smart: { title: '智能分析', folder: '02_smart_analysis' },
  data: { title: '数据中心', folder: '03_data_center' },
  platform: { title: '平台管理', folder: '04_platform_management' },
  guide: { title: '新手引导弹窗', folder: '05_guide' },
};

const scenarios = [
  {
    scope: 'dashboard',
    module: 'dashboard',
    submodule: '数据看板首页',
    url: new URL('/app/main-app/cockpit/home/#/cockpit-home', baseUrl).href,
    tabTexts: ['实时视频监控', '业务数据概览', '报警图片墙', 'AI智能管控中心'],
    actionTexts: ['创建看板'],
  },
  {
    scope: 'data',
    module: 'data',
    submodule: '报警日志',
    url: new URL('/app/main-app/data/inference-output/algo/#/alarm-center/output-result/algorithm-log', baseUrl).href,
    tabTexts: ['视频流分析', '图片分析', '表格视图', '宫格视图'],
    actionTexts: ['正误报统计', '处理', '归档'],
  },
  {
    scope: 'data',
    module: 'data',
    submodule: '人员识别日志',
    url: new URL('/app/main-app/data/personnel_identification_log/#/personnel_identification_log', baseUrl).href,
    tabTexts: ['白名单', '黑名单'],
    fieldLabels: ['请选择', '请选择日期'],
  },
  {
    scope: 'smart',
    module: 'smart',
    submodule: '算法详情-人员入侵识别',
    url: new URL('/app/main-app/dispatch/pre-processing/algo-info/#/algorithm-dispatch/pre-scheduling/algorithm-list', baseUrl).href,
    enterText: '编辑',
    tabTexts: ['算法信息', '绘制对象管理', '默认绘制样式'],
    tabActions: {
      '算法信息': ['高精度', '均衡', '高检出', '更多阈值', '保存'],
      '绘制对象管理': ['新增', '导入', '编辑', '删除', '保存'],
      '默认绘制样式': ['预览绘制效果', '重置样式', '保存'],
    },
  },
  {
    scope: 'smart',
    module: 'smart',
    submodule: '视频流分析详情',
    url: new URL('/app/main-app/dispatch/task/video-analysis/#/algorithm-dispatch/schedule-tasks/video-stream-analysis', baseUrl).href,
    enterText: '详情',
    tabTexts: ['选择摄像头与算法', '配置任务', '查看报警'],
    actionTexts: ['启用'],
  },
  {
    scope: 'smart',
    module: 'smart',
    submodule: '创建视频分析任务',
    url: new URL('/app/main-app/dispatch/task/video-analysis/#/algorithm-dispatch/schedule-tasks/video-stream-analysis', baseUrl).href,
    openText: '创建视频分析任务',
    tabTexts: ['实时分析', '轮巡分析'],
    actionTexts: ['保存', '取消'],
  },
  {
    scope: 'smart',
    module: 'smart',
    submodule: '图片分析详情',
    url: new URL('/app/main-app/dispatch/task/img-analysis/#/algorithm-dispatch/schedule-tasks/picture-analysis', baseUrl).href,
    enterText: '详情',
    tabTexts: ['配置算法', '配置任务', '查看报警'],
  },
  {
    scope: 'smart',
    module: 'smart',
    submodule: '报警推送创建',
    url: new URL('/app/main-app/dispatch/result-push/callback/#/open-ability/alarm-push/callback-output', baseUrl).href,
    openText: '创建推送',
    tabTexts: ['基础信息', '视频流分析场景', '图片分析场景', 'base64', '对象存储', '本地链接', '预览', '编辑'],
    actionTexts: ['保存', '取消'],
  },
  {
    scope: 'smart',
    module: 'smart',
    submodule: '报警弹窗及语音',
    url: new URL('/app/main-app/dispatch/result-push/modal-voice/#/modal-voice', baseUrl).href,
    tabTexts: ['一级', '二级', '三级', '试听', '替换', '恢复默认', '编辑'],
  },
  {
    scope: 'platform',
    module: 'platform',
    submodule: '离线仓库',
    url: new URL('/app/main-app/platform/store/algo-store/#/algorithm-store', baseUrl).href,
    tabTexts: ['算法', '解决方案'],
    actionTexts: ['上传', '一键全部安装'],
  },
  {
    scope: 'platform',
    module: 'platform',
    submodule: '基础信息',
    url: new URL('/app/main-app/platform/system/base-info/#/base-info', baseUrl).href,
    tabTexts: ['界面配置', '系统配置', '系统版本'],
    actionTexts: ['上 传', '同步本机时间'],
  },
  {
    scope: 'platform',
    module: 'platform',
    submodule: '系统主题',
    url: new URL('/app/main-app/platform/system/theme/#/theme', baseUrl).href,
    tabTexts: ['极光', '绽放蓝', '金属暖黑', '深海蓝'],
    actionTexts: ['使 用'],
  },
  {
    scope: 'platform',
    module: 'platform',
    submodule: '站内信',
    url: new URL('/app/main-app/data/inter-message', baseUrl).href,
    tabTexts: ['全部', '已读消息', '未读消息'],
    actionTexts: ['全部标记已读'],
  },
  {
    scope: 'platform',
    module: 'platform',
    submodule: '对象存储',
    url: new URL('/app/main-app/open-center/object-storage/#/object_storage', baseUrl).href,
    openText: '创建对象存储',
    tabTexts: ['阿里云 OSS', '联通测试'],
    actionTexts: ['保存', '取消'],
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function safeName(text, fallback = 'item') {
  return String(text || fallback)
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 90) || fallback;
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
    await sleep(250);
  }
  throw lastErr || new Error(`Timed out waiting for ${url}`);
}

class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
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
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result || {});
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
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result?.value;
}

async function waitFor(cdp, sessionId, expression, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await evalJson(cdp, sessionId, expression, 2000);
      if (value) return value;
    } catch {}
    await sleep(350);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

const records = [];
const counters = new Map();

function isUnsafeAction(text) {
  return /保存|删除|一键全部安装|全部安装|立即安装|卸载|清空|清理|提交|确认|同步本机时间|使\s*用|全部标记已读|恢复默认|归档/i.test(String(text || ''));
}

async function getBusinessClip(cdp, sessionId) {
  const clip = await evalJson(cdp, sessionId, `(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const modal = Array.from(document.querySelectorAll('.custom-light-modal,.ant-modal,.el-dialog,[role="dialog"],.custom-light-drawer,.ant-drawer'))
      .filter(visible)
      .sort((a,b) => {
        const ar=a.getBoundingClientRect(), br=b.getBoundingClientRect();
        return br.width*br.height - ar.width*ar.height;
      })[0];
    if (modal) {
      const r = modal.getBoundingClientRect();
      return {
        kind: 'overlay',
        x: Math.max(0, Math.floor(r.x - 12)),
        y: Math.max(0, Math.floor(r.y - 12)),
        width: Math.min(innerWidth - Math.max(0, Math.floor(r.x - 12)), Math.ceil(r.width + 24)),
        height: Math.min(innerHeight - Math.max(0, Math.floor(r.y - 12)), Math.ceil(r.height + 24)),
        scale: 1
      };
    }
    const content = Array.from(document.querySelectorAll('main,.custom-light-layout-content,.ant-layout-content,.page-content,.content,[class*="content"],body'))
      .filter(visible)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 500 && x.r.height > 300)
      .sort((a,b) => (a.r.x - b.r.x) || (b.r.width*b.r.height - a.r.width*a.r.height))[0];
    const left = Math.max(280, content ? Math.floor(content.r.x) : 280);
    const top = Math.max(72, content ? Math.floor(content.r.y) : 72);
    return {
      kind: 'business',
      x: left,
      y: top,
      width: Math.max(400, Math.min(innerWidth - left, innerWidth - left)),
      height: Math.max(300, Math.min(innerHeight - top, innerHeight - top)),
      scale: 1
    };
  })()`, 5000);
  clip.width = Math.max(1, Math.floor(clip.width));
  clip.height = Math.max(1, Math.floor(clip.height));
  return clip;
}

async function screenshot(cdp, sessionId, scenario, label, note = '', meta = {}) {
  const mod = modules[scenario.module];
  const folder = path.join(shotRoot, mod.folder);
  await mkdir(folder, { recursive: true });
  const next = (counters.get(mod.folder) || 0) + 1;
  counters.set(mod.folder, next);
  const clip = await getBusinessClip(cdp, sessionId).catch(() => ({ x: 280, y: 44, width: 1160, height: 900, scale: 1, kind: 'fallback' }));
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip }, sessionId);
  const file = path.join(folder, `${String(next).padStart(3, '0')}_${safeName(scenario.submodule)}_${safeName(label)}.png`);
  await writeFile(file, Buffer.from(shot.data, 'base64'));
  const rel = path.relative(outRoot, file).replaceAll('\\', '/');
  const state = await getState(cdp, sessionId).catch(() => ({}));
  const record = {
    id: `${mod.folder}-${String(next).padStart(3, '0')}`,
    module: mod.title,
    moduleId: scenario.module,
    submodule: scenario.submodule,
    label,
    note,
    url: state.url || '',
    screenshot: rel,
    clip,
    meta,
  };
  records.push(record);
  return record;
}

async function getState(cdp, sessionId) {
  return await evalJson(cdp, sessionId, `(() => ({
    url: location.href,
    title: document.title,
    text: (document.body.innerText || '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 20000)
  }))()`, 5000);
}

async function closeOverlays(cdp, sessionId) {
  await evalJson(cdp, sessionId, `(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const norm = (s) => (s || '').replace(/\\s+/g,'').trim();
    const overlaySelectors = [
      '.custom-light-modal', '.ant-modal', '.el-dialog', '[role="dialog"]',
      '.custom-light-drawer', '.ant-drawer',
      '.custom-light-select-dropdown', '.ant-select-dropdown', '.el-select-dropdown',
      '.custom-light-picker-dropdown', '.ant-picker-dropdown', '.el-picker-panel',
      '.custom-light-dropdown', '.ant-dropdown', '.el-dropdown-menu',
      '.custom-light-popover', '.ant-popover', '.el-popover'
    ];
    const overlays = overlaySelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)).filter(visible));
    for (const selector of ['.custom-light-modal-close','.ant-modal-close','.el-dialog__headerbtn','.custom-light-drawer-close','.ant-drawer-close','[aria-label="Close"]']) {
      const el = Array.from(document.querySelectorAll(selector)).reverse().find((node) => visible(node) && overlays.some((overlay) => overlay.contains(node)));
      if (el) { el.click(); return true; }
    }
    if (!overlays.length) return false;
    const btn = overlays.flatMap((overlay) => Array.from(overlay.querySelectorAll('button,[role="button"],span,div')).filter(visible))
      .find((el) => /^(取消|关闭|知道了|×|x)$/i.test(norm(el.innerText || el.textContent || el.getAttribute('aria-label'))));
    if (btn) { btn.click(); return true; }
    return false;
  })()`, 5000).catch(() => false);
  await key(cdp, sessionId, 'Escape').catch(() => {});
  await sleep(450);
}

async function key(cdp, sessionId, keyName) {
  const code = keyName === 'Escape' ? 27 : 0;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code: keyName, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code }, sessionId);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code: keyName, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code }, sessionId);
}

async function clickCenter(cdp, sessionId, rect) {
  const x = Math.round(rect.x + rect.w / 2);
  const y = Math.round(rect.y + rect.h / 2);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
  await sleep(80);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId);
}

async function findText(cdp, sessionId, text) {
  return await evalJson(cdp, sessionId, `(() => {
    const wanted = ${JSON.stringify(text)};
    const norm = (s) => (s || '').replace(/\\s+/g,'').trim();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const candidates = Array.from(document.querySelectorAll('button,[role="button"],[role="tab"],.custom-light-tabs-tab,.ant-tabs-tab,.el-tabs__item,.custom-light-radio-button-wrapper,.custom-light-segmented-item,.custom-light-menu-item,li,a,span,div'))
      .filter(visible)
      .map((el) => {
        const raw = el.innerText || el.textContent || el.getAttribute('title') || el.getAttribute('aria-label') || '';
        const r = el.getBoundingClientRect();
        const tagScore = el.matches('button,[role="button"],[role="tab"],.custom-light-tabs-tab,.ant-tabs-tab,.el-tabs__item,.custom-light-radio-button-wrapper,.custom-light-segmented-item') ? 0
          : el.matches('li,a,span') ? 1 : 2;
        return { el, raw, text: norm(raw), area: r.width*r.height, tagScore, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
      })
      .filter((x) => x.text === norm(wanted) || x.text.includes(norm(wanted)));
    candidates.sort((a,b) => Number(a.text !== norm(wanted)) - Number(b.text !== norm(wanted)) || a.tagScore - b.tagScore || a.area - b.area);
    const item = candidates[0];
    if (!item) return null;
    item.el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = item.el.getBoundingClientRect();
    return { text: item.raw, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, className: String(item.el.className || '').slice(0,160) };
  })()`, 8000);
}

async function hoverText(cdp, sessionId, text) {
  const found = await findText(cdp, sessionId, text);
  if (!found) return { ok: false, text, mode: 'hover' };
  const x = Math.round(found.rect.x + found.rect.w / 2);
  const y = Math.round(found.rect.y + found.rect.h / 2);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
  await sleep(350);
  return { ok: true, text, mode: 'hover', found };
}

async function interactText(cdp, sessionId, text, { allowUnsafe = false } = {}) {
  if (!allowUnsafe && isUnsafeAction(text)) {
    const result = await hoverText(cdp, sessionId, text);
    return { ...result, safeSkipped: true, reason: '可能产生保存、删除、安装、归档或配置变更，仅定位/悬停截图' };
  }
  return await clickText(cdp, sessionId, text);
}

async function clickText(cdp, sessionId, text) {
  const found = await findText(cdp, sessionId, text);
  if (!found) return { ok: false, text };
  await clickCenter(cdp, sessionId, found.rect);
  await sleep(900);
  return { ok: true, text, found };
}

async function navigate(cdp, sessionId, url) {
  await cdp.send('Page.navigate', { url }, sessionId);
  await waitFor(cdp, sessionId, `document.readyState === 'complete'`, 20000).catch(() => {});
  await sleep(3200);
  await closeOverlays(cdp, sessionId);
}

async function login(cdp, sessionId) {
  await navigate(cdp, sessionId, baseUrl);
  const hasLogin = await evalJson(cdp, sessionId, `!!document.querySelector('#form_item_username')`, 5000).catch(() => false);
  if (!hasLogin) return;
  await evalJson(cdp, sessionId, `(() => {
    function setValue(selector, value) {
      const el = document.querySelector(selector);
      if (!el) throw new Error('missing ' + selector);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    setValue('#form_item_username', ${JSON.stringify(username)});
    setValue('#form_item_password', ${JSON.stringify(password)});
    document.querySelector('button[type=submit], .login-btn-wrap button').click();
  })()`);
  await waitFor(cdp, sessionId, `location.href.indexOf('/user/login') === -1 || !!localStorage.getItem('token')`, 30000).catch(() => {});
  await sleep(4000);
  await closeOverlays(cdp, sessionId);
}

async function collectScenario(cdp, sessionId, scenario) {
  await navigate(cdp, sessionId, scenario.url);
  if (scenario.enterText) {
    await screenshot(cdp, sessionId, scenario, `进入前_${scenario.enterText}`, '进入详情或配置前的业务列表局部截图');
    await interactText(cdp, sessionId, scenario.enterText, { allowUnsafe: true });
    await sleep(1800);
  }
  if (scenario.openText) {
    await screenshot(cdp, sessionId, scenario, `打开前_${scenario.openText}`, '打开业务弹窗/抽屉前的列表局部截图');
    await interactText(cdp, sessionId, scenario.openText, { allowUnsafe: true });
    await sleep(1600);
  }
  await screenshot(cdp, sessionId, scenario, '业务区域默认态', '裁剪业务区域，排除顶部公共工具区和左侧一级导航');

  for (const text of scenario.tabTexts || []) {
    const result = await interactText(cdp, sessionId, text, { allowUnsafe: true });
    await sleep(900);
    await screenshot(cdp, sessionId, scenario, `Tab_${text}`, `点击或切换 Tab/分段控件：${text}`, { click: result });
    const actions = scenario.tabActions?.[text] || [];
    for (const action of actions) {
      const actionResult = await interactText(cdp, sessionId, action);
      await sleep(900);
      const safeNote = actionResult.safeSkipped ? '；该操作可能产生数据或配置变更，采集时仅悬停定位' : '';
      await screenshot(cdp, sessionId, scenario, `Tab_${text}_操作_${action}`, `在 ${text} 下点击或定位操作：${action}${safeNote}`, { click: actionResult });
      await closeOverlays(cdp, sessionId);
    }
  }

  for (const text of scenario.actionTexts || []) {
    const result = await interactText(cdp, sessionId, text);
    await sleep(900);
    const safeNote = result.safeSkipped ? '；该操作可能产生数据或配置变更，采集时仅悬停定位' : '';
    await screenshot(cdp, sessionId, scenario, `操作_${text}`, `点击或定位业务操作：${text}${safeNote}`, { click: result });
    await closeOverlays(cdp, sessionId);
  }

  for (const text of scenario.fieldLabels || []) {
    const result = await interactText(cdp, sessionId, text, { allowUnsafe: true });
    await sleep(700);
    await screenshot(cdp, sessionId, scenario, `字段_${text}`, `打开字段或选择器：${text}`, { click: result });
    await closeOverlays(cdp, sessionId);
  }
}

function selectedScenarios() {
  if (scopeArg === 'all') return scenarios;
  return scenarios.filter((scenario) => scenario.scope === scopeArg);
}

async function main() {
  await mkdir(rawDir, { recursive: true });
  for (const mod of Object.values(modules)) await mkdir(path.join(shotRoot, mod.folder), { recursive: true });

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
  chrome.stderr.on('data', (chunk) => stderr.push(String(chunk)));

  const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const cdp = new Cdp(version.webSocketDebuggerUrl);
  await cdp.connect();
  const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('DOM.enable', {}, sessionId);
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);

  try {
    await login(cdp, sessionId);
    for (const scenario of selectedScenarios()) {
      await collectScenario(cdp, sessionId, scenario).catch(async (err) => {
        records.push({
          module: modules[scenario.module].title,
          submodule: scenario.submodule,
          label: '采集异常',
          note: String(err.message || err),
          screenshot: '',
          error: String(err.stack || err),
        });
      });
    }
  } finally {
    await writeFile(path.join(rawDir, `focused_index_${safeName(scopeArg)}.json`), JSON.stringify(records, null, 2), 'utf8');
    await writeFile(path.join(rawDir, `chrome_stderr_${safeName(scopeArg)}.log`), stderr.join('\n'), 'utf8').catch(() => {});
    cdp.close();
    chrome.kill();
  }
  console.log(`focused collection complete: ${records.length} records for scope=${scopeArg}`);
}

main().catch(async (err) => {
  await mkdir(rawDir, { recursive: true }).catch(() => {});
  await writeFile(path.join(rawDir, `focused_error_${safeName(scopeArg)}.log`), err.stack || String(err), 'utf8').catch(() => {});
  console.error(err.stack || err);
  process.exitCode = 1;
});
