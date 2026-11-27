// Consume the target project's builder; do not duplicate its storage format.
import { createRequire } from 'node:module';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
const [project, input, output] = process.argv.slice(2);
const require = createRequire(path.join(project, 'packages/retrieval/package.json'));
const { require: tsxRequire } = require('tsx/cjs/api');
const { buildRetrievalCatalog } = tsxRequire(path.join(project, 'packages/retrieval/src/retrieval/src/build.ts'), import.meta.url);
if (input === '--check') {
  if (typeof buildRetrievalCatalog !== 'function') throw new Error('Missing Retrieval catalog builder');
  console.log('Catalog builder ready');
  process.exit(0);
}
const sources = [];
let bytes = 0;
for await (const line of createInterface({ input: createReadStream(input), crlfDelay: Infinity })) {
  bytes += Buffer.byteLength(line) + 1;
  if (bytes > 64 * 1024 * 1024) throw new Error('Catalog metadata exceeds the 64 MiB build budget');
  if (line) sources.push(JSON.parse(line));
}
const catalog = buildRetrievalCatalog(sources);
for (const [name, data] of catalog.artifacts) {
  const file = path.join(output, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}
await writeFile(path.join(output, 'manifest.json'), catalog.manifestBytes);
console.log(JSON.stringify({ count: sources.length, corpusHash: catalog.corpusHash }));
