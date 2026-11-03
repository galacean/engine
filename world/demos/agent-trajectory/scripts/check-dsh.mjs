import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const root = new URL('../dsh', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
for (const [file, expected] of Object.entries(manifest.outputs)) {
  if (hash(readFileSync(new URL(file, root))) !== expected) throw new Error(`Modified vendor output: ${file}`);
}
for (const file of ['renderer.js.map', 'renderer.css.map']) {
  const map = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
  for (const [index, source] of map.sources.entries()) {
    if (!source.startsWith('packages/')) throw new Error(`Non-portable source: ${source}`);
    if (hash(map.sourcesContent[index]) !== manifest.inputs[source]) throw new Error(`Modified upstream source: ${source}`);
  }
}
console.log(`DSH vendor integrity verified: ${manifest.commit}`);
