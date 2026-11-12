// Test / benchmark adapter only. Feed the current, unchanged cutter definitions
// into the frozen Boolean implementation from commit 1326a3fd5.
// This reference implementation is never included in the live demo bundle.
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('rock-surface.mjs',root),'utf8')
 .replace("'./ridge-utils.mjs'",JSON.stringify(new URL('ridge-utils.mjs',root).href))
 .replace("'./solid-carve.mjs'",JSON.stringify(new URL('solid-carve-before.mjs',import.meta.url).href));
const reference=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
export const fractureRockGeometryBefore=reference.fractureRockGeometry;
export const creasedRockAttributesBefore=reference.creasedRockAttributes;
