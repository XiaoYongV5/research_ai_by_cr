import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const docsDir = path.join(root, 'competitive_research', 'docs');
const assetRoot = path.join(root, 'competitive_research');

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

let totalImages = 0;
let totalMissing = 0;
let secretHits = 0;

for (const name of (await readdir(docsDir)).filter((item) => item.endsWith('.md')).sort()) {
  const file = path.join(docsDir, name);
  const text = await readFile(file, 'utf8');
  const imageRefs = [...text.matchAll(/src="\.\.\/([^"]+)"/g)].map((match) => match[1]);
  const missing = [];
  for (const ref of imageRefs) {
    if (!(await exists(path.join(assetRoot, ref)))) missing.push(ref);
  }
  const secrets = [...text.matchAll(/User1@crip|Bearer\s+|userToken=|localStorage|CR_RESEARCH_PASS/gi)].map((match) => match[0]);
  totalImages += imageRefs.length;
  totalMissing += missing.length;
  secretHits += secrets.length;
  console.log(`${name}: images=${imageRefs.length}, missing=${missing.length}, sensitiveTerms=${secrets.length}`);
  if (missing.length) console.log(`  missing sample: ${missing.slice(0, 5).join(' | ')}`);
  if (secrets.length) console.log(`  sensitive sample: ${secrets.slice(0, 5).join(' | ')}`);
}

console.log(`TOTAL images=${totalImages}, missing=${totalMissing}, sensitiveTerms=${secretHits}`);
if (totalMissing || secretHits) process.exitCode = 1;
