import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const targets = [
  'competitive_research/raw/browser_storage_redacted.json',
  'competitive_research/raw/network_summary.json',
  'competitive_research/raw/click_pages/network_summary_click.json',
  'competitive_research/raw/platform_pages/network_summary_platform.json',
  'competitive_research/raw/guide/network_summary_guide.json',
  'competitive_research/raw/post_login_api_probe.json',
];

function scrubText(text) {
  return text
    .replace(/userToken=[A-Za-z0-9+/=:_-]+/g, '[redacted-token]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/"token"\s*:\s*"[^"]+"/g, '"token":"[redacted]"')
    .replace(/"user_token"\s*:\s*"[^"]+"/g, '"user_token":"[redacted]"')
    .replace(/"Authorization"\s*:\s*"[^"]+"/gi, '"Authorization":"[redacted]"')
    .replace(/"Cookie"\s*:\s*"[^"]+"/gi, '"Cookie":"[redacted]"')
    .replace(/"Set-Cookie"\s*:\s*"[^"]+"/gi, '"Set-Cookie":"[redacted]"')
    .replace(/"publicKey"\s*:\s*"[^"]+"/g, '"publicKey":"[redacted]"');
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

for (const rel of targets) {
  const file = path.join(root, rel);
  if (!(await exists(file))) continue;
  const raw = await readFile(file, 'utf8');
  await writeFile(file, scrubText(raw), 'utf8');
  console.log(`sanitized ${rel}`);
}

// Also sanitize any JSON files generated under raw folders, without touching
// downloaded source bundles.
const folders = [
  'competitive_research/raw/pages',
  'competitive_research/raw/click_pages',
  'competitive_research/raw/platform_pages',
  'competitive_research/raw/guide',
  'competitive_research/raw/deep_interactions',
  'competitive_research/raw/focused_interactions',
];
for (const folderRel of folders) {
  const folder = path.join(root, folderRel);
  if (!(await exists(folder))) continue;
  for (const name of await readdir(folder)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(folder, name);
    const raw = await readFile(file, 'utf8');
    await writeFile(file, scrubText(raw), 'utf8');
  }
}
