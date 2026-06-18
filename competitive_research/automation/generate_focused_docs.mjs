import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outRoot = path.join(root, 'competitive_research');
const docsDir = path.join(outRoot, 'docs');
const rawDir = path.join(outRoot, 'raw', 'focused_interactions');
const shotRoot = path.join(outRoot, 'screenshots_focused');

const markerStart = '<!-- FOCUSED_SUPPLEMENT_START -->';
const markerEnd = '<!-- FOCUSED_SUPPLEMENT_END -->';

const moduleDocs = {
  '数据看板': '01_数据看板模块.md',
  '智能分析': '02_智能分析模块.md',
  '数据中心': '03_数据中心模块.md',
  '平台管理': '04_平台管理模块.md',
};

const moduleOrder = ['数据看板', '智能分析', '数据中心', '平台管理'];

const moduleIntro = {
  '数据看板': [
    '本次按“公共顶部工具区只截一次、模块内只看业务差异”的原则补充业务区截图。数据看板的重点不再重复搜索菜单、应用中心、消息、语言和账号区，而是看场景入口卡片、创建看板弹窗，以及四类看板入口如何把用户导向不同结果消费场景。',
    '截图中的业务区裁剪已经避开顶部工具区，适合直接用于产品评审时讨论看板场景、入口层级和空状态引导。',
  ],
  '智能分析': [
    '本次重点补齐智能分析中容易遗漏的详情页、配置弹窗、tab 与分段控件，尤其是算法详情页的“算法信息 / 绘制对象管理 / 默认绘制样式”三段式配置。',
    '截图按业务区裁剪，避免重复展示顶部公共工具区；对保存、删除、恢复默认等可能改变配置的操作，仅做定位或悬停，不执行提交。',
  ],
  '数据中心': [
    '本次补图聚焦数据中心的结果消费与处置工作台，特别是报警日志的“视频流分析 / 图片分析”和“表格视图 / 宫格视图”切换，以及处理、归档、正误报统计等操作入口。',
    '顶部公共工具区不再重复纳入模块截图，文档只分析日志筛选、视图切换、处置动作和空数据反馈。',
  ],
  '平台管理': [
    '本次补图聚焦平台治理类页面的 tab 与配置动作，包括离线仓库、基础信息、系统主题、站内信和对象存储创建弹窗。',
    '对一键安装、同步本机时间、使用主题、全部标记已读、保存等有副作用的按钮，仅定位截图并给出风险设计说明。',
  ],
};

const submoduleAnalysis = {
  '数据看板首页': {
    summary: '看板首页以入口卡片组织场景，核心不是单个图表，而是把实时视频、业务概览、报警图片墙、AI 管控中心这些结果消费方式前置给用户选择。',
    design: '卡片点击进入弹窗或二级场景，说明系统试图用“场景入口 + 配置/打开流程”承接大屏使用；创建看板应继续补足模板选择、数据源绑定、组件布局、发布范围和预览校验。',
  },
  '算法详情-人员入侵识别': {
    summary: '算法详情页把一个算法拆成基础信息、阈值策略、绘制对象和默认样式四类配置，是算法从“可安装能力”转成“可业务化使用能力”的关键页。',
    design: '算法信息页用高精度、均衡、高检出三种模式降低阈值配置门槛，同时保留更多阈值给专家调参；绘制对象管理把检测类别、颜色和是否绘制表格化；默认绘制样式用实时预览降低配置风险。',
  },
  '视频流分析详情': {
    summary: '视频流分析详情采用步骤式 tab：先选择摄像头与算法，再配置任务，最后查看报警，符合实时分析任务的创建与运维顺序。',
    design: '详情页把输入、规则和结果放在一个弹窗/抽屉内，适合运营人员快速复核任务配置；建议从查看报警直接跳转到数据中心过滤后的报警日志。',
  },
  '创建视频分析任务': {
    summary: '创建任务弹窗把“实时分析 / 轮巡分析”作为第一层选择，先确定任务运行模式，再进入摄像头、算法和任务参数配置。',
    design: '实时分析强调持续守护，轮巡分析强调资源复用；产品上应配套展示算力占用、轮巡周期、失败重试和任务启停策略。',
  },
  '图片分析详情': {
    summary: '图片分析详情与视频分析类似，也按配置算法、配置任务、查看报警组织，但输入形态从视频流变成图片任务。',
    design: '该设计保持任务模型一致，利于用户迁移理解；建议补充图片来源、批量上传、分析结果保留周期和失败重跑机制。',
  },
  '报警推送创建': {
    summary: '报警推送创建弹窗把基础信息、场景选择、内容格式、存储/链接和预览串在一起，是报警事件进入外部系统前的最后一道配置。',
    design: '视频流分析场景与图片分析场景分开，有助于按任务类型控制推送范围；base64、对象存储、本地链接体现同一报警证据的多种交付方式。',
  },
  '报警弹窗及语音': {
    summary: '报警弹窗及语音页面按报警等级和音频动作组织，解决值守场景中的本地提醒问题。',
    design: '一级、二级、三级体现优先级差异，试听和替换让配置可验证；编辑入口说明系统支持对提醒策略做局部定制。',
  },
  '报警日志': {
    summary: '报警日志是数据中心的主工作台，补图覆盖了输入来源切换、列表/宫格视图切换，以及正误报统计、处理、归档等处置动作。',
    design: '视频流分析与图片分析区分来源，表格视图适合批量审计，宫格视图适合看图复核；处理和归档应记录操作人、处理结论、误报原因和备注。',
  },
  '人员识别日志': {
    summary: '人员识别日志围绕身份识别结果查询，核心是人员类别、日期和图片证据的筛选。',
    design: '白名单/黑名单在当前采集态未稳定命中，页面更像通过筛选项实现人员类别过滤；建议显式化 tab 状态并提供人员库回跳。',
  },
  '离线仓库': {
    summary: '离线仓库用“算法 / 解决方案”区分单一能力包和组合方案包，是平台能力准备阶段的入口。',
    design: '上传用于导入离线包，一键全部安装属于高风险批量动作，应配合安装清单、依赖检测、预计耗时、失败回滚和审计记录。',
  },
  '基础信息': {
    summary: '基础信息分成界面配置、系统配置、系统版本，覆盖品牌/界面、系统参数和版本可观测信息。',
    design: '上传通常关联 Logo 或资源文件；同步本机时间可能影响日志和任务调度，应作为受控操作，提供当前时间、目标时间和影响提示。',
  },
  '系统主题': {
    summary: '系统主题以主题卡片或 tab 列出极光、绽放蓝、金属暖黑、深海蓝等视觉方案，服务私有化部署的品牌/运维偏好。',
    design: '使用主题会改变全局体验，应支持预览后确认、回退默认主题和按用户/租户隔离。',
  },
  '站内信': {
    summary: '站内信按全部、已读消息、未读消息组织，承接算法安装、日志清理、告警处理等跨模块通知。',
    design: '全部标记已读属于批量状态变更，建议提供未读数量、消息分类、关联业务跳转和撤销提示。',
  },
  '对象存储': {
    summary: '对象存储创建弹窗区分阿里云 OSS 和联通测试等连接类型，是报警截图、录制片段、算法包等文件资源的存储底座。',
    design: '保存前应校验 endpoint、bucket、密钥权限和连通性；测试连接和权限检测应独立于最终保存，避免错误配置影响生产数据。',
  },
};

function esc(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|');
}

function clean(value, max = 260) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function img(record, width = 230) {
  return `<img src="../${record.screenshot}" width="${width}">`;
}

function mdTable(headers, rows) {
  return [
    `| ${headers.map(esc).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(esc).join(' | ')} |`),
  ].join('\n');
}

function stripSupplement(text) {
  const start = text.indexOf(markerStart);
  const end = text.indexOf(markerEnd);
  if (start !== -1 && end !== -1 && end > start) {
    return `${text.slice(0, start).trimEnd()}\n\n${text.slice(end + markerEnd.length).trimStart()}`;
  }
  return text;
}

function insertAfterSection(text, heading, block) {
  const cleanText = stripSupplement(text);
  const idx = cleanText.indexOf(heading);
  if (idx === -1) return `${cleanText.trimEnd()}\n\n${block}\n`;
  const next = cleanText.indexOf('\n## ', idx + heading.length);
  const insertAt = next === -1 ? cleanText.length : next;
  return `${cleanText.slice(0, insertAt).trimEnd()}\n\n${block}\n\n${cleanText.slice(insertAt).trimStart()}`;
}

function actionType(record) {
  if (record.meta?.click?.safeSkipped) return '安全定位';
  if (record.label.startsWith('Tab_')) return record.clip?.kind === 'overlay' ? '弹窗内切换' : 'Tab/分段切换';
  if (record.label.startsWith('操作_')) return record.clip?.kind === 'overlay' ? '弹窗操作' : '业务操作';
  if (record.label.startsWith('字段_')) return '字段/选择器';
  if (record.label.includes('默认态')) return record.clip?.kind === 'overlay' ? '弹窗默认态' : '业务区默认态';
  if (record.label.includes('打开前') || record.label.includes('进入前')) return '进入前状态';
  return record.clip?.kind === 'overlay' ? '弹窗截图' : '业务区截图';
}

function designNote(record) {
  const label = record.label.replace(/^Tab_/, '').replace(/^操作_/, '').replace(/^字段_/, '');
  if (record.meta?.click?.safeSkipped) {
    return `${label} 可能产生保存、删除、安装、归档、主题切换或配置变更，本次只定位/悬停截图。产品设计上应提供权限控制、二次确认、影响范围说明和操作审计。`;
  }
  if (record.label.includes('业务区域默认态')) {
    return '默认态用于观察页面主对象、筛选区、表格/卡片区和主操作分布；本图已避开顶部公共工具区，适合分析模块自身差异。';
  }
  if (record.label.startsWith('Tab_')) {
    return `切换 ${label} 后观察内容是否随 tab 独立变化。产品上 tab 应表达清晰的信息分组，并保留当前上下文，避免用户在配置任务时迷失。`;
  }
  if (record.label.startsWith('操作_')) {
    return `${label} 是该页面的业务动作入口。若打开弹窗/抽屉，应让用户在不离开当前列表的情况下完成配置；若只是状态按钮，应有明确反馈。`;
  }
  if (record.label.startsWith('字段_')) {
    return `${label} 代表筛选或选择器入口。筛选项应支持默认值、清空、组合查询和空状态解释，帮助用户定位日志或配置对象。`;
  }
  if (record.label.includes('打开前') || record.label.includes('进入前')) {
    return '进入前截图用于保留列表上下文，说明用户从哪个对象或主操作进入详情/弹窗。';
  }
  return clean(record.note || '该截图用于补足业务区交互证据。');
}

function buildFocusedBlock(moduleName, records) {
  const bySub = new Map();
  for (const record of records) {
    if (!bySub.has(record.submodule)) bySub.set(record.submodule, []);
    bySub.get(record.submodule).push(record);
  }
  const counts = [...bySub.entries()].map(([name, rows]) => [name, String(rows.length)]);
  const safeCount = records.filter((row) => row.meta?.click?.safeSkipped).length;
  const overlayCount = records.filter((row) => row.clip?.kind === 'overlay').length;
  const businessCount = records.filter((row) => row.clip?.kind === 'business').length;
  const intro = moduleIntro[moduleName] || [];
  const lines = [
    markerStart,
    '## 业务区聚焦补充',
    '',
    ...intro.map((item) => `- ${item}`),
    `- 本次新增聚焦截图 ${records.length} 张，其中业务区裁剪 ${businessCount} 张、弹窗/抽屉裁剪 ${overlayCount} 张、安全定位 ${safeCount} 张；这些图片存放在 \`competitive_research/screenshots_focused/\`。`,
    '- 你标红的顶部搜索、应用中心、通知、语言、账号等公共区域，只在总览和截图索引的“通用导航与顶部栏”中保留一次；下面各图只用于分析模块业务区域。',
    '',
    mdTable(['子模块/场景', '聚焦截图数'], counts),
    '',
  ];

  for (const [submodule, rows] of bySub.entries()) {
    const note = submoduleAnalysis[submodule] || {};
    lines.push(`### ${submodule} 聚焦截图与设计说明`);
    if (note.summary) lines.push('', `- 业务定位：${note.summary}`);
    if (note.design) lines.push(`- 产品设计思考：${note.design}`);
    lines.push('');
    lines.push(mdTable(
      ['截图', '交互点', '类型/命中状态', '业务设计说明'],
      rows.map((row) => {
        const click = row.meta?.click;
        const hit = click ? (click.ok ? '已命中' : '未稳定命中') : '状态截图';
        const safe = click?.safeSkipped ? '<br>未执行最终提交' : '';
        return [
          img(row),
          `${row.submodule}<br>${row.label}`,
          `${actionType(row)}<br>${hit}${safe}`,
          designNote(row),
        ];
      }),
    ));
    lines.push('');
  }

  lines.push(markerEnd);
  return lines.join('\n');
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function loadFocusedRecords() {
  const files = (await readdir(rawDir))
    .filter((name) => /^focused_index_.*\.json$/.test(name))
    .sort();
  const records = [];
  for (const file of files) {
    const rows = JSON.parse(await readFile(path.join(rawDir, file), 'utf8'));
    for (const row of rows) {
      if (row.screenshot) records.push({ ...row, sourceFile: file });
    }
  }
  records.sort((a, b) => {
    const ma = moduleOrder.indexOf(a.module) - moduleOrder.indexOf(b.module);
    if (ma) return ma;
    if (a.submodule !== b.submodule) return String(a.submodule).localeCompare(String(b.submodule), 'zh-Hans-CN');
    return String(a.id || a.screenshot).localeCompare(String(b.id || b.screenshot), 'zh-Hans-CN');
  });
  return records;
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
  const byDir = new Map();
  for (const file of rows) {
    const key = path.relative(shotRoot, path.dirname(file)).replaceAll('\\', '/');
    byDir.set(key, (byDir.get(key) || 0) + 1);
  }
  return { total: rows.length, byDir };
}

function buildFocusedIndex(records, stats) {
  const byModule = new Map();
  for (const record of records) {
    if (!byModule.has(record.module)) byModule.set(record.module, []);
    byModule.get(record.module).push(record);
  }
  const lines = [
    '## 业务区聚焦截图索引',
    '',
    '本节是对深度截图的二次整理，重点回应“公共顶部工具区不要在各模块重复截图、带 tab 的页面需要逐 tab 记录”的检查意见。',
    '',
    mdTable(
      ['统计项', '数值'],
      [
        ['聚焦截图文件总数', String(stats.total)],
        ['聚焦交互记录总数', String(records.length)],
        ['聚焦截图目录', 'competitive_research/screenshots_focused/'],
        ['聚焦原始 JSON', 'competitive_research/raw/focused_interactions/'],
      ],
    ),
    '',
    mdTable(
      ['目录', '截图数'],
      [...stats.byDir.entries()].sort().map(([dir, count]) => [dir, String(count)]),
    ),
    '',
  ];

  for (const moduleName of moduleOrder) {
    const rows = byModule.get(moduleName) || [];
    if (!rows.length) continue;
    lines.push(`### ${moduleName}`);
    lines.push('');
    const bySub = new Map();
    for (const row of rows) {
      if (!bySub.has(row.submodule)) bySub.set(row.submodule, []);
      bySub.get(row.submodule).push(row);
    }
    lines.push(mdTable(['子模块/场景', '聚焦截图数'], [...bySub.entries()].map(([name, items]) => [name, String(items.length)])));
    lines.push('');
    lines.push(mdTable(
      ['截图', '子模块', '交互点', '说明'],
      rows.map((row) => [
        img(row, 180),
        row.submodule,
        `${row.label}<br>${actionType(row)}`,
        clean(designNote(row), 180),
      ]),
    ));
    lines.push('');
  }
  return lines.join('\n');
}

async function updateOverview(records, stats) {
  const file = path.join(docsDir, '00_研究总览.md');
  let text = await readFile(file, 'utf8');
  text = text.replace(/\n\n补充修正：针对截图中标红的重复顶部工具区，已新增业务区聚焦采集；公共顶部工具区只在通用导航中保留一次，模块文档优先使用裁剪后的业务区、tab、弹窗和按钮截图。/g, '');
  const block = [
    markerStart,
    '## 本轮标红问题修正',
    '',
    '- 用户标红的顶部搜索、应用中心、通知、语言和账号区域已被归类为“公共顶部工具区”。该区域只在 `screenshots_deep/00_common/` 和索引的通用导航章节保留一次，后续模块分析不再重复使用这块区域作为业务截图。',
    `- 新增 \`screenshots_focused/\` 聚焦截图 ${stats.total} 张，覆盖 ${records.length} 条业务区交互记录；其中 tab/分段控件、弹窗/抽屉和安全定位操作均已按模块归档。`,
    '- 业务模块文档新增“业务区聚焦补充”章节，用于分析每个 tab、按钮、弹窗和局部配置区；原 `screenshots_deep/` 继续作为完整历史证据保留。',
    '',
    mdTable(
      ['模块', '聚焦截图/记录数', '重点补充'],
      moduleOrder.map((moduleName) => {
        const rows = records.filter((row) => row.module === moduleName);
        const subs = [...new Set(rows.map((row) => row.submodule))].join('、');
        return [moduleName, String(rows.length), subs];
      }),
    ),
    markerEnd,
  ].join('\n');
  text = insertAfterSection(text, '## 本轮补充范围', block);
  text = text.replace(
    /本轮在原有页面级截图基础上，新增深度交互采集：([^\n]+)/,
    '本轮在原有页面级截图基础上，新增深度交互采集：$1\n\n补充修正：针对截图中标红的重复顶部工具区，已新增业务区聚焦采集；公共顶部工具区只在通用导航中保留一次，模块文档优先使用裁剪后的业务区、tab、弹窗和按钮截图。'
  );
  await writeFile(file, text, 'utf8');
}

async function updateCross(records) {
  const file = path.join(docsDir, '06_跨模块依赖与交集.md');
  let text = await readFile(file, 'utf8');
  const pick = (submodule, labelPart) => records.find((row) => row.submodule === submodule && row.label.includes(labelPart)) || records.find((row) => row.submodule === submodule);
  const examples = [
    ['算法参数配置 -> 任务运行', pick('算法详情-人员入侵识别', '默认绘制样式'), '算法详情中的阈值、绘制对象和默认样式会影响后续视频/图片分析任务的识别结果与报警可解释性。'],
    ['任务配置 -> 报警日志', pick('视频流分析详情', '查看报警'), '视频流分析详情中的“查看报警”与数据中心报警日志形成直接闭环，建议支持带条件跳转。'],
    ['报警推送 -> 对象存储', pick('报警推送创建', '对象存储'), '报警推送可选择 base64、对象存储、本地链接等证据交付方式，依赖平台管理中的存储配置。'],
    ['平台治理 -> 全局体验', pick('系统主题', '使 用'), '系统主题、基础信息、站内信等平台配置会影响所有业务模块，是公共能力而不是单页能力。'],
  ].filter((row) => row[1]);
  const block = [
    markerStart,
    '## 聚焦补图后的交集补充',
    '',
    '本次复查后，将顶部搜索、应用中心、通知、语言、账号统一归为公共顶部工具区；跨模块分析不再把它们重复计入每个业务模块，而是关注业务对象之间的依赖。',
    '',
    mdTable(
      ['依赖关系', '聚焦截图', '产品解读'],
      examples.map(([name, record, note]) => [name, img(record, 280), note]),
    ),
    markerEnd,
  ].join('\n');
  text = insertAfterSection(text, '## 代表性证据截图', block);
  await writeFile(file, text, 'utf8');
}

async function updateIndex(records, stats) {
  const file = path.join(docsDir, '07_深度截图索引.md');
  let text = await readFile(file, 'utf8');
  const block = [markerStart, buildFocusedIndex(records, stats), markerEnd].join('\n');
  text = insertAfterSection(text, '## 通用导航与顶部栏', block);
  text = text.replace(
    /\| 截图目录 \| competitive_research\/screenshots_deep\/ \|/,
    '| 截图目录 | competitive_research/screenshots_deep/ |\n| 聚焦截图目录 | competitive_research/screenshots_focused/ |'
  );
  text = text.replace(
    /\| 原始 JSON \| competitive_research\/raw\/deep_interactions\/ \|/,
    '| 原始 JSON | competitive_research/raw/deep_interactions/ |\n| 聚焦原始 JSON | competitive_research/raw/focused_interactions/ |'
  );
  await writeFile(file, text, 'utf8');
}

async function updateModuleDocs(records) {
  for (const [moduleName, fileName] of Object.entries(moduleDocs)) {
    const file = path.join(docsDir, fileName);
    const rows = records.filter((record) => record.module === moduleName);
    if (!rows.length) continue;
    let text = await readFile(file, 'utf8');
    const block = buildFocusedBlock(moduleName, rows);
    text = insertAfterSection(text, '## 模块设计思路', block);
    await writeFile(file, text, 'utf8');
  }
}

async function main() {
  await mkdir(docsDir, { recursive: true });
  const records = await loadFocusedRecords();
  const stats = await screenshotStats();
  await updateModuleDocs(records);
  await updateOverview(records, stats);
  await updateCross(records);
  await updateIndex(records, stats);
  await writeFile(
    path.join(rawDir, 'focused_doc_summary.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), records: records.length, screenshots: stats.total }, null, 2),
    'utf8',
  );
  console.log(`focused docs updated: records=${records.length}, screenshots=${stats.total}`);
}

main().catch((err) => {
  console.error(err.stack || err);
  process.exitCode = 1;
});
