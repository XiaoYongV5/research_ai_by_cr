import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const siteRoot = path.join(root, 'competitive_research');
const docsDir = path.join(siteRoot, 'docs');
const pageDir = path.join(siteRoot, 'page');
const assetsDir = path.join(pageDir, 'assets');

const docFiles = (await readdir(docsDir))
  .filter((name) => /^\d{2}_.*\.md$/.test(name))
  .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function stripInline(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .trim();
}

function htmlFileName(mdName) {
  return mdName.replace(/\.md$/i, '.html');
}

function fixHref(href) {
  const value = String(href || '').trim();
  if (!value || /^[a-z]+:/i.test(value) || value.startsWith('#')) return value;
  const hashIndex = value.indexOf('#');
  const base = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : value.slice(hashIndex);
  if (/\.md$/i.test(base)) return `${base.replace(/\.md$/i, '.html')}${hash}`;
  return value;
}

function enhanceImageTag(tag) {
  const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] || '';
  let out = tag;
  if (/\bclass\s*=\s*["'][^"']*["']/i.test(out)) {
    out = out.replace(/\bclass\s*=\s*["']([^"']*)["']/i, (_m, cls) => `class="${escapeAttr(`${cls} doc-image`.trim())}"`);
  } else {
    out = out.replace(/<img\b/i, '<img class="doc-image"');
  }
  if (!/\bloading\s*=/.test(out)) out = out.replace(/<img\b/i, '<img loading="lazy"');
  if (!/\balt\s*=/.test(out)) out = out.replace(/<img\b/i, '<img alt="截图"');
  if (src && !/\bdata-full\s*=/.test(out)) out = out.replace(/<img\b/i, `<img data-full="${escapeAttr(src)}"`);
  return out;
}

function withPlaceholders(text, replacements) {
  return text.replace(/\u0000(\d+)\u0000/g, (_m, idx) => replacements[Number(idx)] ?? '');
}

function stash(replacements, html) {
  const idx = replacements.length;
  replacements.push(html);
  return `\u0000${idx}\u0000`;
}

function renderInline(source) {
  const replacements = [];
  let text = String(source ?? '');

  text = text.replace(/<img\b[^>]*>/gi, (match) => stash(replacements, enhanceImageTag(match)));
  text = text.replace(/<br\s*\/?>/gi, () => stash(replacements, '<br>'));
  text = text.replace(/`([^`]+)`/g, (_match, code) => stash(replacements, `<code>${escapeHtml(code)}</code>`));
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const fixed = fixHref(href);
    return stash(replacements, `<a href="${escapeAttr(fixed)}">${renderInline(label)}</a>`);
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, (_match, strong) => stash(replacements, `<strong>${escapeHtml(strong)}</strong>`));

  return withPlaceholders(escapeHtml(text), replacements);
}

function isTableSeparator(line) {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((item) => item.trim());
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitTableRow(line) {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|')) value = value.slice(0, -1);
  const cells = [];
  let current = '';
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      current += char;
      continue;
    }
    if (char === '|') {
      cells.push(current.trim().replace(/\\\|/g, '|'));
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim().replace(/\\\|/g, '|'));
  return cells;
}

function renderTable(lines) {
  const header = splitTableRow(lines[0]);
  const body = lines.slice(2).map(splitTableRow);
  const thead = `<thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<div class="table-wrap"><table>${thead}${tbody}</table></div>`;
}

function makeHeadingId(state, text) {
  state.headingCount += 1;
  const compact = stripInline(text)
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]+/gu, '')
    .slice(0, 48);
  const base = compact || `section-${state.headingCount}`;
  const current = state.headingIds.get(base) || 0;
  state.headingIds.set(base, current + 1);
  return current ? `${base}-${current + 1}` : base;
}

function closeList(state, html) {
  if (state.listType) {
    html.push(`</${state.listType}>`);
    state.listType = '';
  }
}

function openList(state, html, type) {
  if (state.listType === type) return;
  closeList(state, html);
  state.listType = type;
  html.push(`<${type}>`);
}

function flushParagraph(state, html) {
  if (!state.paragraph.length) return;
  html.push(`<p>${renderInline(state.paragraph.join(' '))}</p>`);
  state.paragraph = [];
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const state = {
    paragraph: [],
    listType: '',
    headingCount: 0,
    headingIds: new Map(),
    toc: [],
    title: '',
  };
  const html = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph(state, html);
      closeList(state, html);
      continue;
    }

    if (trimmed.startsWith('<!--')) {
      flushParagraph(state, html);
      closeList(state, html);
      while (i < lines.length && !lines[i].includes('-->')) i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      flushParagraph(state, html);
      closeList(state, html);
      const lang = trimmed.slice(3).trim();
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      html.push(`<pre><code${lang ? ` class="language-${escapeAttr(lang)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph(state, html);
      closeList(state, html);
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = makeHeadingId(state, text);
      if (!state.title && level === 1) state.title = stripInline(text);
      if (level <= 3) state.toc.push({ level, text: stripInline(text), id });
      html.push(`<h${level} id="${escapeAttr(id)}">${renderInline(text)}</h${level}>`);
      continue;
    }

    if (trimmed.startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushParagraph(state, html);
      closeList(state, html);
      const tableLines = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i += 1;
      }
      i -= 1;
      html.push(renderTable(tableLines));
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph(state, html);
      closeList(state, html);
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      i -= 1;
      html.push(`<blockquote><p>${renderInline(quote.join(' '))}</p></blockquote>`);
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph(state, html);
      openList(state, html, 'ul');
      html.push(`<li>${renderInline(unordered[1])}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph(state, html);
      openList(state, html, 'ol');
      html.push(`<li>${renderInline(ordered[1])}</li>`);
      continue;
    }

    if (/^<img\b/i.test(trimmed)) {
      flushParagraph(state, html);
      closeList(state, html);
      html.push(`<figure class="image-block">${enhanceImageTag(trimmed)}</figure>`);
      continue;
    }

    closeList(state, html);
    state.paragraph.push(line);
  }

  flushParagraph(state, html);
  closeList(state, html);
  return { title: state.title || '竞品研究文档', toc: state.toc, html: html.join('\n') };
}

function buildNav(currentFile) {
  return docFiles.map((name) => {
    const href = htmlFileName(name);
    const label = name.replace(/\.md$/i, '');
    const current = name === currentFile ? ' aria-current="page"' : '';
    return `<a${current} href="${escapeAttr(href)}" data-title="${escapeAttr(label)}">${escapeHtml(label)}</a>`;
  }).join('\n');
}

function buildToc(toc) {
  const items = toc.filter((item) => item.level === 2 || item.level === 3);
  if (!items.length) return '<p class="muted">本页暂无大纲。</p>';
  const groups = [];
  for (const item of items) {
    if (item.level === 2 || !groups.length) {
      groups.push({ heading: item.level === 2 ? item : { level: 2, text: '页面内容', id: item.id }, children: item.level === 3 ? [item] : [] });
    } else {
      groups[groups.length - 1].children.push(item);
    }
  }
  return groups.map((group) => {
    const children = group.children
      .map((child) => `<a class="outline-link outline-level-3" href="#${escapeAttr(child.id)}">${escapeHtml(child.text)}</a>`)
      .join('\n');
    if (!children) {
      return `<div class="outline-group outline-leaf">
        <a class="outline-link outline-level-2" href="#${escapeAttr(group.heading.id)}">${escapeHtml(group.heading.text)}</a>
      </div>`;
    }
    return `<details class="outline-group" open>
      <summary><span class="outline-caret" aria-hidden="true"></span><a class="outline-link outline-level-2" href="#${escapeAttr(group.heading.id)}">${escapeHtml(group.heading.text)}</a></summary>
      ${children ? `<div class="outline-children">${children}</div>` : ''}
    </details>`;
  }).join('\n');
}

function docDisplayName(mdName) {
  return mdName.replace(/\.md$/i, '');
}

function pageTurnLink(pageName, direction, emptyText) {
  const label = direction === 'prev' ? '上一篇' : '下一篇';
  if (!pageName) {
    return `<span class="page-turn page-turn-${direction} is-disabled" aria-disabled="true">
      <span>${label}</span>
      <strong>${escapeHtml(emptyText)}</strong>
    </span>`;
  }
  return `<a class="page-turn page-turn-${direction}" href="${escapeAttr(htmlFileName(pageName))}">
    <span>${label}</span>
    <strong>${escapeHtml(docDisplayName(pageName))}</strong>
  </a>`;
}

function buildPager(mdName, place) {
  const index = docFiles.indexOf(mdName);
  const prev = index > 0 ? docFiles[index - 1] : '';
  const next = index >= 0 && index < docFiles.length - 1 ? docFiles[index + 1] : '';
  const className = place === 'top' ? 'page-pager page-pager-top' : 'page-pager page-pager-bottom';
  return `<nav class="${className}" aria-label="文档翻页">
    ${pageTurnLink(prev, 'prev', '已经是第一篇')}
    ${pageTurnLink(next, 'next', '已经是最后一篇')}
  </nav>`;
}

function buildPage({ mdName, title, body, toc }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - 竞品研究</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <a class="brand-text" href="index.html" aria-label="返回首页">
          <span class="brand-kicker">Competitive Research</span>
          <strong>人工智能推理平台</strong>
        </a>
        <button class="sidebar-toggle" type="button" aria-label="折叠菜单" aria-expanded="true"></button>
      </div>
      <nav class="doc-nav" aria-label="文档导航">
        ${buildNav(mdName)}
      </nav>
    </aside>
    <main class="main">
      <header class="page-header">
        <div class="page-title-block">
          <span class="page-kicker">HTML 阅读版</span>
          <h1>${escapeHtml(title)}</h1>
        </div>
        ${buildPager(mdName, 'top')}
      </header>
      <div class="content-layout">
        <article class="doc-content">
          ${body}
        </article>
        ${buildPager(mdName, 'bottom')}
      </div>
    </main>
  </div>
  <aside class="outline" id="page-outline" aria-label="页面大纲">
    <div class="outline-rail" aria-hidden="true">
      <span></span><span></span><span></span><span></span><span></span><span></span>
    </div>
    <section class="outline-panel">
      <header class="outline-header">
        <h2>大纲</h2>
        <div class="outline-actions">
          <button class="outline-pin" type="button" aria-pressed="false" title="固定大纲">固定</button>
          <button class="outline-collapse" type="button" title="折叠大纲">折叠</button>
        </div>
      </header>
      <div class="outline-scroll">
        ${buildToc(toc)}
      </div>
    </section>
  </aside>
  <div class="lightbox" id="lightbox" aria-hidden="true">
    <button class="lightbox-close" type="button" aria-label="关闭图片预览">×</button>
    <img alt="放大预览">
    <div class="lightbox-caption"></div>
  </div>
  <script src="assets/lightbox.js"></script>
</body>
</html>`;
}

function buildIndex(pages) {
  const startPage = pages.find((page) => page.source.startsWith('00_'))?.file || pages[0]?.file || '#';
  const imageRefs = pages.reduce((total, page) => total + [...page.html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].length, 0);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>人工智能推理平台深度分析</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body class="index-page">
  <main class="index-shell">
    <section class="index-hero">
      <div class="hero-board hero-board-left">
        <span>信息架构</span>
        <strong>4 大应用模块</strong>
        <i></i>
      </div>
      <div class="hero-board hero-board-right">
        <span>交互资产</span>
        <strong>${imageRefs} 张图片引用</strong>
        <i></i>
      </div>
      <div class="hero-bg-icon hero-bg-icon-flow" aria-hidden="true">
        <span class="flow-node flow-node-a"></span>
        <span class="flow-node flow-node-b"></span>
        <span class="flow-node flow-node-c"></span>
        <span class="flow-line flow-line-a"></span>
        <span class="flow-line flow-line-b"></span>
      </div>
      <div class="hero-bg-icon hero-bg-icon-chip" aria-hidden="true">
        <span class="chip-core"></span>
        <span class="chip-pin chip-pin-a"></span>
        <span class="chip-pin chip-pin-b"></span>
        <span class="chip-pin chip-pin-c"></span>
        <span class="chip-pin chip-pin-d"></span>
      </div>
      <div class="hero-symbol" aria-hidden="true"><span></span></div>
      <h1>人工智能推理平台深度分析</h1>
      <p class="index-intro">本目录由 <code>competitive_research/docs</code> 生成，产品经理视角，重点拆解信息架构、核心对象、弹窗流程、跨模块依赖和可借鉴设计。</p>
      <a class="index-start" href="${escapeAttr(startPage)}">立即开始</a>
    </section>
  </main>
</body>
</html>`;
}

const css = `
:root {
  color-scheme: light;
  --bg: #f5f7fb;
  --paper: #ffffff;
  --paper-soft: #f8fafc;
  --text: #202735;
  --muted: #687386;
  --line: #dfe5ef;
  --accent: #2563eb;
  --accent-soft: #e8f0ff;
  --danger: #b42318;
  --shadow: 0 18px 50px rgba(29, 41, 57, 0.10);
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", Arial, sans-serif;
  font-size: 15px;
  line-height: 1.72;
}

a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code {
  padding: 2px 6px;
  border-radius: 5px;
  background: #eef2f7;
  color: #23314a;
  font-family: Consolas, "SFMono-Regular", Menlo, monospace;
  font-size: 0.92em;
}
pre {
  overflow: auto;
  padding: 16px;
  border-radius: 8px;
  background: #111827;
  color: #e5e7eb;
}
pre code { padding: 0; background: transparent; color: inherit; }

.app-shell {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  min-height: 100vh;
  transition: grid-template-columns .18s ease;
}
body.sidebar-collapsed .app-shell {
  grid-template-columns: 76px minmax(0, 1fr);
}
.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: auto;
  padding: 22px 16px;
  border-right: 1px solid var(--line);
  background: #101828;
  color: #ffffff;
}
.brand {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 8px 18px;
  border-bottom: 1px solid rgba(255,255,255,.14);
}
.brand-text {
  min-width: 0;
  color: #ffffff;
  text-decoration: none;
}
.brand-text:hover {
  color: #ffffff;
  text-decoration: none;
}
.brand-kicker,
.page-kicker {
  display: block;
  margin-bottom: 6px;
  color: #6b8cff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .02em;
  text-transform: uppercase;
}
.brand strong {
  display: block;
  font-size: 18px;
  line-height: 1.35;
}
.sidebar-toggle {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 6px;
  background: rgba(255,255,255,.08);
  cursor: pointer;
  position: relative;
}
.sidebar-toggle:hover {
  background: rgba(255,255,255,.15);
}
.sidebar-toggle::before,
.sidebar-toggle::after {
  content: "";
  position: absolute;
  left: 9px;
  width: 11px;
  height: 2px;
  border-radius: 999px;
  background: rgba(255,255,255,.88);
  transition: transform .16s ease;
}
.sidebar-toggle::before {
  top: 10px;
  transform: rotate(35deg);
}
.sidebar-toggle::after {
  bottom: 10px;
  transform: rotate(-35deg);
}
body.sidebar-collapsed .sidebar-toggle::before {
  transform: rotate(-35deg);
}
body.sidebar-collapsed .sidebar-toggle::after {
  transform: rotate(35deg);
}
.doc-nav {
  display: grid;
  gap: 6px;
  margin-top: 18px;
}
.doc-nav a {
  display: block;
  padding: 9px 10px;
  border-radius: 7px;
  color: rgba(255,255,255,.78);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
}
.doc-nav a:hover,
.doc-nav a[aria-current="page"] {
  background: rgba(255,255,255,.12);
  color: #ffffff;
  text-decoration: none;
}
body.sidebar-collapsed .brand {
  display: grid;
  justify-items: center;
  padding: 4px 0 14px;
}
body.sidebar-collapsed .brand-text {
  display: none;
}
body.sidebar-collapsed .doc-nav {
  gap: 8px;
}
body.sidebar-collapsed .doc-nav a {
  width: 44px;
  height: 38px;
  margin: 0 auto;
  padding: 0;
  color: transparent;
}
body.sidebar-collapsed .doc-nav a::before {
  content: attr(href);
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgba(255,255,255,.84);
  font-size: 13px;
  font-weight: 700;
}
body.sidebar-collapsed .doc-nav a[href^="00_"]::before { content: "00"; }
body.sidebar-collapsed .doc-nav a[href^="01_"]::before { content: "01"; }
body.sidebar-collapsed .doc-nav a[href^="02_"]::before { content: "02"; }
body.sidebar-collapsed .doc-nav a[href^="03_"]::before { content: "03"; }
body.sidebar-collapsed .doc-nav a[href^="04_"]::before { content: "04"; }
body.sidebar-collapsed .doc-nav a[href^="05_"]::before { content: "05"; }
body.sidebar-collapsed .doc-nav a[href^="06_"]::before { content: "06"; }
body.sidebar-collapsed .doc-nav a[href^="07_"]::before { content: "07"; }
body.sidebar-collapsed .doc-nav a:hover::after {
  content: attr(data-title);
  position: fixed;
  left: 74px;
  z-index: 60;
  max-width: 280px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #111827;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 12px 30px rgba(15, 23, 42, .25);
}

.main { min-width: 0; }
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 30px 38px 22px;
  border-bottom: 1px solid var(--line);
  background: rgba(255,255,255,.82);
  backdrop-filter: blur(10px);
}
.page-title-block {
  min-width: 0;
}
.page-header h1 {
  margin: 0;
  font-size: 30px;
  line-height: 1.25;
  letter-spacing: 0;
}
.page-pager {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.page-pager-top {
  flex: 0 1 460px;
  justify-content: flex-end;
}
.page-pager-bottom {
  max-width: 1680px;
  margin: 22px auto 0;
}
.page-turn {
  position: relative;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  column-gap: 10px;
  min-width: 0;
  max-width: 360px;
  padding: 8px 14px 8px 10px;
  border: 1px solid rgba(15, 23, 42, .08);
  border-radius: 999px;
  background: rgba(255,255,255,.72);
  color: var(--text);
  box-shadow: none;
  backdrop-filter: blur(12px);
  transition: border-color .16s ease, background .16s ease, transform .16s ease;
}
.page-turn:hover {
  border-color: rgba(37, 99, 235, .28);
  background: #ffffff;
  text-decoration: none;
  transform: translateY(-1px);
}
.page-turn::before {
  content: "";
  grid-column: 1;
  grid-row: 1 / span 2;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(15, 23, 42, .08);
  border-radius: 50%;
  background: #f7f8fb;
}
.page-turn::after {
  content: "";
  position: absolute;
  left: 23px;
  top: 50%;
  width: 7px;
  height: 7px;
  border-top: 2px solid #64748b;
  border-right: 2px solid #64748b;
  transform: translateY(-50%) rotate(-135deg);
}
.page-turn span {
  grid-column: 2;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
}
.page-turn strong {
  grid-column: 2;
  overflow: hidden;
  color: #1f2937;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.page-turn-next {
  grid-template-columns: minmax(0, 1fr) 30px;
  padding: 8px 10px 8px 14px;
  text-align: right;
}
.page-turn-next::before {
  grid-column: 2;
}
.page-turn-next::after {
  right: 23px;
  left: auto;
  transform: translateY(-50%) rotate(45deg);
}
.page-turn-next span,
.page-turn-next strong {
  grid-column: 1;
}
.page-turn.is-disabled {
  opacity: .42;
  cursor: default;
}
.page-turn.is-disabled:hover {
  border-color: rgba(15, 23, 42, .08);
  background: rgba(255,255,255,.72);
  transform: none;
}
.content-layout {
  display: block;
  padding: 28px 38px 48px;
}
.doc-content {
  min-width: 0;
  max-width: 1680px;
  margin: 0 auto;
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
  box-shadow: var(--shadow);
}

.outline {
  position: fixed;
  top: 112px;
  right: 8px;
  z-index: 30;
  width: 292px;
  max-width: calc(100vw - 24px);
  color: var(--text);
  pointer-events: none;
}
.outline-rail {
  position: absolute;
  top: 88px;
  right: 0;
  display: grid;
  gap: 22px;
  justify-items: end;
  padding: 12px 0;
  opacity: 1;
  transition: opacity .18s ease, transform .18s ease;
  pointer-events: auto;
}
.outline-rail span {
  display: block;
  width: 20px;
  height: 4px;
  border-radius: 999px;
  background: #d8dbe5;
}
.outline-rail span:first-child {
  width: 20px;
  background: #6b7280;
}
.outline-panel {
  max-height: calc(100vh - 142px);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255,255,255,.98);
  box-shadow: var(--shadow);
  opacity: 0;
  pointer-events: none;
  transform: translateX(18px) scale(.98);
  transition: opacity .18s ease, transform .18s ease;
}
.outline:hover .outline-panel,
.outline.is-pinned .outline-panel,
.outline.is-open .outline-panel {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0) scale(1);
}
.outline:hover .outline-rail,
.outline.is-pinned .outline-rail,
.outline.is-open .outline-rail {
  opacity: 0;
  transform: translateX(12px);
  pointer-events: none;
}
.outline.is-collapsed .outline-panel {
  opacity: 0;
  pointer-events: none;
  transform: translateX(18px) scale(.98);
}
.outline.is-collapsed .outline-rail {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}
.outline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 12px;
  border-bottom: 1px solid var(--line);
}
.outline-header h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}
.outline-actions {
  display: flex;
  gap: 8px;
}
.outline-actions button {
  width: 30px;
  height: 30px;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: transparent;
  cursor: pointer;
  position: relative;
}
.outline-actions button:hover {
  background: #f1f5f9;
}
.outline-pin::before {
  content: "";
  position: absolute;
  inset: 7px 9px 9px;
  border: 2px solid #6b7280;
  border-bottom: 0;
  border-radius: 4px 4px 1px 1px;
  transform: rotate(35deg);
}
.outline-pin::after {
  content: "";
  position: absolute;
  width: 2px;
  height: 13px;
  top: 12px;
  left: 14px;
  background: #6b7280;
  transform: rotate(35deg);
}
.outline.is-pinned .outline-pin {
  background: var(--accent-soft);
}
.outline.is-pinned .outline-pin::before {
  border-color: var(--accent);
}
.outline.is-pinned .outline-pin::after {
  background: var(--accent);
}
.outline-collapse::before,
.outline-collapse::after {
  content: "";
  position: absolute;
  left: 8px;
  right: 8px;
  height: 2px;
  border-radius: 999px;
  background: #6b7280;
}
.outline-collapse::before {
  top: 10px;
  transform: rotate(35deg);
}
.outline-collapse::after {
  bottom: 10px;
  transform: rotate(-35deg);
}
.outline-scroll {
  max-height: calc(100vh - 214px);
  overflow: auto;
  padding: 14px 18px 18px;
}
.outline-group {
  margin: 4px 0;
}
.outline-leaf {
  padding-left: 15px;
}
.outline-group summary {
  display: flex;
  align-items: center;
  gap: 8px;
  list-style: none;
  cursor: pointer;
}
.outline-group summary::-webkit-details-marker {
  display: none;
}
.outline-caret {
  flex: 0 0 auto;
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 7px solid #7b8494;
  transform: rotate(90deg);
  transition: transform .15s ease, border-left-color .15s ease;
}
.outline-group:not([open]) .outline-caret {
  transform: rotate(0deg);
}
.outline-link {
  display: block;
  min-width: 0;
  padding: 5px 0;
  color: #6b7280;
  line-height: 1.45;
  text-decoration: none;
}
.outline-link:hover {
  color: var(--accent);
  text-decoration: none;
}
.outline-level-2 {
  color: #1f2937;
  font-size: 15px;
  font-weight: 700;
}
.outline-children {
  margin: 2px 0 6px 17px;
  padding-left: 13px;
  border-left: 1px solid #e5e7eb;
}
.outline-level-3 {
  color: #747b8b;
  font-size: 14px;
}
.outline-link.is-active {
  color: var(--accent);
  font-weight: 700;
}
.outline-group:has(.outline-link.is-active) .outline-caret {
  border-left-color: var(--accent);
}

.doc-content h1,
.doc-content h2,
.doc-content h3,
.doc-content h4 {
  color: #111827;
  line-height: 1.35;
  letter-spacing: 0;
}
.doc-content h1 { margin-top: 0; font-size: 28px; }
.doc-content h2 {
  margin-top: 34px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
  font-size: 22px;
}
.doc-content h3 { margin-top: 28px; font-size: 18px; }
.doc-content p { margin: 12px 0; }
.doc-content ul,
.doc-content ol { padding-left: 22px; }
.doc-content li { margin: 5px 0; }
blockquote {
  margin: 16px 0;
  padding: 12px 16px;
  border-left: 4px solid var(--accent);
  border-radius: 0 7px 7px 0;
  background: var(--accent-soft);
  color: #1d3b73;
}
blockquote p { margin: 0; }
.muted { color: var(--muted); }

.table-wrap {
  width: 100%;
  margin: 16px 0 22px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
}
table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  table-layout: auto;
}
th,
td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  border-right: 1px solid var(--line);
  vertical-align: top;
  word-break: break-word;
}
th:last-child,
td:last-child { border-right: 0; }
tr:last-child td { border-bottom: 0; }
th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f1f5f9;
  color: #334155;
  font-weight: 700;
  text-align: left;
}

.image-block {
  margin: 16px 0 22px;
}
.doc-image {
  max-width: 100%;
  height: auto;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #f8fafc;
  cursor: zoom-in;
  transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
}
td .doc-image {
  max-width: min(260px, 100%);
}
.doc-image:hover {
  border-color: rgba(37, 99, 235, .55);
  box-shadow: 0 10px 28px rgba(37, 99, 235, .16);
  transform: translateY(-1px);
}

.lightbox {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 42px;
  background: rgba(15, 23, 42, .88);
}
.lightbox.is-open { display: flex; }
.lightbox img {
  max-width: min(96vw, 1600px);
  max-height: 88vh;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 30px 90px rgba(0,0,0,.45);
}
.lightbox-close {
  position: fixed;
  top: 18px;
  right: 22px;
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 50%;
  background: rgba(255,255,255,.95);
  color: #111827;
  font-size: 30px;
  line-height: 1;
  cursor: pointer;
}
.lightbox-caption {
  position: fixed;
  left: 42px;
  right: 42px;
  bottom: 16px;
  color: rgba(255,255,255,.86);
  text-align: center;
  font-size: 13px;
}
.lightbox-nav {
  position: fixed;
  top: 50%;
  z-index: 51;
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 50%;
  background: rgba(255,255,255,.95);
  color: #111827;
  box-shadow: 0 18px 45px rgba(0,0,0,.25);
  cursor: pointer;
  transform: translateY(-50%);
}
.lightbox-nav:hover {
  background: #ffffff;
}
.lightbox-nav::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 12px;
  height: 12px;
  border-top: 2px solid currentColor;
  border-right: 2px solid currentColor;
}
.lightbox-prev {
  left: 24px;
}
.lightbox-next {
  right: 24px;
}
.lightbox-prev::before {
  transform: translate(-35%, -50%) rotate(-135deg);
}
.lightbox-next::before {
  transform: translate(-65%, -50%) rotate(45deg);
}
.lightbox-nav[hidden] {
  display: none;
}

.reading-top {
  --read-progress: 0deg;
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 40;
  width: 68px;
  height: 68px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: conic-gradient(var(--accent) var(--read-progress), #e2e8f0 0);
  box-shadow: 0 18px 44px rgba(15, 23, 42, .18);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: translateY(10px);
  transition: opacity .18s ease, transform .18s ease, box-shadow .18s ease;
}
.reading-top::before {
  content: "";
  position: absolute;
  inset: 5px;
  border-radius: 50%;
  background: #ffffff;
}
.reading-top.is-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
.reading-top:hover {
  box-shadow: 0 22px 52px rgba(15, 23, 42, .24);
}
.reading-top-arrow {
  position: absolute;
  top: 13px;
  left: 50%;
  z-index: 1;
  width: 18px;
  height: 22px;
  transform: translateX(-50%);
}
.reading-top-arrow::before {
  content: "";
  position: absolute;
  left: 3px;
  top: 2px;
  width: 12px;
  height: 12px;
  border-top: 2px solid #1f2937;
  border-left: 2px solid #1f2937;
  transform: rotate(45deg);
}
.reading-top-arrow::after {
  content: "";
  position: absolute;
  left: 8px;
  top: 5px;
  width: 2px;
  height: 17px;
  border-radius: 999px;
  background: #1f2937;
}
.reading-top-value {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 11px;
  z-index: 1;
  color: #1f2937;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  text-align: center;
}

.index-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at 18px 18px, rgba(148, 163, 184, .22) 1px, transparent 1.5px),
    #f7f8fb;
  background-size: 22px 22px;
}
.index-shell {
  width: min(1280px, calc(100vw - 56px));
  min-height: 100vh;
  margin: 0 auto;
  padding: 0;
  display: grid;
  place-items: center;
}
.index-hero {
  position: relative;
  width: 100%;
  height: 89vh;
  min-height: 640px;
  overflow: hidden;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 20px;
  padding: 84px 28px 120px;
  border: 1px solid rgba(226, 232, 240, .92);
  border-radius: 36px;
  background:
    linear-gradient(180deg, rgba(255,255,255,.94), rgba(255,255,255,.84)),
    radial-gradient(circle at 50% 42%, rgba(37, 99, 235, .08), transparent 28%);
  box-shadow: 0 28px 80px rgba(15, 23, 42, .08);
}
.index-hero::before,
.index-hero::after {
  content: "";
  position: absolute;
  z-index: 0;
  width: 300px;
  height: 210px;
  border: 8px solid rgba(229, 232, 239, .8);
  border-radius: 36px;
  background: rgba(248, 250, 252, .82);
  transform: rotate(5deg);
}
.index-hero::before {
  left: -64px;
  bottom: -58px;
}
.index-hero::after {
  right: -78px;
  top: 84px;
  transform: rotate(8deg);
}
.hero-bg-icon {
  position: absolute;
  z-index: 1;
  pointer-events: none;
}
.hero-bg-icon-flow {
  top: 118px;
  right: 26px;
  width: 218px;
  height: 152px;
  transform: rotate(8deg);
  opacity: .88;
}
.flow-node,
.flow-line {
  position: absolute;
  display: block;
}
.flow-node {
  width: 42px;
  height: 42px;
  border: 1px solid rgba(203, 213, 225, .92);
  border-radius: 14px;
  background: rgba(255,255,255,.96);
  box-shadow: 0 14px 28px rgba(15, 23, 42, .08);
}
.flow-node::before {
  content: "";
  position: absolute;
  inset: 12px;
  border-radius: 6px;
  background: var(--accent);
}
.flow-node-a {
  left: 8px;
  top: 20px;
}
.flow-node-b {
  left: 88px;
  top: 74px;
}
.flow-node-c {
  right: 6px;
  top: 24px;
}
.flow-line {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(37,99,235,.22), rgba(37,99,235,.78));
  transform-origin: left center;
}
.flow-line-a {
  left: 47px;
  top: 58px;
  width: 64px;
  transform: rotate(34deg);
}
.flow-line-b {
  left: 126px;
  top: 87px;
  width: 62px;
  transform: rotate(-34deg);
}
.hero-bg-icon-chip {
  left: 24px;
  bottom: 14px;
  width: 202px;
  height: 154px;
  transform: rotate(6deg);
  opacity: .86;
}
.chip-core {
  position: absolute;
  left: 58px;
  top: 34px;
  width: 86px;
  height: 86px;
  border: 1px solid rgba(203, 213, 225, .94);
  border-radius: 22px;
  background:
    linear-gradient(135deg, rgba(37,99,235,.16), rgba(34,197,94,.12)),
    rgba(255,255,255,.96);
  box-shadow: 0 16px 34px rgba(15, 23, 42, .10);
}
.chip-core::before {
  content: "";
  position: absolute;
  inset: 23px;
  border-radius: 10px;
  background: var(--accent);
  box-shadow:
    -18px 0 0 -12px #22c55e,
    18px 0 0 -12px #22c55e,
    0 -18px 0 -12px #22c55e,
    0 18px 0 -12px #22c55e;
}
.chip-pin {
  position: absolute;
  display: block;
  border-radius: 999px;
  background: rgba(37,99,235,.58);
}
.chip-pin-a,
.chip-pin-b {
  width: 54px;
  height: 5px;
  left: 12px;
}
.chip-pin-a { top: 52px; }
.chip-pin-b { top: 98px; }
.chip-pin-c,
.chip-pin-d {
  width: 5px;
  height: 54px;
  top: 8px;
}
.chip-pin-c { left: 78px; }
.chip-pin-d { left: 122px; }
.hero-symbol {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 94px;
  height: 94px;
  border: 1px solid rgba(226, 232, 240, .9);
  border-radius: 24px;
  background: #ffffff;
  box-shadow: 0 16px 36px rgba(15, 23, 42, .10);
}
.hero-symbol span {
  position: relative;
  width: 42px;
  height: 42px;
  border-top: 8px solid var(--accent);
  border-right: 8px solid var(--accent);
}
.hero-symbol span::before,
.hero-symbol span::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: 0;
  border-top: 8px solid var(--accent);
  border-right: 8px solid var(--accent);
}
.hero-symbol span::before {
  width: 28px;
  height: 28px;
}
.hero-symbol span::after {
  width: 14px;
  height: 14px;
}
.index-hero h1 {
  position: relative;
  z-index: 2;
  max-width: 940px;
  margin: 0;
  color: #111827;
  font-size: clamp(42px, 6vw, 78px);
  line-height: 1.08;
  letter-spacing: 0;
  text-align: center;
}
.index-intro {
  position: relative;
  z-index: 2;
  max-width: 850px;
  margin: 0;
  color: #778195;
  font-size: 18px;
  line-height: 1.75;
  text-align: center;
}
.index-intro code {
  background: rgba(37, 99, 235, .08);
  color: #1d4ed8;
}
.index-start {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 168px;
  height: 64px;
  margin-top: 6px;
  padding: 0 30px;
  border-radius: 14px;
  background: var(--accent);
  color: #ffffff;
  font-size: 18px;
  font-weight: 700;
  box-shadow: 0 18px 34px rgba(37, 99, 235, .24);
  transition: transform .16s ease, box-shadow .16s ease, background .16s ease;
}
.index-start:hover {
  background: #1d4ed8;
  color: #ffffff;
  text-decoration: none;
  transform: translateY(-2px);
  box-shadow: 0 22px 42px rgba(37, 99, 235, .30);
}
.hero-board {
  position: absolute;
  z-index: 1;
  width: 210px;
  min-height: 136px;
  padding: 22px;
  border: 1px solid rgba(226, 232, 240, .9);
  border-radius: 26px;
  background: rgba(255,255,255,.9);
  box-shadow: 0 22px 50px rgba(15, 23, 42, .08);
}
.hero-board span {
  display: block;
  color: #64748b;
  font-size: 14px;
}
.hero-board strong {
  display: block;
  margin-top: 8px;
  color: #111827;
  font-size: 18px;
  line-height: 1.35;
}
.hero-board i {
  display: block;
  width: 72%;
  height: 5px;
  margin-top: 22px;
  border-radius: 999px;
  background: linear-gradient(90deg, #22c55e 0 68%, #ef4444 68% 100%);
}
.hero-board-left {
  left: 44px;
  top: 64px;
  transform: rotate(-4deg);
}
.hero-board-right {
  right: 54px;
  bottom: 54px;
  transform: rotate(4deg);
}
@media (max-width: 1180px) {
  .page-header {
    align-items: flex-start;
  }
  .page-pager-top {
    flex-basis: min(420px, 44vw);
  }
  .index-shell {
    width: min(100% - 32px, 980px);
  }
  .index-hero {
    min-height: 620px;
  }
  .hero-board {
    width: 184px;
  }
  .hero-bg-icon-flow {
    right: -10px;
  }
  .hero-bg-icon-chip {
    left: -6px;
  }
  .outline {
    top: auto;
    right: 10px;
    bottom: 18px;
    width: min(360px, calc(100vw - 32px));
  }
  .outline-rail {
    top: auto;
    right: 0;
    bottom: 0;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: rgba(255,255,255,.96);
    box-shadow: var(--shadow);
  }
  .outline-rail span {
    width: 20px;
    height: 3px;
  }
  .outline-rail span:first-child { width: 20px; }
  .outline-panel {
    max-height: min(72vh, 620px);
    transform: translateY(14px) scale(.98);
  }
  .outline-scroll {
    max-height: min(58vh, 500px);
  }
  .reading-top {
    right: 18px;
    bottom: 86px;
  }
}
@media (max-width: 860px) {
  .app-shell { display: block; }
  .sidebar {
    position: static;
    height: auto;
  }
  .doc-nav {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }
  .page-header {
    display: block;
    padding: 24px 18px 18px;
  }
  .page-pager-top {
    width: 100%;
    margin-top: 16px;
  }
  .page-pager {
    flex-direction: column;
  }
  .page-turn {
    width: 100%;
    max-width: none;
  }
  .page-turn-next {
    text-align: right;
  }
  .content-layout { padding: 18px; }
  .doc-content { padding: 18px; }
  .lightbox { padding: 18px; }
  .lightbox-nav {
    width: 40px;
    height: 40px;
  }
  .lightbox-prev {
    left: 10px;
  }
  .lightbox-next {
    right: 10px;
  }
  .lightbox-caption {
    left: 18px;
    right: 18px;
  }
  .outline {
    right: 12px;
    bottom: 12px;
    width: calc(100vw - 24px);
  }
  .outline-panel {
    border-radius: 8px;
  }
  .reading-top {
    right: 16px;
    bottom: 86px;
    width: 60px;
    height: 60px;
  }
  .reading-top-arrow {
    top: 11px;
  }
  .reading-top-value {
    bottom: 9px;
    font-size: 11px;
  }
  .index-shell {
    width: min(100% - 22px, 720px);
    padding: 16px 0 28px;
  }
  .index-hero {
    height: auto;
    min-height: auto;
    padding: 54px 18px 72px;
    border-radius: 24px;
  }
  .index-hero::before,
  .index-hero::after,
  .hero-board,
  .hero-bg-icon {
    display: none;
  }
  .hero-symbol {
    width: 76px;
    height: 76px;
    border-radius: 20px;
  }
  .hero-symbol span {
    width: 34px;
    height: 34px;
    border-width: 7px;
  }
  .hero-symbol span::before,
  .hero-symbol span::after {
    border-width: 7px;
  }
  .hero-symbol span::before {
    width: 22px;
    height: 22px;
  }
  .hero-symbol span::after {
    width: 10px;
    height: 10px;
  }
  .index-hero h1 {
    font-size: 36px;
  }
  .index-intro {
    font-size: 15px;
  }
  .index-start {
    width: 100%;
    max-width: 260px;
    height: 54px;
    font-size: 16px;
  }
}
`;

const lightboxJs = `
(() => {
  const sidebarToggle = document.querySelector('.sidebar-toggle');
  function setSidebarCollapsed(value) {
    document.body.classList.toggle('sidebar-collapsed', value);
    sidebarToggle?.setAttribute('aria-expanded', String(!value));
    sidebarToggle?.setAttribute('aria-label', value ? '展开菜单' : '折叠菜单');
    try { localStorage.setItem('competitiveResearchSidebarCollapsed', value ? '1' : '0'); } catch {}
  }
  try {
    setSidebarCollapsed(localStorage.getItem('competitiveResearchSidebarCollapsed') === '1');
  } catch {
    setSidebarCollapsed(false);
  }
  sidebarToggle?.addEventListener('click', () => {
    setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
  });

  const box = document.getElementById('lightbox');
  const image = box?.querySelector('img');
  const caption = box?.querySelector('.lightbox-caption');
  const close = box?.querySelector('.lightbox-close');
  let lightboxImages = [];
  let lightboxIndex = -1;

  function getImageSource(target) {
    return target?.getAttribute('data-full') || target?.currentSrc || target?.getAttribute('src') || target?.src || '';
  }

  function getImageCaption(target, src) {
    return target?.closest('td, figure, p')?.innerText?.trim()?.replace(/\\s+/g, ' ').slice(0, 220)
      || target?.alt
      || src;
  }

  function refreshLightboxImages() {
    lightboxImages = Array.from(document.querySelectorAll('.doc-content img')).filter(getImageSource);
  }

  function showLightboxImage(index) {
    if (!box || !image || !caption || !lightboxImages.length) return;
    const total = lightboxImages.length;
    lightboxIndex = ((index % total) + total) % total;
    const target = lightboxImages[lightboxIndex];
    const src = getImageSource(target);
    const text = getImageCaption(target, src);
    image.src = src;
    image.alt = target.alt || 'Image preview';
    caption.textContent = (lightboxIndex + 1) + ' / ' + total + (text ? ' - ' + text : '');
    box.querySelectorAll('.lightbox-nav').forEach((button) => {
      button.hidden = total < 2;
    });
  }

  function stepLightbox(delta) {
    if (!box?.classList.contains('is-open')) return;
    showLightboxImage(lightboxIndex + delta);
  }

  function openLightbox(target) {
    if (!box || !image || !caption) return;
    const src = target.getAttribute('data-full') || target.currentSrc || target.src;
    image.src = src;
    image.alt = target.alt || '放大预览';
    caption.textContent = target.closest('td, figure, p')?.innerText?.trim()?.slice(0, 220) || src;
    refreshLightboxImages();
    let index = lightboxImages.indexOf(target);
    if (index === -1) {
      lightboxImages.push(target);
      index = lightboxImages.length - 1;
    }
    showLightboxImage(index);
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    if (!box || !image) return;
    box.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    image.removeAttribute('src');
    lightboxIndex = -1;
  }

  if (box && image && caption && close) {
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'lightbox-nav lightbox-prev';
    prev.setAttribute('aria-label', 'Previous image');
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'lightbox-nav lightbox-next';
    next.setAttribute('aria-label', 'Next image');
    box.append(prev, next);

    document.addEventListener('click', (event) => {
      const target = event.target.closest('.doc-content img');
      if (!target) return;
      event.preventDefault();
      openLightbox(target);
    });

    close.addEventListener('click', closeLightbox);
    box.addEventListener('click', (event) => {
      if (event.target === box) closeLightbox();
    });
    prev.addEventListener('click', () => stepLightbox(-1));
    next.addEventListener('click', () => stepLightbox(1));
    document.addEventListener('keydown', (event) => {
      if (!box.classList.contains('is-open')) return;
      if (event.key === 'Escape') {
        closeLightbox();
      } else if (event.key === 'ArrowLeft' || event.key === 'Left') {
        event.preventDefault();
        stepLightbox(-1);
      } else if (event.key === 'ArrowRight' || event.key === 'Right') {
        event.preventDefault();
        stepLightbox(1);
      }
    });
  }

  const docContent = document.querySelector('.doc-content');
  const pageFile = decodeURIComponent(location.pathname.split('/').pop() || '');
  if (docContent && /^0[1-7]_/.test(pageFile)) {
    const backTop = document.createElement('button');
    backTop.type = 'button';
    backTop.className = 'reading-top';
    backTop.setAttribute('aria-label', 'Back to top');
    backTop.innerHTML = '<span class="reading-top-arrow" aria-hidden="true"></span><span class="reading-top-value">0%</span>';
    document.body.append(backTop);

    const progressValue = backTop.querySelector('.reading-top-value');
    let readFrame = 0;
    let returningTop = false;

    function syncReadProgress() {
      readFrame = 0;
      const rect = docContent.getBoundingClientRect();
      const contentTop = window.scrollY + rect.top;
      const contentBottom = contentTop + docContent.offsetHeight;
      const start = Math.max(0, contentTop - 24);
      const end = Math.max(start + 1, contentBottom - window.innerHeight + 24);
      const progress = Math.min(1, Math.max(0, (window.scrollY - start) / (end - start)));
      const percent = Math.round(progress * 100);
      backTop.style.setProperty('--read-progress', (percent * 3.6) + 'deg');
      progressValue.textContent = percent + '%';
      backTop.setAttribute('aria-label', 'Back to top, ' + percent + '% read');
      if (returningTop && window.scrollY <= 2) returningTop = false;
      backTop.classList.toggle('is-visible', window.scrollY > 160 && !returningTop);
    }

    function scheduleReadProgress() {
      if (!readFrame) readFrame = requestAnimationFrame(syncReadProgress);
    }

    backTop.addEventListener('click', () => {
      returningTop = true;
      backTop.classList.remove('is-visible');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    syncReadProgress();
    document.addEventListener('scroll', scheduleReadProgress, { passive: true });
    window.addEventListener('resize', scheduleReadProgress);
  }

  const outline = document.getElementById('page-outline');
  if (!outline) return;
  const pin = outline.querySelector('.outline-pin');
  const collapse = outline.querySelector('.outline-collapse');
  const links = Array.from(outline.querySelectorAll('.outline-link[href^="#"]'));
  const headings = links
    .map((link) => {
      const id = decodeURIComponent(link.getAttribute('href').slice(1));
      const heading = document.getElementById(id);
      return heading ? { link, heading } : null;
    })
    .filter(Boolean);

  function setPinned(value) {
    outline.classList.toggle('is-pinned', value);
    outline.classList.remove('is-collapsed');
    pin?.setAttribute('aria-pressed', String(value));
    try { localStorage.setItem('competitiveResearchOutlinePinned', value ? '1' : '0'); } catch {}
  }

  function setCollapsed(value) {
    if (value) {
      setPinned(false);
      outline.classList.add('is-collapsed');
    } else {
      outline.classList.remove('is-collapsed');
    }
  }

  pin?.addEventListener('click', () => setPinned(!outline.classList.contains('is-pinned')));
  collapse?.addEventListener('click', () => setCollapsed(true));
  outline.querySelector('.outline-rail')?.addEventListener('mouseenter', () => {
    outline.classList.remove('is-collapsed');
    outline.classList.add('is-open');
  });
  outline.addEventListener('mouseleave', () => {
    outline.classList.remove('is-open');
  });
  links.forEach((link) => {
    link.addEventListener('click', () => {
      if (!outline.classList.contains('is-pinned')) setCollapsed(true);
    });
  });

  try {
    if (localStorage.getItem('competitiveResearchOutlinePinned') === '1') setPinned(true);
  } catch {}

  let activeId = '';
  function syncActive() {
    if (!headings.length) return;
    const anchor = window.scrollY + 140;
    let current = headings[0];
    for (const item of headings) {
      if (item.heading.offsetTop <= anchor) current = item;
      else break;
    }
    const id = current.heading.id;
    if (id === activeId) return;
    activeId = id;
    links.forEach((link) => link.classList.remove('is-active'));
    current.link.classList.add('is-active');
    const group = current.link.closest('.outline-group');
    if (group) group.open = true;
  }
  syncActive();
  document.addEventListener('scroll', () => requestAnimationFrame(syncActive), { passive: true });
})();
`;

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function validateImages(pages) {
  let total = 0;
  const missing = [];
  for (const page of pages) {
    const refs = [...page.html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
    total += refs.length;
    for (const ref of refs) {
      if (/^[a-z]+:/i.test(ref) || ref.startsWith('data:')) continue;
      const full = path.resolve(pageDir, decodeURI(ref));
      if (!(await exists(full))) missing.push({ page: page.file, ref });
    }
  }
  return { total, missing };
}

await mkdir(assetsDir, { recursive: true });
await writeFile(path.join(assetsDir, 'style.css'), css.trimStart(), 'utf8');
await writeFile(path.join(assetsDir, 'lightbox.js'), lightboxJs.trimStart(), 'utf8');

const pages = [];
for (const mdName of docFiles) {
  const markdown = await readFile(path.join(docsDir, mdName), 'utf8');
  const rendered = renderMarkdown(markdown);
  const file = htmlFileName(mdName);
  const html = buildPage({ mdName, title: rendered.title, body: rendered.html, toc: rendered.toc });
  await writeFile(path.join(pageDir, file), html, 'utf8');
  pages.push({ source: mdName, file, title: rendered.title, html });
}

await writeFile(path.join(pageDir, 'index.html'), buildIndex(pages), 'utf8');

const validation = await validateImages(pages);
await writeFile(
  path.join(pageDir, 'page_manifest.json'),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    pages: pages.map(({ source, file, title }) => ({ source, file, title })),
    imageRefs: validation.total,
    missingImages: validation.missing,
  }, null, 2),
  'utf8',
);

console.log(`HTML pages generated: ${pages.length} docs + index`);
console.log(`Image refs: ${validation.total}, missing: ${validation.missing.length}`);
if (validation.missing.length) {
  console.log(validation.missing.slice(0, 10).map((item) => `${item.page}: ${item.ref}`).join('\n'));
  process.exitCode = 1;
}
