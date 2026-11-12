// Run by itself: npm run benchmark:fractures. Both implementations run on the
// same machine, with the same generated inputs and with empty geometry caches.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildAtomicKernel} from '../atomic-controls/kernel-bundle.mjs';
import {generateRuntimeRocks,runtimeRockFingerprint} from './runtime-rocks.mjs';
import {fractureRockGeometry} from './rock-surface.mjs';
import {fractureRockGeometryBefore} from './fixtures/fracture-before.mjs';
import {generateRidgeScene,withSceneHeight} from './ridge.mjs';

const kernel=Function(buildAtomicKernel()+';return atomicRockKernel();')();await kernel.ready;
const source=JSON.parse(fs.readFileSync(new URL('study-data.json',import.meta.url))).scenes[0];
const settings={seed:482,fractures:{depth:1.3,width:1.6,irregularity:1.8},heightPercent:100,
 mode:'perlin',noise:{frequency:4,octaves:5,lacunarity:2,persistence:.85},topology:{seeded:false,peaks:5,branches:8}};
const implementations={before:fractureRockGeometryBefore,after:fractureRockGeometry};
function run(implementation){
 global.gc?.();const start=performance.now(),base=generateRuntimeRocks(kernel,settings.seed),fingerprint=runtimeRockFingerprint(base),generated=performance.now();
 const meshes={};for(const [name,g] of Object.entries(base))meshes[name]=implementations[implementation](g,settings.fractures);
 const carved=performance.now(),scene=withSceneHeight(generateRidgeScene(source,meshes,settings.seed,settings),settings.heightPercent/100),finished=performance.now();
 return {timing:{baseMs:generated-start,fractureMs:carved-generated,fitAndHeightMs:finished-carved,totalMs:finished-start},meshes,scene,fingerprint};
}
// Warm both code paths, including the fitter. Timed trials still generate fresh
// mesh objects, so the WeakMap fracture cache cannot serve any measured result.
for(const implementation of ['before','after']){run(implementation);console.log('Warmed',implementation);}
const trials=[];let totalTriangles,fingerprint,placedRocks;
for(let trial=0;trial<3;trial++){
 const result={};for(const implementation of trial%2?['after','before']:['before','after'])result[implementation]=run(implementation);
 assert.deepEqual(result.after.meshes,result.before.meshes,'Benchmark geometries are exactly identical');
 assert.deepEqual(result.after.scene,result.before.scene,'Fitted mountain is exactly identical');
 totalTriangles=Object.values(result.after.meshes).reduce((sum,g)=>sum+g.indices.length/3,0);fingerprint=result.after.fingerprint;placedRocks=result.after.scene.rocks.length;
 trials.push({trial:trial+1,before:result.before.timing,after:result.after.timing});console.log(JSON.stringify(trials.at(-1)));
}
const summarize=side=>Object.fromEntries(Object.keys(trials[0][side]).map(key=>{
 const values=trials.map(r=>r[side][key]).sort((a,b)=>a-b);return [key,{min:values[0],median:values[1],max:values[2]}];
}));
const before=summarize('before'),after=summarize('after'),hash=file=>createHash('sha256').update(fs.readFileSync(new URL(file,import.meta.url))).digest('hex');
const report={date:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch,gcBetweenRuns:!!global.gc},
 referenceCommit:'1326a3fd56cab7013381ed3a168f7e3c1f159b2f',currentCarverSha256:hash('solid-carve.mjs'),referenceCarverSha256:hash('fixtures/solid-carve-before.mjs'),
 settings,uniqueMeshes:8,totalTriangles,placedRocks,baseMeshFingerprint:fingerprint,
 methodology:'One full warm-up per implementation; three alternating-order paired trials; fresh atomic meshes and uncached fractures in every trial; same Node process, machine and settings; browser transfer, buffers, textures and rendering excluded.',
 exactMeshesAndAssemblies:true,before,after,speedup:{fracture:before.fractureMs.median/after.fractureMs.median,total:before.totalMs.median/after.totalMs.median},trials};
fs.writeFileSync(new URL('../evidence/fracture-performance.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({before,after,speedup:report.speedup},null,2));
