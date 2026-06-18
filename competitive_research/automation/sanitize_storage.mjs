import { readFile, writeFile } from 'node:fs/promises';

const file = 'competitive_research/raw/browser_storage_redacted.json';
const data = JSON.parse(await readFile(file, 'utf8'));

function redact(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/userToken=[A-Za-z0-9+/=:_-]+/g, '[redacted-token]')
    .replace(/"token"\s*:\s*"[^"]+"/g, '"token":"[redacted]"')
    .replace(/"user_token"\s*:\s*"[^"]+"/g, '"user_token":"[redacted]"')
    .replace(/"publicKey"\s*:\s*"[^"]+"/g, '"publicKey":"[redacted]"');
}

for (const section of ['localStorage', 'sessionStorage']) {
  for (const key of Object.keys(data[section] || {})) {
    data[section][key] = redact(data[section][key]);
  }
}

await writeFile(file, JSON.stringify(data, null, 2), 'utf8');
console.log(`sanitized ${file}`);
