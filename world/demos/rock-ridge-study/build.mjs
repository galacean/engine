import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = new URL('./', import.meta.url);
for (const file of ['src/scenes.mjs', 'src/pack.mjs']) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(file, root))], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const fragment = fs.readFileSync(new URL('rock-arrangement-study.html', root), 'utf8');
for (const [, attributes, source] of fragment.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (/\bsrc\s*=/.test(attributes) || /application\/json/.test(attributes)) continue;
  new vm.Script(source);
}
const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
const template = fs.readFileSync(new URL('src/standalone-template.html', root), 'utf8');
const token = '__ROCK_RIDGE_ESCAPED_FRAGMENT__';
if (template.split(token).length !== 2) throw new Error('Standalone template must contain one fragment placeholder');
const page = template.replace(token, () => escapeHtml(fragment));
fs.writeFileSync(new URL('index.html', root), page);
console.log(`Standalone page: ${Buffer.byteLength(page)} bytes; inline JavaScript syntax passed`);
