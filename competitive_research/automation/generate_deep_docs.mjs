import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outRoot = path.join(root, 'competitive_research');
const docsDir = path.join(outRoot, 'docs');
const rawDir = path.join(outRoot, 'raw', 'deep_interactions');
const shotRoot = path.join(outRoot, 'screenshots_deep');

await mkdir(docsDir, { recursive: true });

const moduleOrder = ['通用导航与顶部栏', '数据看板', '智能分析', '数据中心', '平台管理', '新手引导弹窗'];
const docFiles = {
  overview: '00_研究总览.md',
  dashboard: '01_数据看板模块.md',
  smart: '02_智能分析模块.md',
  data: '03_数据中心模块.md',
  platform: '04_平台管理模块.md',
  guide: '05_新手引导弹窗模块.md',
  cross: '06_跨模块依赖与交集.md',
  index: '07_深度截图索引.md',
};

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function esc(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|');
}

function clean(value, max = 180) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function img(record, width = 260) {
  if (!record?.screenshot) return '';
  return `<img src="../${record.screenshot}" width="${width}">`;
}

function mdTable(headers, rows) {
  return [
    `| ${headers.map(esc).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(esc).join(' | ')} |`),
  ].join('\n');
}

function mdList(items) {
  return items.filter(Boolean).map((item) => `- ${item}`).join('\n');
}

function countBy(items, getter) {
  const map = new Map();
  for (const item of items) {
    const key = getter(item);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function moduleSort(a, b) {
  const ma = moduleOrder.indexOf(a.module);
  const mb = moduleOrder.indexOf(b.module);
  if (ma !== mb) return ma - mb;
  if (a.submodule !== b.submodule) return String(a.submodule).localeCompare(String(b.submodule), 'zh-Hans-CN');
  return String(a.id).localeCompare(String(b.id), 'zh-Hans-CN');
}

async function loadRecords() {
  const files = (await readdir(rawDir))
    .filter((name) => /^interaction_index_.*\.json$/.test(name))
    .sort();
  const records = [];
  for (const file of files) {
    const rows = await readJson(path.join(rawDir, file));
    for (const row of rows) records.push({ ...row, sourceFile: file });
  }
  records.sort(moduleSort);
  return records;
}

async function loadPageStates() {
  const files = (await readdir(rawDir))
    .filter((name) => /^page_states_.*\.json$/.test(name))
    .sort();
  const states = [];
  for (const file of files) {
    const rows = await readJson(path.join(rawDir, file));
    for (const row of rows) states.push({ ...row, sourceFile: file });
  }
  const map = new Map();
  for (const state of states) map.set(`${state.module}|${state.submodule}`, state);
  return map;
}

async function screenshotStats() {
  const rows = [];
  async function walk(dir) {
    if (!(await exists(dir))) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith('.png')) rows.push(full);
    }
  }
  await walk(shotRoot);
  const byDir = countBy(rows, (file) => path.relative(shotRoot, path.dirname(file)).replaceAll('\\', '/'));
  return { total: rows.length, byDir };
}

const submoduleNotes = {
  '顶部栏与全局导航': {
   定位: '全局导航承担跨模块搜索、应用中心、站内信、语言与账号入口，是用户从任意业务页面回到系统级能力的固定通道。',
   核心对象: '菜单项、应用入口、通知消息、语言项、账号操作。',
   设计要点: '顶部栏把“找功能”和“换模块”前置，适合菜单层级较深的 AI 平台；站内信与应用中心使用下拉承载，避免离开当前任务页面。',
   风险: '搜索菜单结果很长，建议支持关键词高亮、最近访问、收藏菜单；账号下拉中的修改密码/退出应继续保留二次确认。',
  },
  '数据看板首页': {
   定位: '看板首页不是单张报表，而是可视化场景入口集合，把实时监控、业务概览、报警图片墙、AI 管控中心聚合在一个选择页。',
   核心对象: '看板入口卡片、创建看板按钮、业务场景描述、全局导航。',
   设计要点: '卡片用一句话解释使用场景，适合新用户快速理解差异；创建看板作为主 CTA 暗示系统支持自定义大屏。',
   风险: '创建看板与场景入口应给出模板、数据源、权限、发布预览等流程，否则用户看到入口但不知道如何落地。',
  },
  'AI智能管控中心': {
   定位: '面向管理者和指挥大屏的综合态势页，承接实时监控、报警趋势、算法与摄像头态势等高层指标。',
   核心对象: '实时指标、报警态势、摄像头/算法运行状态、排行与趋势。',
   设计要点: '管控中心更像“结果消费层”，依赖智能分析产生任务，依赖数据中心沉淀报警日志。',
   风险: '如果没有任务或报警数据，价值感会明显下降；建议提供空状态引导，直接跳转到摄像头和任务配置。',
  },
  '摄像头配置': {
   定位: '智能分析链路的输入源管理页，决定系统“看哪里、看什么流”。',
   核心对象: '摄像头、视频源、分组、流地址、连接状态、预览图。',
   设计要点: '新增、导入、导出、抓图、移动、删除覆盖了视频源的全生命周期；批量抓图和预览图用于验证流可用性。',
   风险: '建议增加连接诊断、RTSP 连通性、延迟、帧率、解码状态，让用户在新增时就能完成质量校验。',
  },
  '算法列表': {
   定位: '算法资产目录，负责把底层算法能力包装成业务可选择的标准能力。',
   核心对象: '算法 ID、中文名、英文名、算法等级、编辑入口、虚拟算法。',
   设计要点: '中英文名称并列兼顾业务用户与工程用户；统计配置说明算法输出还会被汇总到看板指标。',
   风险: '算法列表建议补充适用场景、输入要求、输出字段、版本、算力消耗和启停状态。',
  },
  '人员库': {
   定位: '人脸/人员识别类算法的基础数据维护中心，承载人员照片、标签、分组和特征提取。',
   核心对象: '人员、照片、特征提取状态、工号、联系方式、分组、陌生人。',
   设计要点: '添加人员弹窗明确照片规格和角度类型，说明系统对特征质量有要求；特征提取把“照片入库”和“算法可识别”区分开。',
   风险: '建议在列表中强化失败原因、照片质量提示、批量导入模板校验和隐私合规提示。',
  },
  '算法底库': {
   定位: '算法专用底库/标签库，用于为特定算法提供可同步、可上传图片、可加标签的基础样本集合。',
   核心对象: '底库、关联算法、同步状态、图片、标签。',
   设计要点: '同步详情和立即同步体现了离线底库与运行服务之间存在同步链路。',
   风险: '建议增加同步失败原因、最近同步时间、样本数、标签分布和增量同步策略。',
  },
  '视频流分析': {
   定位: '实时任务编排页，把摄像头、算法、报警输出和结果推流组合成持续运行的分析任务。',
   核心对象: '视频分析任务、启用状态、报警推送输出、分析结果推流、详情、演示视频。',
   设计要点: '任务列表同时显示输入、算法输出和结果分发状态，是智能分析链路的核心中台页。',
   风险: '建议把详情页设计成任务配置全景，包括摄像头、算法、规则区域、阈值、运行时间、推送目标、历史报警。',
  },
  '图片分析': {
   定位: '面向离线图片或批量图片的分析任务管理页，与视频流分析构成输入形态互补。',
   核心对象: '图片分析任务、启用状态、关联算法、详情、删除。',
   设计要点: '保留启停和详情，说明图片分析也被当作长期任务而非一次性上传。',
   风险: '建议明确图片来源、批量上传、识别结果落库路径和失败重试策略。',
  },
  '分析服务状态': {
   定位: '运行健康监控页，帮助运维和管理员查看分析节点、服务状态与算法/摄像头承载数量。',
   核心对象: '节点 IP、节点名称、服务名称、状态、算法数量、摄像头数量。',
   设计要点: '强制重启和详情属于运维操作，说明系统支持对推理服务做运行时治理。',
   风险: '建议增加 CPU/GPU/内存/队列积压、最近错误、心跳时间和重启审计。',
  },
  '报警推送': {
   定位: '把分析结果送到外部系统的配置页，是 AI 事件进入业务系统的出口。',
   核心对象: '推送名称、推送地址、状态、创建推送、状态测试。',
   设计要点: '创建推送与状态测试形成配置闭环，先建通道再验证通道可用性。',
   风险: '建议增加鉴权方式、重试策略、签名配置、失败日志跳转和回调字段预览。',
  },
  '报警弹窗及语音': {
   定位: '面向值守场景的本地提醒配置页，通过报警等级、语音和弹窗控制事件触达。',
   核心对象: '报警等级、语音文件、TTS 声音、语速、音量、算法级播报方式。',
   设计要点: '系统级提醒与算法级提醒并存，可让高优先级算法有差异化触达方式。',
   风险: '建议支持分时段、分用户组、静默策略、试听队列和多语言语音包。',
  },
  '报警日志': {
   定位: 'AI 报警事件的主审计与处置工作台，承接查询、处理、归档、推送、导出和正误报统计。',
   核心对象: '报警事件、截图、录制片段、异常类型、摄像头、报警等级、处理状态、归档状态。',
   设计要点: '筛选维度覆盖任务、摄像头、异常类型、时间和状态；批量操作体现运营闭环。',
   风险: '建议补充详情页、误报原因、处理备注、操作人、置信度、框选区域和关联任务配置入口。',
  },
  '报警推送日志': {
   定位: '外部推送链路的审计页，解释“报警是否送出去、失败是否重试”。',
   核心对象: '推送时间、报警截图、异常类型、推送状态、数据 ID、推送地址。',
   设计要点: '页面显示自动重推和下一次推送时间，给运维明确预期；失败重推作为兜底动作。',
   风险: '建议增加失败原因分组、HTTP 状态码、响应体摘要、重试次数和目标系统可用性。',
  },
  '人员识别日志': {
   定位: '人员识别结果的查询与审计页，关注身份匹配、比对分数、人员类别与摄像头来源。',
   核心对象: '抓拍图、注册照、姓名、人员类别、人员 ID、比对分数、阈值、摄像头。',
   设计要点: '抓拍图与注册照并列，适合快速复核识别质量；人员类别支持白名单/黑名单等业务语义。',
   风险: '建议增加识别详情、误识别纠正、人员库回跳、阈值策略说明和隐私留存策略。',
  },
  '陌生人识别日志': {
   定位: '陌生人识别事件的审计页，面向安全值守和异常身份追踪。',
   核心对象: '陌生人 ID、抓拍图、比对分数、阈值、摄像头、时间。',
   设计要点: '相比人员识别日志，陌生人日志弱化注册身份，强化事件追踪与摄像头来源。',
   风险: '建议支持陌生人合并、转入人员库、事件聚类和高频出现提醒。',
  },
  '离线仓库': {
   定位: '面向内网/私有化交付的算法包与解决方案包管理页。',
   核心对象: '算法包、解决方案、版本、安装状态、上传、一键安装。',
   设计要点: '卡片展示 ID、版本和已安装状态，适合交付/运维快速盘点当前能力。',
   风险: '建议增加依赖检查、安装失败原因、版本升级记录、回滚、包签名校验。',
  },
  '用户管理': {
   定位: '平台账号生命周期管理页，负责创建用户、导入导出、重置密码、部门和权限配置。',
   核心对象: '用户、部门、用户名、工号、用户组、权限、密码。',
   设计要点: '创建用户弹窗把基础信息、用户组和权限放在一个流程中，适合管理员一次完成开户。',
   风险: '默认密码提示应避免长期暴露；建议增加强制首次改密、登录状态、锁定/解锁和操作审计。',
  },
  '用户组管理': {
   定位: '批量授权的组织层，帮助管理员用用户组承载角色和权限集合。',
   核心对象: '用户组、用户数量、描述、创建时间。',
   设计要点: '创建用户组表单很轻，说明用户组可能先建壳，再通过权限/用户管理补充配置。',
   风险: '建议展示用户组权限摘要、成员列表和权限差异对比。',
  },
  '系统权限': {
   定位: '权限策略维护页，负责抽象系统级能力和授权策略。',
   核心对象: '策略、描述、权限资源、操作。',
   设计要点: '创建策略以独立入口出现，适合后续扩展菜单、按钮、数据权限矩阵。',
   风险: '建议直接展示权限资源树、已关联用户组、风险权限标识和变更审计。',
  },
  '基础信息': {
   定位: '平台品牌、语言、标识、文件清理、系统时间和版本信息配置页。',
   核心对象: '平台名称、默认语言、平台标识、文件清理阈值、系统时间、模块版本。',
   设计要点: '把界面配置与系统配置放在同页，方便私有化部署时一次完成基础交付检查。',
   风险: '上传标识、同步本机时间和清理阈值都应保留预览、校验和操作审计。',
  },
  '系统主题': {
   定位: '平台皮肤配置页，用于品牌化、展示环境和使用偏好适配。',
   核心对象: '主题卡片、使用中状态、使用按钮。',
   设计要点: '主题以卡片展示，降低配置成本；“使用中”明确当前状态。',
   风险: '建议提供预览、深浅色兼容检查和按用户/全局生效范围说明。',
  },
  '网络配置': {
   定位: '部署网络参数配置页，属于高风险运维配置。',
   核心对象: '网卡、连接配置、IP 获取方式、IP 地址、子网掩码、网关、DNS、路由权重。',
   设计要点: '网络配置直接影响平台可达性，保存前应进行合法性校验和连通性预检查。',
   风险: '建议增加回滚计时器、配置备份、冲突检测和管理员二次确认。',
  },
  '站内信': {
   定位: '平台内通知中心，承接日志清理、算法安装等系统事件。',
   核心对象: '消息内容、来源、推送时间、已读/未读状态。',
   设计要点: '消息与来源模块关联，能把系统运维事件回流到用户可见通知。',
   风险: '建议消息详情应支持跳转原始模块、按来源筛选、批量归档和保留策略。',
  },
  '接口授权': {
   定位: '开放 API 调用方授权管理页，为第三方系统接入提供密钥。',
   核心对象: '访问密钥、APP ID、描述、启用状态。',
   设计要点: '创建访问密钥是开放能力的起点，列表字段能满足调用方识别和启停。',
   风险: '建议密钥只显示一次、支持轮换、过期时间、权限范围、调用统计和审计日志。',
  },
  '接口文档': {
   定位: '开发者集成说明页，承接接口授权后的调用文档。',
   核心对象: 'API 文档、参数、示例、鉴权说明。',
   设计要点: '与接口授权同属开放能力，形成“拿密钥 -> 看文档 -> 调接口”的路径。',
   风险: '当前采集页内容较少，建议嵌入 Swagger/OpenAPI、示例请求和错误码。',
  },
  '免密登录': {
   定位: '第三方系统免登录访问平台的链接管理页。',
   核心对象: '免密链接、关联用户、访问链接、启用状态。',
   设计要点: '创建链接把外部系统进入平台的身份上下文显式化，适合大屏、门户集成。',
   风险: '建议增加有效期、IP 白名单、访问范围、一次性 token 和访问审计。',
  },
  '对象存储': {
   定位: '文件对象存储配置页，支撑报警截图、录制片段、算法包等大文件资源。',
   核心对象: '对象存储、类型、存储空间、路径。',
   设计要点: '对象存储作为开放能力的一部分，说明平台把文件资源治理纳入系统配置。',
   风险: '建议支持连接测试、容量监控、生命周期策略、加密和迁移工具。',
  },
  '首次登录引导弹窗': {
   定位: '系统冷启动转化入口，引导用户从“看到平台”进入“添加摄像头并创建首个视频流分析任务”。',
   核心对象: '欢迎弹窗、开始配置按钮、关闭按钮、引导状态。',
   设计要点: '弹窗文案直接指向关键配置链路，降低新用户不知道第一步做什么的风险。',
   风险: '后续会话不稳定复现，建议在首页保留可恢复的新手向导入口，并根据系统状态动态推进。',
  },
};

function stateFor(pageStates, module, submodule) {
  return pageStates.get(`${module}|${submodule}`) || {};
}

function pageSummary(pageStates, module, submodule) {
  const state = stateFor(pageStates, module, submodule);
  const controls = unique((state.controls || []).map((item) => clean(item.text || item.placeholder || item.title || item.aria, 80))).slice(0, 28);
  const headers = unique((state.tables || []).flatMap((table) => table.headers || []).map((item) => clean(item, 80))).slice(0, 28);
  const body = clean(state.bodyText, 360);
  return { state, controls, headers, body };
}

function overlayText(record) {
  return unique((record.meta?.overlays || []).map((item) => clean(item.text, 260))).filter(Boolean).join('；');
}

function overlayKinds(record) {
  return unique((record.meta?.overlays || []).map((item) => item.selector || '')).join('、');
}

function labelWithoutOrdinal(label) {
  return String(label || '')
    .replace(/^\d+_/, '')
    .replace(/_(悬停|点击后|安全跳过点击)$/, '')
    .replace(/_/g, ' ')
    .trim();
}

function designNote(record) {
  const label = labelWithoutOrdinal(record.actionLabel);
  const overlays = overlayText(record);
  const kinds = overlayKinds(record);
  if (record.actionType === 'overview') return '页面全貌用于判断信息架构：左侧导航负责定位，主区承载筛选、操作、表格或卡片，适合作为子模块设计基线。';
  if (record.actionType === 'scroll') return '滚动截图用于确认页面内容密度、底部表格/分页/卡片布局，避免只看首屏导致遗漏。';
  if (record.actionType === 'hover') return `悬停 ${label}，观察按钮可点击性、危险操作样式、行操作显隐和 hover 反馈；这是判断操作优先级的重要细节。`;
  if (record.actionType === 'safety-skip') return `该操作可能产生安装、导出、保存、删除、启停或配置变更等副作用，本次只保留悬停/按钮状态截图；产品上应通过权限、二次确认和审计保护。`;
  if (record.actionType === 'legacy-guide') return '当前会话未稳定复现该弹窗，归档此前首次登录真实截图；用于分析触发条件、弹窗结构和开始配置路径。';
  if (/modal|\[role="dialog"\]|drawer/.test(kinds)) {
    return `点击 ${label} 后进入弹窗/抽屉式流程。弹窗内容：${overlays || '已出现对话框'}。设计上把复杂创建、导入、配置或密码类操作隔离在临时层，既保留当前列表上下文，也降低页面跳转成本。`;
  }
  if (/select-dropdown/.test(kinds)) {
    return `点击 ${label} 后打开下拉选择。选项内容：${overlays || '下拉选项已展开'}。适合枚举型筛选、菜单搜索和业务分类选择，建议支持搜索、高亮和最近使用。`;
  }
  if (/picker/.test(kinds)) {
    return `点击 ${label} 后打开日期/时间选择器。日期控件把审计和日志类页面的时间范围筛选标准化，是追溯类功能的核心输入。`;
  }
  if (/dropdown/.test(kinds)) {
    return `点击 ${label} 后打开菜单。菜单内容：${overlays || '下拉菜单已展开'}。适合更多操作、账号、语言、应用中心、通知等轻量分发场景。`;
  }
  if (/message/.test(kinds)) {
    return `点击 ${label} 后出现消息反馈。反馈内容：${overlays || '系统消息提示'}。该设计把空选择、无效操作、成功结果即时告知用户，是批量操作和空数据场景的必要兜底。`;
  }
  if (/查询|重置|刷新/.test(label)) return `点击 ${label} 属于检索/刷新类动作，用于让用户明确控制筛选条件生效和数据更新。`;
  if (/详情|编辑/.test(label)) return `点击 ${label} 用于从列表进入单对象配置或查看，体现“列表管理 + 详情维护”的后台产品模式。`;
  if (/创建|新增|添加|上传|导入/.test(label)) return `点击 ${label} 是主流程入口，承接新增资源、批量导入或上传包的业务路径，应配套字段校验、模板下载、错误反馈和权限控制。`;
  if (/处理|归档|推送|失败重推|状态测试/.test(label)) return `点击 ${label} 属于结果流转或链路验证动作，体现从 AI 识别结果到运营闭环、外部系统联动的设计意图。`;
  return record.actionNote || `记录 ${label} 的点击后状态，用于补全按钮交互、空状态反馈或页面跳转证据。`;
}

function interactionRows(records, limit = Infinity) {
  return records.slice(0, limit).map((record) => [
    img(record, 230),
    `${record.submodule}<br>${record.actionLabel}`,
    `${record.actionType}<br>${clean(record.actionNote, 120)}`,
    designNote(record),
  ]);
}

function interactionSection(title, records, includeAll = true) {
  const rows = includeAll ? records : records.slice(0, 18);
  return `### ${title}\n\n${mdTable(['截图', '子模块/动作', '类型与页面反馈', '产品设计说明'], interactionRows(rows))}`;
}

function submoduleSection(module, submodule, records, pageStates) {
  const note = submoduleNotes[submodule] || {
    定位: '该子模块用于承载当前业务对象的查询、维护和状态管理。',
    核心对象: '业务对象、筛选条件、列表字段、操作按钮。',
    设计要点: '采用后台管理常见的信息架构，把对象列表、筛选和操作集中在同一页面。',
    风险: '建议补充空状态引导、字段说明和操作审计。',
  };
  const summary = pageSummary(pageStates, module, submodule);
  const keyShots = [
    records.find((item) => item.actionType === 'overview'),
    ...records.filter((item) => /modal|\[role="dialog"\]|dropdown|picker|message|select-dropdown/.test(overlayKinds(item))).slice(0, 4),
  ].filter(Boolean);
  return `## ${submodule}\n\n${mdList([
    `定位：${note.定位}`,
    `核心对象：${note.核心对象}`,
    `页面 URL：${summary.state.url || records[0]?.url || '见截图记录'}`,
    `主要控件：${summary.controls.length ? summary.controls.join('、') : '本页主要以展示或导航为主'}`,
    `表格字段：${summary.headers.length ? summary.headers.join('、') : '未采集到表格字段或本页以卡片/配置项为主'}`,
  ])}\n\n${keyShots.map((record) => img(record, 360)).join('\n\n')}\n\n### 产品设计解读\n\n${mdList([
    note.设计要点,
    `页面内容摘要：${summary.body || '页面正文较少或主要为空态。'}`,
    note.风险,
  ])}\n\n${interactionSection(`${submodule}按钮、弹窗与状态截图明细`, records, true)}`;
}

function moduleDoc(module, title, intro, submodules, records, pageStates, extra = '') {
  const moduleRecords = records.filter((item) => item.module === module);
  const subCounts = submodules.map((sub) => [sub, moduleRecords.filter((item) => item.submodule === sub).length]);
  const typeCounts = [...countBy(moduleRecords, (item) => item.actionType)].map(([k, v]) => [k, v]);
  return `# ${title}\n\n${intro}\n\n## 采集覆盖\n\n${mdTable(['维度', '数量/说明'], [
    ['深度截图', `${moduleRecords.length} 张/条交互记录`],
    ['覆盖子模块', submodules.join('、')],
    ['动作类型', typeCounts.map(([k, v]) => `${k}: ${v}`).join('；')],
  ])}\n\n${mdTable(['子模块', '截图/交互记录数'], subCounts)}\n\n${extra}\n\n${submodules.map((sub) => submoduleSection(module, sub, moduleRecords.filter((item) => item.submodule === sub), pageStates)).join('\n\n')}`;
}

function coverageTable(records, stats) {
  const rows = [];
  for (const module of moduleOrder) {
    const moduleRecords = records.filter((item) => item.module === module);
    if (!moduleRecords.length) continue;
    rows.push([
      module,
      `${moduleRecords.length}`,
      unique(moduleRecords.map((item) => item.submodule)).join('、'),
      unique(moduleRecords.map((item) => item.actionType)).join('、'),
    ]);
  }
  rows.push(['截图文件合计', `${stats.total}`, [...stats.byDir].map(([dir, count]) => `${dir}: ${count}`).join('；'), '按模块目录归档']);
  return mdTable(['模块', '记录数', '覆盖范围', '动作类型/目录'], rows);
}

function representative(records, module, submodule, actionMatch) {
  return records.find((item) => item.module === module && item.submodule === submodule && actionMatch.test(item.actionLabel || item.actionType || ''))
    || records.find((item) => item.module === module && item.submodule === submodule);
}

const records = await loadRecords();
const pageStates = await loadPageStates();
const stats = await screenshotStats();

const overview = `# 人工智能推理平台竞品研究总览

研究日期：2026-06-18

研究对象：局域网地址 \`http://192.168.11.88:8081/\`

研究身份：产品经理视角，重点拆解信息架构、核心对象、按钮交互、弹窗流程、空状态反馈、跨模块依赖和可借鉴设计。

## 本轮补充范围

本轮在原有页面级截图基础上，新增深度交互采集：悬停按钮、点击主操作、打开下拉、打开日期选择器、捕捉弹窗/确认层、记录空状态消息与安全跳过的高风险操作。所有截图已按模块分类存放在 \`competitive_research/screenshots_deep/\`。

${coverageTable(records, stats)}

## 研究边界与安全原则

${mdList([
  '本轮采集以真实登录后的页面为准，优先通过主应用菜单和真实 URL 进入子模块。',
  '对“删除、导出、保存、一键安装、状态测试、演示视频、网络保存”等可能产生副作用的操作，只记录按钮悬停或安全跳过截图，不执行最终确认。',
  '弹窗类操作只打开到表单/确认层，随后关闭；未提交新增、修改、删除、安装、网络配置或密码变更。',
  '当前系统存在较多空数据页面，因此分析重点放在字段设计、操作意图、校验反馈、空状态下一步引导和模块链路。',
  '新手引导弹窗在首次采集时出现，后续会话未稳定复现；文档中归档历史真实截图并结合触发条件做产品推断。',
])}

## 文档清单

${mdList([
  `[01_数据看板模块.md](${docFiles.dashboard})`,
  `[02_智能分析模块.md](${docFiles.smart})`,
  `[03_数据中心模块.md](${docFiles.data})`,
  `[04_平台管理模块.md](${docFiles.platform})`,
  `[05_新手引导弹窗模块.md](${docFiles.guide})`,
  `[06_跨模块依赖与交集.md](${docFiles.cross})`,
  `[07_深度截图索引.md](${docFiles.index})`,
])}

## 产品总体判断

${mdList([
  '该系统的主链路是“平台管理安装/治理能力 -> 智能分析接入输入源并编排任务 -> 数据中心沉淀与处置结果 -> 数据看板消费指标和态势”。',
  '菜单信息架构清晰地把生产链路、结果链路和治理链路分开，适合私有化 AI 推理平台，但新手冷启动依旧需要更强的任务向导。',
  '弹窗体系较完整：创建类弹窗承载表单，导入类弹窗承载模板下载和文件上传，日志类页面用消息提示处理空选择和无效操作。',
  '表格和筛选是主要工作形态：智能分析偏配置维护，数据中心偏检索处置，平台管理偏资源和权限治理。',
  '可优化方向集中在：空状态引导、风险操作二次确认、跨模块回跳、算法/任务/报警的详情页、运行健康与审计信息。',
])}
`;

const dashboardDoc = moduleDoc(
  '数据看板',
  '数据看板模块',
  `数据看板是平台的结果消费层和管理者入口。它通过“看板首页 + AI 智能管控中心”组织大屏场景，承担实时监控、业务概览、报警态势和指挥展示的职责。`,
  ['数据看板首页', 'AI智能管控中心'],
  records,
  pageStates,
  `## 模块设计思路\n\n${mdList([
    '把数据看板设计成场景入口集合，而不是直接堆叠复杂报表，有利于不同角色先选择“实时监控、业务概览、报警图片墙、AI 管控中心”等目标。',
    '创建看板按钮说明系统存在自定义能力，后续应设计模板、数据源、组件编排、权限共享和发布预览流程。',
    '顶部栏和应用中心在看板页暴露较多，说明看板既是结果页，也是跨模块入口页。',
  ])}`
);

const smartDoc = moduleDoc(
  '智能分析',
  '智能分析模块',
  `智能分析是平台的生产链路核心，把摄像头/图片输入、算法资产、人员/底库数据、分析任务、服务状态和结果推送串成可运行的 AI 推理业务。`,
  ['摄像头配置', '算法列表', '人员库', '算法底库', '视频流分析', '图片分析', '分析服务状态', '报警推送', '报警弹窗及语音'],
  records,
  pageStates,
  `## 模块设计思路\n\n${mdList([
    '信息架构从输入源开始，向算法配置、任务配置、运行服务、结果推送递进，符合 AI 推理平台“先接入，再识别，再输出”的业务路径。',
    '配置页多采用左侧分组/菜单 + 右侧表格的形态，适合大量对象维护。',
    '弹窗覆盖了新增摄像头、视频源管理、导入、虚拟算法、统计配置、添加人员、特征提取等关键动作，说明系统把复杂表单放在局部流程内完成。',
    '任务类页面已经具备启停、详情、删除、演示视频等操作，后续应强化任务详情的可观测性。',
  ])}`
);

const dataDoc = moduleDoc(
  '数据中心',
  '数据中心模块',
  `数据中心是平台的结果沉淀与运营处置层。它承接报警日志、推送日志、人员识别日志和陌生人识别日志，用于查询、审计、处理、归档、重推和导出。`,
  ['报警日志', '报警推送日志', '人员识别日志', '陌生人识别日志'],
  records,
  pageStates,
  `## 模块设计思路\n\n${mdList([
    '报警日志是事件处置主工作台，筛选、批量推送、处理、归档、导出和删除构成运营闭环。',
    '报警推送日志把外部系统联动单独拆出，页面直接显示自动重推和下一次重推时间，适合排障。',
    '人员识别与陌生人识别分别建日志，说明系统把身份类结果从通用报警中拆出，便于安全场景复核。',
    '空数据状态下仍保留完整筛选和字段结构，产品上应补充“去创建任务/配置摄像头”的下一步引导。',
  ])}`
);

const platformDoc = moduleDoc(
  '平台管理',
  '平台管理模块',
  `平台管理是系统治理层，覆盖离线算法仓库、用户与权限、基础系统配置、站内信和开放能力。它决定平台如何部署、授权、集成、维护和私有化交付。`,
  ['离线仓库', '用户管理', '用户组管理', '系统权限', '基础信息', '系统主题', '网络配置', '站内信', '接口授权', '接口文档', '免密登录', '对象存储'],
  records,
  pageStates,
  `## 模块设计思路\n\n${mdList([
    '离线仓库优先展示已安装算法包和版本，说明产品强烈面向内网/私有化场景。',
    '用户管理、用户组管理、系统权限三层组成权限治理基础，但权限矩阵、数据范围和按钮级权限仍可进一步显性化。',
    '基础信息、主题、网络配置把私有化交付中的品牌、时间、清理、网络等部署项集中管理。',
    '开放能力由接口授权、接口文档、免密登录、对象存储组成，覆盖第三方调用、单点接入和文件资源存储。',
  ])}`
);

const guideRecords = records.filter((item) => item.module === '新手引导弹窗');
const guideDoc = `# 新手引导弹窗模块

新手引导弹窗是系统冷启动的重要转化点。它不只是“欢迎”，而是把用户从登录后的大屏感知，引导到“添加摄像头并创建第一个视频流分析任务”的关键生产链路。

## 采集说明

${mdList([
  `本轮归档新手引导相关截图 ${guideRecords.length} 张。`,
  '该弹窗在首次登录采集中出现，后续独立会话未稳定复现，推测受首次访问状态、用户维度已读状态、系统是否已有摄像头/任务等条件控制。',
  '本轮未强行修改浏览器存储或后端状态去复现，以避免影响系统数据；使用历史真实截图进行设计分析。',
])}

${interactionSection('新手引导弹窗截图与交互明细', guideRecords, true)}

## 弹窗结构分析

${mdTable(['区域', '设计观察', '产品意图'], [
  ['遮罩与背景', '弹窗出现时底层仍是 AI 智能管控中心/看板背景', '让用户先看到平台最终价值，再引导进入配置链路。'],
  ['标题与文案', '欢迎使用人工智能推理平台，并提示添加摄像头、创建第一个视频流分析任务', '文案直接指向关键行动，避免泛泛介绍功能。'],
  ['主按钮', '开始配置', '主 CTA 应跳转到摄像头配置或任务创建流程，承担冷启动转化。'],
  ['关闭入口', '右上角关闭按钮', '允许熟练用户跳过，避免强制流程造成阻塞。'],
])}

## 实现方式推断

${mdList([
  '弹窗大概率是数据看板/主框架内的条件渲染组件，而不是独立路由，因为它出现时 URL 仍停留在主应用框架或看板页。',
  '触发条件可能来自后端配置状态，也可能来自用户维度的已读/已完成状态。后续会话不复现说明存在“已展示”或“系统已配置”的判断。',
  '开始配置按钮应与智能分析模块联动，理想路径是直接进入“新增摄像头”弹窗或“创建视频分析任务”向导。',
])}

## 优化建议

${mdList([
  '保留可恢复入口：用户关闭后仍可在首页或顶部帮助入口再次打开新手向导。',
  '做状态化向导：无摄像头时引导添加摄像头，有摄像头无任务时引导创建任务，有任务无推送时引导配置报警推送。',
  '每一步完成后回到看板展示结果，让用户形成“配置 -> 产生报警 -> 看板/数据中心查看”的闭环。',
  '按钮不要只跳页面，优先打开对应新增/创建弹窗，减少用户在菜单层级中迷路。',
])}
`;

const commonRecords = records.filter((item) => item.module === '通用导航与顶部栏');
const crossDoc = `# 跨模块依赖与交集

四个大模块不是并列孤岛，而是围绕 AI 推理业务形成闭环：平台管理提供算法和治理基础，智能分析把输入源与算法编排成任务，数据中心沉淀结果并完成处置，数据看板消费指标并展示态势。

## 总体链路

${mdTable(['链路阶段', '主责模块', '关键对象', '设计说明'], [
  ['能力准备', '平台管理', '离线算法包、解决方案、权限、对象存储', '算法安装、权限授权、存储和开放接口决定系统可用能力边界。'],
  ['输入接入', '智能分析', '摄像头、视频源、图片输入、人员库、算法底库', '让平台知道看哪里、识别什么、依赖哪些基础数据。'],
  ['任务执行', '智能分析', '视频流分析任务、图片分析任务、分析服务', '把输入与算法组合成可运行任务，并监控服务健康。'],
  ['结果沉淀', '数据中心', '报警日志、推送日志、人员识别日志、陌生人日志', '用于审计、处置、归档、导出和排障。'],
  ['结果展示', '数据看板', '实时监控、业务概览、报警图片墙、AI 管控中心', '面向管理者和值守人员展示全局态势。'],
])}

## 代表性证据截图

${mdTable(['依赖关系', '截图', '产品解读'], [
  ['平台管理 -> 智能分析', img(representative(records, '平台管理', '离线仓库', /页面全貌|上传/), 300), '离线仓库安装的算法包进入算法资产体系，之后才能在智能分析中创建任务或配置算法。'],
  ['智能分析 -> 数据中心', img(representative(records, '智能分析', '视频流分析', /页面全貌|创建视频分析任务/), 300), '视频流分析任务产生报警或识别结果，数据中心承接这些输出并提供查询处置。'],
  ['数据中心 -> 数据看板', img(representative(records, '数据中心', '报警日志', /页面全貌|推送|处理/), 300), '报警日志中的事件、状态和等级会成为看板报警趋势、图片墙和管控中心指标来源。'],
  ['全局导航贯穿全模块', img(commonRecords[0], 300), '顶部搜索、应用中心、站内信和账号入口跨模块固定存在，降低在深层页面切换成本。'],
  ['新手引导 -> 智能分析', img(guideRecords[0], 300), '新手引导把用户直接带向添加摄像头和创建视频分析任务，是系统冷启动的跨模块入口。'],
])}

## 交集对象模型

${mdTable(['对象', '涉及模块', '生命周期与交集'], [
  ['摄像头/视频源', '智能分析、数据中心、数据看板', '在摄像头配置中创建和分组；任务运行后生成报警；看板展示实时视频和报警态势。'],
  ['算法', '平台管理、智能分析、数据中心、数据看板', '在离线仓库安装；在算法列表中配置；在任务中被调用；结果进入日志和看板统计。'],
  ['分析任务', '智能分析、数据中心、数据看板', '在视频/图片分析中创建；运行后产生日志；状态和结果成为看板指标。'],
  ['报警事件', '智能分析、数据中心、数据看板、平台管理开放能力', '由任务产生；在数据中心处理/归档/推送；看板消费趋势；开放能力向外部系统推送。'],
  ['人员/陌生人', '智能分析、数据中心', '人员库维护基础数据；识别结果进入人员识别日志和陌生人日志。'],
  ['用户/权限', '平台管理、全部模块', '用户、用户组、系统权限决定菜单、按钮和数据范围可见性。'],
  ['对象存储', '平台管理、数据中心、数据看板', '存放报警截图、录制片段、算法包等文件资源，是日志证据和看板媒体展示的底座。'],
])}

## 产品设计建议

${mdList([
  '建立跨模块上下文跳转：从报警日志跳任务详情，从看板指标跳过滤后的日志，从算法卡片跳算法任务列表。',
  '统一对象命名：摄像头、视频源、点位、监控点等概念应在不同模块保持一致，减少理解成本。',
  '强化空状态下一步：数据中心无报警时应提示去创建任务；看板无数据时应提示配置摄像头和算法；平台无密钥时提示创建访问密钥。',
  '把新手引导做成闭环任务清单：添加摄像头、选择算法、创建任务、配置推送、查看报警/看板。',
  '补齐审计：删除、安装、保存网络、重置密码、强制重启等高风险操作应有二次确认、操作人、时间、结果和回滚提示。',
])}
`;

function indexDoc(records, stats) {
  const grouped = moduleOrder
    .map((module) => [module, records.filter((item) => item.module === module)])
    .filter(([, rows]) => rows.length);
  const sections = grouped.map(([module, rows]) => {
    const bySub = [...countBy(rows, (item) => item.submodule)];
    return `## ${module}\n\n${mdTable(['子模块', '截图/交互记录数'], bySub)}\n\n${mdTable(['截图', '子模块', '动作', '反馈/弹窗摘要', '设计说明'], rows.map((record) => [
      img(record, 180),
      record.submodule,
      `${record.actionLabel}<br>${record.actionType}`,
      overlayText(record) || clean(record.actionNote, 160),
      designNote(record),
    ]))}`;
  }).join('\n\n');
  return `# 深度截图索引\n\n本索引收录本轮深度采集产生的全部截图记录，便于按模块、子模块和动作回溯原始证据。\n\n${mdTable(['统计项', '数值'], [
    ['截图文件总数', `${stats.total}`],
    ['交互记录总数', `${records.length}`],
    ['截图目录', 'competitive_research/screenshots_deep/'],
    ['原始 JSON', 'competitive_research/raw/deep_interactions/'],
  ])}\n\n${coverageTable(records, stats)}\n\n${sections}`;
}

await writeFile(path.join(docsDir, docFiles.overview), overview, 'utf8');
await writeFile(path.join(docsDir, docFiles.dashboard), dashboardDoc, 'utf8');
await writeFile(path.join(docsDir, docFiles.smart), smartDoc, 'utf8');
await writeFile(path.join(docsDir, docFiles.data), dataDoc, 'utf8');
await writeFile(path.join(docsDir, docFiles.platform), platformDoc, 'utf8');
await writeFile(path.join(docsDir, docFiles.guide), guideDoc, 'utf8');
await writeFile(path.join(docsDir, docFiles.cross), crossDoc, 'utf8');
await writeFile(path.join(docsDir, docFiles.index), indexDoc(records, stats), 'utf8');

await writeFile(path.join(rawDir, 'deep_doc_summary.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  screenshotTotal: stats.total,
  recordTotal: records.length,
  docs: Object.values(docFiles),
  modules: moduleOrder.map((module) => ({
    module,
    records: records.filter((item) => item.module === module).length,
    submodules: unique(records.filter((item) => item.module === module).map((item) => item.submodule)),
  })),
}, null, 2), 'utf8');

console.log(`deep docs generated: ${records.length} records, ${stats.total} screenshots`);
