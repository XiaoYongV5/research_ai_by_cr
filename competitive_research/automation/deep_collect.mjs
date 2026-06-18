import { spawn } from 'node:child_process';
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outRoot = path.join(root, 'competitive_research');
const shotRoot = path.join(outRoot, 'screenshots_deep');
const rawDir = path.join(outRoot, 'raw', 'deep_interactions');
const profileDir = path.join(outRoot, 'chrome_profile_deep');
const baseUrl = 'http://192.168.11.88:8081/';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.CR_RESEARCH_PORT || 9252);
const username = process.env.CR_RESEARCH_USER || 'admin';
const password = process.env.CR_RESEARCH_PASS;

if (!password) {
  throw new Error('Set CR_RESEARCH_PASS before running this script.');
}

const scopeArg = (process.argv.find((arg) => arg.startsWith('--scope=')) || '--scope=all').split('=')[1];
const maxInteractions = Number((process.argv.find((arg) => arg.startsWith('--max-interactions=')) || '--max-interactions=8').split('=')[1]);

const modules = {
  dashboard: { id: 'dashboard', folder: '01_dashboard', title: '数据看板', entry: '数据看板' },
  smart: { id: 'smart', folder: '02_smart_analysis', title: '智能分析', entry: '智能分析' },
  data: { id: 'data', folder: '03_data_center', title: '数据中心', entry: '数据中心' },
  platform: { id: 'platform', folder: '04_platform_management', title: '平台管理', entry: '平台管理' },
  guide: { id: 'guide', folder: '05_guide', title: '新手引导弹窗', entry: '' },
  common: { id: 'common', folder: '00_common', title: '通用导航与顶部栏', entry: '' },
};

const scenarios = [
  {
    scope: 'dashboard',
    module: 'dashboard',
    submodule: '数据看板首页',
    capability: '看板入口集合、创建看板、实时视频监控、业务数据概览、报警图片墙、AI 管控中心入口',
    url: new URL('/app/main-app/cockpit/home/#/cockpit-home', baseUrl).href,
  },
  {
    scope: 'dashboard',
    module: 'dashboard',
    submodule: 'AI智能管控中心',
    capability: '综合态势大屏、实时监控、报警趋势、排行榜与指挥视角',
    url: new URL('/app/main-app/frame', baseUrl).href,
  },
  {
    scope: 'smart',
    module: 'smart',
    submodule: '摄像头配置',
    capability: '视频源接入、分组管理、导入导出、抓图、批量维护',
    url: new URL('/app/main-app/dispatch/media-input/video-input/#/basic-services/device-service/monitor-point', baseUrl).href,
  },
  {
    scope: 'smart',
    module: 'smart',
    submodule: '算法列表',
    capability: '算法资产检索、虚拟算法创建、统计配置、算法编辑',
    url: new URL('/app/main-app/dispatch/pre-processing/algo-info/#/algorithm-dispatch/pre-scheduling/algorithm-list', baseUrl).href,
  },
  {
    scope: 'smart',
    module: 'smart',
    submodule: '人员库',
    capability: '人员分组、照片入库、特征提取、人员检索',
    url: new URL('/app/main-app/dispatch/dispatch_face/#/face', baseUrl).href,
  },
  { scope: 'smart', module: 'smart', submodule: '算法底库', capability: '算法基础库维护与算法底层资源管理', base: 'smart', menu: '算法底库' },
  { scope: 'smart', module: 'smart', submodule: '视频流分析', capability: '将摄像头与算法组合成实时分析任务', base: 'smart', menu: '视频流分析' },
  { scope: 'smart', module: 'smart', submodule: '图片分析', capability: '图片输入场景下的离线或批量智能分析', base: 'smart', menu: '图片分析' },
  { scope: 'smart', module: 'smart', submodule: '分析服务状态', capability: '分析服务运行状态、健康度与任务执行监控', base: 'smart', menu: '分析服务状态' },
  { scope: 'smart', module: 'smart', submodule: '报警推送', capability: '智能分析结果的外部推送策略配置', base: 'smart', menu: '报警推送' },
  { scope: 'smart', module: 'smart', submodule: '报警弹窗及语音', capability: '报警提示方式、弹窗与语音播报配置', base: 'smart', menu: '报警弹窗及语音' },
  {
    scope: 'data',
    module: 'data',
    submodule: '报警日志',
    capability: '报警检索、处理、归档、导出、推送、正误报统计',
    url: new URL('/app/main-app/data/inference-output/algo/#/alarm-center/output-result/algorithm-log', baseUrl).href,
  },
  {
    scope: 'data',
    module: 'data',
    submodule: '报警推送日志',
    capability: '推送结果审计、失败重推、推送状态与数据 ID 检索',
    url: new URL('/app/main-app/data/inference-output/callback/#/open-ability/alarm-push/push-log', baseUrl).href,
  },
  { scope: 'data', module: 'data', submodule: '人员识别日志', capability: '人员识别结果查询、人员维度追踪与日志审计', base: 'data', menu: '人员识别日志' },
  { scope: 'data', module: 'data', submodule: '陌生人识别日志', capability: '陌生人识别结果查询与异常身份追踪', base: 'data', menu: '陌生人识别日志' },
  {
    scope: 'platform',
    module: 'platform',
    submodule: '离线仓库',
    capability: '离线算法包/解决方案包上传、安装、版本盘点',
    url: new URL('/app/main-app/platform/store/algo-store/#/algorithm-store', baseUrl).href,
  },
  { scope: 'platform', module: 'platform', submodule: '用户管理', capability: '账号创建、用户状态、组织与权限入口', base: 'platform', menu: '用户管理' },
  { scope: 'platform', module: 'platform', submodule: '用户组管理', capability: '角色/用户组分层授权与批量权限治理', base: 'platform', menu: '用户组管理' },
  { scope: 'platform', module: 'platform', submodule: '系统权限', capability: '菜单、按钮、系统能力等权限资源维护', base: 'platform', menu: '系统权限' },
  { scope: 'platform', module: 'platform', submodule: '基础信息', capability: '平台名称、标识与基础展示信息配置', base: 'platform', menu: '基础信息' },
  { scope: 'platform', module: 'platform', submodule: '系统主题', capability: '主题色、品牌皮肤、界面外观配置', base: 'platform', menu: '系统主题' },
  { scope: 'platform', module: 'platform', submodule: '网络配置', capability: '平台部署网络、访问地址和服务连接参数配置', base: 'platform', menu: '网络配置' },
  { scope: 'platform', module: 'platform', submodule: '站内信', capability: '站内消息、系统通知与用户触达', base: 'platform', menu: '站内信' },
  { scope: 'platform', module: 'platform', submodule: '接口授权', capability: '开放 API 调用方、授权凭证和访问控制', base: 'platform', menu: '接口授权' },
  { scope: 'platform', module: 'platform', submodule: '接口文档', capability: '开放接口说明、调用参数与开发者集成指引', base: 'platform', menu: '接口文档' },
  { scope: 'platform', module: 'platform', submodule: '免密登录', capability: '第三方系统免密/单点登录接入配置', base: 'platform', menu: '免密登录' },
  { scope: 'platform', module: 'platform', submodule: '对象存储', capability: '报警截图、录制片段、算法包等文件对象存储配置', base: 'platform', menu: '对象存储' },
];

const baseScenarioUrl = {
  smart: new URL('/app/main-app/dispatch/media-input/video-input/#/basic-services/device-service/monitor-point', baseUrl).href,
  data: new URL('/app/main-app/data/inference-output/algo/#/alarm-center/output-result/algorithm-log', baseUrl).href,
  platform: new URL('/app/main-app/platform/store/algo-store/#/algorithm-store', baseUrl).href,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function safeSegment(text, fallback = 'item') {
  return String(text || fallback)
    .trim()
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 90) || fallback;
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
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

async function waitFor(cdp, sessionId, expression, timeoutMs = 20000, intervalMs = 350) {
  const start = Date.now();
  let lastValue;
  while (Date.now() - start < timeoutMs) {
    try {
      lastValue = await evalJson(cdp, sessionId, expression, intervalMs + 1200);
      if (lastValue) return lastValue;
    } catch {}
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for expression: ${expression}; last=${JSON.stringify(lastValue)}`);
}

const records = [];
const pageStates = [];
const counters = new Map();

async function capture(cdp, sessionId, scenario, action, meta = {}) {
  const moduleDef = modules[scenario.module || 'common'];
  const folder = path.join(shotRoot, moduleDef.folder);
  await mkdir(folder, { recursive: true });
  const next = (counters.get(moduleDef.folder) || 0) + 1;
  counters.set(moduleDef.folder, next);
  const filename = `${String(next).padStart(3, '0')}_${safeSegment(scenario.submodule)}_${safeSegment(action.label || action.type || 'state')}.png`;
  const file = path.join(folder, filename);
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: !!action.fullPage,
  }, sessionId);
  await writeFile(file, Buffer.from(screenshot.data, 'base64'));
  const rel = path.relative(outRoot, file).replaceAll('\\', '/');
  const state = await getLightState(cdp, sessionId).catch(() => ({}));
  const record = {
    id: `${moduleDef.folder}-${String(next).padStart(3, '0')}`,
    module: moduleDef.title,
    moduleId: moduleDef.id,
    submodule: scenario.submodule,
    capability: scenario.capability,
    actionType: action.type,
    actionLabel: action.label,
    actionNote: action.note || '',
    url: state.url || meta.url || '',
    screenshot: rel,
    meta,
    capturedAt: new Date().toISOString(),
  };
  records.push(record);
  return record;
}

async function getLightState(cdp, sessionId) {
  return await evalJson(cdp, sessionId, `(() => ({
    title: document.title,
    url: location.href,
    bodyText: (document.body.innerText || '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 12000),
  }))()`, 5000);
}

async function collectPageState(cdp, sessionId, scenario) {
  const state = await evalJson(cdp, sessionId, `(() => {
    const q = (sel) => Array.from(document.querySelectorAll(sel));
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const text = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const controls = q('button,input,textarea,select,[role="button"],.custom-light-btn,.ant-btn,.el-button,.custom-light-select-selector,.ant-select-selector,.el-select,.custom-light-picker,.ant-picker,.custom-light-dropdown-trigger')
      .filter(visible)
      .map((el, idx) => ({
        idx,
        tag: el.tagName,
        text: text(el),
        placeholder: el.getAttribute('placeholder') || el.querySelector('input')?.getAttribute('placeholder') || '',
        title: el.getAttribute('title') || '',
        aria: el.getAttribute('aria-label') || '',
        cls: String(el.className || '').slice(0, 180),
        rect: rect(el),
        disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true' || el.className.toString().includes('disabled'),
      }))
      .filter((x) => x.text || x.placeholder || x.title || x.aria);
    const menus = q('.app-menu-item,.app-menu-text,.custom-light-menu-item,.custom-light-menu-title-content,.ant-menu-item,[role="menuitem"],[class*="menu-item"]')
      .filter(visible)
      .map((el, idx) => ({ idx, text: text(el), cls: String(el.className || '').slice(0, 160), rect: rect(el) }))
      .filter((x) => x.text);
    const tables = q('table,.custom-light-table,.ant-table,.el-table')
      .filter(visible)
      .map((el, idx) => ({
        idx,
        text: text(el).slice(0, 5000),
        headers: Array.from(el.querySelectorAll('th')).map(text).filter(Boolean),
      }));
    const forms = q('form,.custom-light-form,.ant-form,.el-form,[class*="form"]')
      .filter(visible)
      .map((el, idx) => ({
        idx,
        text: text(el).slice(0, 2500),
        inputs: Array.from(el.querySelectorAll('input,textarea,select')).map((input) => ({
          placeholder: input.getAttribute('placeholder') || '',
          type: input.type || input.tagName,
          value: input.type === 'password' ? '[redacted]' : String(input.value || '').slice(0, 120),
        })),
      }))
      .filter((x) => x.text || x.inputs.length);
    const cards = q('.app-list-item,.card,.ant-card,.el-card,[class*="card"],[class*="overview"],[class*="stat"]')
      .filter(visible)
      .map((el, idx) => ({ idx, text: text(el).slice(0, 1500), cls: String(el.className || '').slice(0, 160), rect: rect(el) }))
      .filter((x) => x.text);
    return {
      module: ${JSON.stringify(modules[scenario.module].title)},
      submodule: ${JSON.stringify(scenario.submodule)},
      capability: ${JSON.stringify(scenario.capability)},
      url: location.href,
      title: document.title,
      bodyText: (document.body.innerText || '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 40000),
      controls,
      menus,
      tables,
      forms,
      cards,
    };
  })()`);
  pageStates.push(state);
  await writeFile(path.join(rawDir, `${safeSegment(scenario.module)}_${safeSegment(scenario.submodule)}.json`), JSON.stringify(state, null, 2), 'utf8');
  return state;
}

async function clickAt(cdp, sessionId, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
  await sleep(80);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId);
}

async function hoverAt(cdp, sessionId, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
}

async function pressKey(cdp, sessionId, key) {
  const keyCode = key === 'Escape' ? 27 : 0;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }, sessionId);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }, sessionId);
}

async function closeOverlays(cdp, sessionId) {
  await evalJson(cdp, sessionId, `(() => {
    const normalize = (s) => (s || '').replace(/\\s+/g, '').trim();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const closeSelectors = [
      '.custom-light-modal-close', '.ant-modal-close', '.el-dialog__headerbtn',
      '.custom-light-drawer-close', '.ant-drawer-close', '[aria-label="Close"]',
      '.custom-light-message-notice-close', '.ant-message-notice-close'
    ];
    for (const selector of closeSelectors) {
      const el = Array.from(document.querySelectorAll(selector)).reverse().find(visible);
      if (el) { el.click(); return 'close-selector'; }
    }
    const buttons = Array.from(document.querySelectorAll('button,[role="button"],a,span,div')).filter(visible);
    const cancel = buttons.find((el) => /^(取消|关闭|返回|知道了|稍后|×|x)$/i.test(normalize(el.innerText || el.textContent || el.getAttribute('aria-label'))));
    if (cancel) { cancel.click(); return 'cancel-button'; }
    return 'none';
  })()`, 5000).catch(() => 'error');
  await pressKey(cdp, sessionId, 'Escape').catch(() => {});
  await sleep(500);
}

async function overlayInfo(cdp, sessionId) {
  return await evalJson(cdp, sessionId, `(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const text = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    const selectors = [
      '.custom-light-modal', '.ant-modal', '.el-dialog', '[role="dialog"]',
      '.custom-light-drawer', '.ant-drawer',
      '.custom-light-select-dropdown', '.ant-select-dropdown', '.el-select-dropdown',
      '.custom-light-picker-dropdown', '.ant-picker-dropdown', '.el-picker-panel',
      '.custom-light-dropdown', '.ant-dropdown', '.el-dropdown-menu',
      '.custom-light-popover', '.ant-popover', '.el-popover',
      '.custom-light-message', '.ant-message', '.el-message'
    ];
    const overlays = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)).filter(visible).map((el) => ({
      selector,
      text: text(el).slice(0, 1600),
    })));
    return overlays;
  })()`, 5000).catch(() => []);
}

async function clickExactText(cdp, sessionId, text) {
  return await evalJson(cdp, sessionId, `(() => {
    const wanted = ${JSON.stringify(text)};
    const norm = (s) => (s || '').replace(/\\s+/g, '').trim();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const scoreTag = (el) => {
      const tag = el.tagName;
      if (tag === 'LI') return 0;
      if (tag === 'SPAN') return 1;
      if (tag === 'BUTTON') return 2;
      if (tag === 'A') return 3;
      if (tag === 'DIV') return 4;
      return 5;
    };
    const candidates = Array.from(document.querySelectorAll('.custom-light-menu-item,.custom-light-menu-title-content,.app-menu-item,.app-menu-text,button,[role="button"],a,span,div'))
      .filter(visible)
      .map((el) => {
        const t = norm(el.innerText || el.textContent || el.getAttribute('title') || el.getAttribute('aria-label'));
        const r = el.getBoundingClientRect();
        return { el, t, area: r.width * r.height, tagScore: scoreTag(el), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
      })
      .filter((x) => x.t === norm(wanted) || x.t.includes(norm(wanted)));
    candidates.sort((a, b) => {
      const exact = Number(a.t !== norm(wanted)) - Number(b.t !== norm(wanted));
      if (exact) return exact;
      if (a.tagScore !== b.tagScore) return a.tagScore - b.tagScore;
      return a.area - b.area;
    });
    const item = candidates[0];
    if (!item) return { ok: false, text: wanted };
    item.el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = item.el.getBoundingClientRect();
    item.el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    item.el.click();
    return { ok: true, text: wanted, rect: item.rect, matched: item.t };
  })()`, 8000);
}

async function navigateTo(cdp, sessionId, url) {
  await cdp.send('Page.navigate', { url }, sessionId);
  await waitFor(cdp, sessionId, `document.readyState === 'complete'`, 20000).catch(() => {});
  await sleep(3500);
}

async function navigateScenario(cdp, sessionId, scenario) {
  if (scenario.url) {
    await navigateTo(cdp, sessionId, scenario.url);
  } else if (scenario.base && baseScenarioUrl[scenario.base]) {
    await navigateTo(cdp, sessionId, baseScenarioUrl[scenario.base]);
    await sleep(1200);
    if (scenario.menu) {
      await clickExactText(cdp, sessionId, scenario.menu);
      await sleep(2800);
    }
  }
  await closeOverlays(cdp, sessionId);
}

function actionLabel(candidate) {
  return candidate.text || candidate.placeholder || candidate.title || candidate.aria || candidate.kind || candidate.tag || '未命名控件';
}

function shouldClick(candidate) {
  const label = actionLabel(candidate);
  if (candidate.disabled) return false;
  if (/一键全部安装|全部安装|立即安装|卸载|清空缓存|清理缓存|提交|保存|确认安装/i.test(label)) return false;
  if (/导出/.test(label)) return false;
  return true;
}

async function getActionables(cdp, sessionId) {
  return await evalJson(cdp, sessionId, `(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width <= 0 || r.height <= 0) return false;
      if (st.display === 'none' || st.visibility === 'hidden' || st.pointerEvents === 'none') return false;
      if (r.x > window.innerWidth - 4 || r.y > window.innerHeight - 4 || r.x + r.width < 0 || r.y + r.height < 0) return false;
      return true;
    };
    const text = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
    };
    const raw = [];
    const add = (selector, kind, priority) => {
      for (const el of document.querySelectorAll(selector)) {
        if (!visible(el)) continue;
        const r = rectOf(el);
        if (r.w * r.h > 180000 && !/app-list-item|card|tab|btn|button/i.test(String(el.className || ''))) continue;
        const ownText = text(el);
        const input = el.matches('input,textarea,select') ? el : el.querySelector('input,textarea,select');
        const placeholder = el.getAttribute('placeholder') || input?.getAttribute('placeholder') || '';
        const title = el.getAttribute('title') || '';
        const aria = el.getAttribute('aria-label') || '';
        const label = ownText || placeholder || title || aria;
        if (!label && !/select|picker|dropdown|tab|card/i.test(kind)) continue;
        raw.push({
          kind,
          priority,
          tag: el.tagName,
          text: ownText.slice(0, 120),
          placeholder: placeholder.slice(0, 120),
          title: title.slice(0, 120),
          aria: aria.slice(0, 120),
          cls: String(el.className || '').slice(0, 180),
          rect: r,
          disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true' || String(el.className || '').includes('disabled'),
        });
      }
    };
    add('button,[role="button"],.custom-light-btn,.ant-btn,.el-button', 'button', 1);
    add('input:not([type="hidden"]),textarea,select,.custom-light-select-selector,.ant-select-selector,.el-select,.custom-light-picker,.ant-picker', 'field', 2);
    add('.custom-light-dropdown-trigger,.ant-dropdown-trigger,.el-dropdown,[aria-haspopup="true"]', 'dropdown-trigger', 3);
    add('.custom-light-tabs-tab,.ant-tabs-tab,.el-tabs__item,[role="tab"]', 'tab', 4);
    add('.custom-light-pagination-item,.ant-pagination-item,.el-pagination button,.custom-light-pagination-options,.ant-pagination-options', 'pagination', 5);
    add('.app-list-item,.card,.ant-card,.el-card,[class*="card"]', 'card', 6);
    const seen = new Set();
    return raw
      .sort((a, b) => a.priority - b.priority || a.rect.y - b.rect.y || a.rect.x - b.rect.x)
      .filter((item) => {
        const label = (item.text || item.placeholder || item.title || item.aria || item.kind).replace(/\\s+/g, '');
        const key = [item.kind, label, Math.round(item.rect.x / 8), Math.round(item.rect.y / 8)].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 80);
  })()`, 8000);
}

async function scrollPage(cdp, sessionId, fraction) {
  return await evalJson(cdp, sessionId, `(() => {
    const fraction = ${fraction};
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const candidates = Array.from(document.querySelectorAll('main,section,.page-container,.page-content,.custom-light-layout-content,.ant-layout-content,.el-main,.content,body,html'))
      .filter(visible)
      .filter((el) => el.scrollHeight > el.clientHeight + 40)
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
    const el = candidates[0] || document.scrollingElement || document.documentElement;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = Math.round(max * fraction);
    window.scrollTo(0, Math.round(Math.max(0, document.documentElement.scrollHeight - window.innerHeight) * fraction));
    return { tag: el.tagName, cls: String(el.className || '').slice(0, 120), max, top: el.scrollTop };
  })()`, 5000);
}

async function interactWithCandidate(cdp, sessionId, scenario, candidate, ordinal) {
  const label = actionLabel(candidate);
  const { cx, cy } = candidate.rect;
  const beforeUrl = (await getLightState(cdp, sessionId).catch(() => ({}))).url || '';
  await hoverAt(cdp, sessionId, cx, cy).catch(() => {});
  await sleep(250);
  await capture(cdp, sessionId, scenario, {
    type: 'hover',
    label: `${String(ordinal).padStart(2, '0')}_${label}_悬停`,
    note: `悬停查看 ${label} 的 hover/提示状态`,
  }, { candidate });

  if (!shouldClick(candidate)) {
    await capture(cdp, sessionId, scenario, {
      type: 'safety-skip',
      label: `${String(ordinal).padStart(2, '0')}_${label}_安全跳过点击`,
      note: `该控件可能触发安装、导出、保存等最终动作，本轮只记录悬停状态，避免修改系统数据。`,
    }, { candidate, skipped: true });
    return;
  }

  await clickAt(cdp, sessionId, cx, cy).catch(() => {});
  await sleep(900);
  const overlays = await overlayInfo(cdp, sessionId);
  await capture(cdp, sessionId, scenario, {
    type: candidate.kind === 'field' ? 'focus-or-open' : 'click',
    label: `${String(ordinal).padStart(2, '0')}_${label}_点击后`,
    note: overlays.length ? `点击后出现弹窗/下拉/提示：${overlays.map((x) => x.selector).join('、')}` : `点击后记录页面反馈或空数据提示`,
  }, { candidate, overlays });

  const afterUrl = (await getLightState(cdp, sessionId).catch(() => ({}))).url || '';
  await closeOverlays(cdp, sessionId);
  if (afterUrl && beforeUrl && afterUrl !== beforeUrl && !/查询|重置|刷新/.test(label)) {
    await navigateScenario(cdp, sessionId, scenario).catch(() => {});
  }
}

async function interactScenario(cdp, sessionId, scenario) {
  await navigateScenario(cdp, sessionId, scenario);
  await capture(cdp, sessionId, scenario, { type: 'overview', label: '页面全貌', fullPage: true, note: '进入子模块后的页面全貌，用于识别信息架构、主操作区、筛选区和表格/卡片区。' });
  await collectPageState(cdp, sessionId, scenario);

  const scrollPoints = [0, 0.5, 1];
  const seen = new Set();
  let interacted = 0;
  for (const point of scrollPoints) {
    const scrollMeta = await scrollPage(cdp, sessionId, point).catch((err) => ({ error: String(err) }));
    await sleep(350);
    await capture(cdp, sessionId, scenario, {
      type: 'scroll',
      label: `滚动位置_${Math.round(point * 100)}%`,
      note: '记录页面不同滚动位置，补足表格、卡片和底部状态。',
    }, { scroll: scrollMeta });

    const candidates = await getActionables(cdp, sessionId).catch(() => []);
    for (const candidate of candidates) {
      if (interacted >= maxInteractions) break;
      const label = actionLabel(candidate).replace(/\s+/g, '');
      const key = `${candidate.kind}|${label}|${Math.round(candidate.rect.x / 12)}|${Math.round(candidate.rect.y / 12)}`;
      if (seen.has(key)) continue;
      if (candidate.rect.cx < 285 && !/搜索菜单/.test(label)) continue;
      seen.add(key);
      interacted += 1;
      await interactWithCandidate(cdp, sessionId, scenario, candidate, interacted).catch(async (err) => {
        await capture(cdp, sessionId, scenario, {
          type: 'interaction-error',
          label: `${String(interacted).padStart(2, '0')}_${label}_交互异常`,
          note: String(err.message || err).slice(0, 300),
        }, { candidate, error: String(err.stack || err) }).catch(() => {});
        await closeOverlays(cdp, sessionId).catch(() => {});
      });
    }
    if (interacted >= maxInteractions) break;
  }
}

async function captureGuideIfPresent(cdp, sessionId) {
  const scenario = {
    module: 'guide',
    submodule: '首次登录引导弹窗',
    capability: '引导用户添加摄像头并创建第一个视频流分析任务',
  };
  const hasGuide = await evalJson(cdp, sessionId, `(() => /欢迎使用人工智能推理平台|开始配置/.test(document.body.innerText || ''))()`, 5000).catch(() => false);
  if (hasGuide) {
    await capture(cdp, sessionId, scenario, { type: 'modal', label: '引导弹窗_初始态', fullPage: true, note: '首次进入后的引导弹窗初始状态。' });
    const start = await clickExactText(cdp, sessionId, '开始配置').catch(() => ({ ok: false }));
    await sleep(1600);
    await capture(cdp, sessionId, scenario, { type: 'modal-click', label: '开始配置_点击后', fullPage: true, note: '点击开始配置后的跳转或页面反馈。' }, { start });
    await navigateTo(cdp, sessionId, new URL('/app/main-app/frame', baseUrl).href).catch(() => {});
  } else {
    const sourceDir = path.join(outRoot, 'screenshots');
    const targetDir = path.join(shotRoot, modules.guide.folder);
    await mkdir(targetDir, { recursive: true });
    const legacy = ['01_after_login.png', 'guide_01_initial_modal.png', 'guide_02_after_start_config.png', 'guide_03_after_reload_frame.png', 'guide_04_after_close.png'];
    for (const name of legacy) {
      const src = path.join(sourceDir, name);
      if (!(await exists(src))) continue;
      const next = (counters.get(modules.guide.folder) || 0) + 1;
      counters.set(modules.guide.folder, next);
      const dst = path.join(targetDir, `${String(next).padStart(3, '0')}_历史采集_${safeSegment(name)}`);
      await copyFile(src, dst);
      records.push({
        id: `${modules.guide.folder}-${String(next).padStart(3, '0')}`,
        module: modules.guide.title,
        moduleId: modules.guide.id,
        submodule: '首次登录引导弹窗',
        capability: scenario.capability,
        actionType: 'legacy-guide',
        actionLabel: name.includes('after_start') ? '开始配置点击后历史截图' : name.includes('close') ? '关闭后历史截图' : '引导弹窗历史截图',
        actionNote: '当前会话未稳定复现新手引导弹窗，已归档此前首次登录真实采集截图用于设计分析。',
        url: '',
        screenshot: path.relative(outRoot, dst).replaceAll('\\', '/'),
        meta: { source: path.relative(outRoot, src).replaceAll('\\', '/') },
        capturedAt: new Date().toISOString(),
      });
    }
  }
  await closeOverlays(cdp, sessionId);
}

async function captureCommonHeader(cdp, sessionId) {
  const scenario = {
    module: 'common',
    submodule: '顶部栏与全局导航',
    capability: '搜索菜单、模块切换、账号入口、全局导航辅助能力',
    url: new URL('/app/main-app/frame', baseUrl).href,
  };
  await navigateTo(cdp, sessionId, scenario.url);
  await closeOverlays(cdp, sessionId);
  await capture(cdp, sessionId, scenario, { type: 'overview', label: '顶部栏_默认态', fullPage: true, note: '记录全局顶部栏与左侧一级模块导航。' });
  const labels = ['搜索菜单', '数据看板', '智能分析', '数据中心', '平台管理'];
  let i = 0;
  for (const label of labels) {
    i += 1;
    const ok = await clickExactText(cdp, sessionId, label).catch(() => ({ ok: false }));
    await sleep(1000);
    await capture(cdp, sessionId, scenario, { type: 'global-nav', label: `${String(i).padStart(2, '0')}_${label}_点击状态`, note: `全局入口 ${label} 的点击/展开/跳转状态。` }, { ok });
    await closeOverlays(cdp, sessionId);
  }
}

async function login(cdp, sessionId) {
  await navigateTo(cdp, sessionId, baseUrl);
  const hasLogin = await evalJson(cdp, sessionId, `!!document.querySelector('#form_item_username')`, 5000).catch(() => false);
  if (hasLogin) {
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
      const button = document.querySelector('button[type=submit], .login-btn-wrap button');
      if (!button) throw new Error('missing submit button');
      button.click();
      return true;
    })()`);
    await waitFor(cdp, sessionId, `location.href.indexOf('/user/login') === -1 || !!localStorage.getItem('token')`, 30000).catch(() => {});
    await sleep(5000);
  }
}

function selectedScenarios() {
  if (scopeArg === 'all') return scenarios;
  return scenarios.filter((scenario) => scenario.scope === scopeArg);
}

async function ensureDirs() {
  await mkdir(rawDir, { recursive: true });
  await mkdir(profileDir, { recursive: true });
  for (const mod of Object.values(modules)) {
    await mkdir(path.join(shotRoot, mod.folder), { recursive: true });
  }
}

async function main() {
  await ensureDirs();
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
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('DOM.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  }, sessionId);

  try {
    await login(cdp, sessionId);
    if (scopeArg === 'all' || scopeArg === 'guide') {
      await captureGuideIfPresent(cdp, sessionId);
    }
    if (scopeArg === 'all' || scopeArg === 'common') {
      await captureCommonHeader(cdp, sessionId);
    }
    for (const scenario of selectedScenarios()) {
      await interactScenario(cdp, sessionId, scenario).catch(async (err) => {
        records.push({
          id: `error-${Date.now()}`,
          module: modules[scenario.module].title,
          moduleId: modules[scenario.module].id,
          submodule: scenario.submodule,
          capability: scenario.capability,
          actionType: 'scenario-error',
          actionLabel: '子模块采集异常',
          actionNote: String(err.message || err),
          url: '',
          screenshot: '',
          meta: { error: String(err.stack || err) },
          capturedAt: new Date().toISOString(),
        });
      });
    }
  } finally {
    await writeFile(path.join(rawDir, `interaction_index_${safeSegment(scopeArg)}.json`), JSON.stringify(records, null, 2), 'utf8');
    await writeFile(path.join(rawDir, `page_states_${safeSegment(scopeArg)}.json`), JSON.stringify(pageStates, null, 2), 'utf8');
    await writeFile(path.join(rawDir, `chrome_stderr_${safeSegment(scopeArg)}.log`), stderr.join('\n'), 'utf8').catch(() => {});
    cdp.close();
    chrome.kill();
  }

  const allIndexFiles = (await readdir(rawDir)).filter((name) => /^interaction_index_.*\.json$/.test(name));
  await writeFile(path.join(rawDir, 'module_manifest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    scope: scopeArg,
    maxInteractions,
    modules,
    indexFiles: allIndexFiles,
  }, null, 2), 'utf8');
  console.log(`deep collection complete: ${records.length} records for scope=${scopeArg}`);
}

main().catch(async (err) => {
  await mkdir(rawDir, { recursive: true }).catch(() => {});
  await writeFile(path.join(rawDir, `deep_collect_error_${safeSegment(scopeArg)}.log`), err.stack || String(err), 'utf8').catch(() => {});
  console.error(err.stack || err);
  process.exitCode = 1;
});
