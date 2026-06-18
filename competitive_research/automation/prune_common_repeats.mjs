import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const docsDir = path.join(root, 'competitive_research', 'docs');
const targets = [
  '01_数据看板模块.md',
  '02_智能分析模块.md',
  '03_数据中心模块.md',
  '04_平台管理模块.md',
  '07_深度截图索引.md',
];

function isRepeatedGlobalToolbarLine(line) {
  if (!line.includes('<img src="../screenshots_deep/')) return false;
  if (line.includes('/00_common/')) return false;
  if (line.includes('../screenshots_focused/')) return false;
  if (line.includes('搜索菜单')) return true;
  if (line.includes('dropdown-trigger')) return true;
  return false;
}

for (const name of targets) {
  const file = path.join(docsDir, name);
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/);
  let removed = 0;
  const kept = lines.filter((line) => {
    const drop = isRepeatedGlobalToolbarLine(line);
    if (drop) removed += 1;
    return !drop;
  });
  const prefix = name === '07_深度截图索引.md'
    ? [
        '<!-- COMMON_REPEAT_PRUNE_NOTE -->',
        '> 整理说明：模块内重复出现的顶部搜索、应用中心、通知、语言、账号等公共工具区截图，已从业务模块索引中剔除；完整公共区域截图统一保留在“通用导航与顶部栏”章节。',
        '<!-- COMMON_REPEAT_PRUNE_NOTE_END -->',
        '',
      ].join('\n')
    : [
        '<!-- COMMON_REPEAT_PRUNE_NOTE -->',
        '> 整理说明：用户标红的顶部搜索、应用中心、通知、语言、账号等公共工具区，只在总览/通用导航章节保留一次；本模块已剔除重复公共区域截图，保留业务区、tab、弹窗和按钮截图。',
        '<!-- COMMON_REPEAT_PRUNE_NOTE_END -->',
        '',
      ].join('\n');
  let out = kept.join('\n');
  out = out.replace(/<!-- COMMON_REPEAT_PRUNE_NOTE -->[\s\S]*?<!-- COMMON_REPEAT_PRUNE_NOTE_END -->\n*/g, '');
  const insertAt = out.indexOf('\n\n');
  if (insertAt !== -1) {
    out = `${out.slice(0, insertAt + 2)}${prefix}${out.slice(insertAt + 2)}`;
  } else {
    out = `${out}\n\n${prefix}`;
  }
  await writeFile(file, out, 'utf8');
  console.log(`${name}: removed ${removed} repeated global-toolbar rows`);
}
