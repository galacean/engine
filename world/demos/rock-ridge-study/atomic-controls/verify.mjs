import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {atomicRockKernel} from './kernel.generated.mjs';
import {buildRock} from './generator/rock-body.js';
import {CONTROL_DEFINITIONS,CONTROL_DEFAULTS,resolvedControls} from './controls.mjs';
const kernel=atomicRockKernel();await kernel.ready;
const upstream=JSON.parse(fs.readFileSync(new URL('./upstream.json',import.meta.url)));
for(const [name,sha] of Object.entries(upstream.gitBlobIds)){
 const bytes=fs.readFileSync(new URL('./generator/'+name,import.meta.url));
 assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),sha,'Vendored source matches the pinned upstream Git blob');
}
const hash=m=>{const h=createHash('sha256');for(const key of ['positions','normals','indices'])h.update(new Uint8Array(m[key].buffer));return h.digest('hex');};
const defaults=buildRock(CONTROL_DEFAULTS),baseline=hash(defaults),results=[];
for(const def of CONTROL_DEFINITIONS.filter(d=>!['Mesh','Appearance'].includes(d.group))){
 for(const value of [def.min,def.max]){
  const resolved=resolvedControls({...CONTROL_DEFAULTS,[def.key]:value},def.key),mesh=kernel.buildRock(resolved.parameters),source=buildRock(resolved.parameters);
  assert.equal(hash(mesh),hash(source),'Bundled kernel preserves upstream output exactly');
  assert(mesh.positions.every(Number.isFinite)&&mesh.normals.every(Number.isFinite));
  for(let i=0;i<mesh.positions.length;i++){const dimension=resolved.parameters[['obbWidth','obbHeight','obbDepth'][i%3]];assert(Math.abs(mesh.positions[i])<=dimension/2+1e-5);}
  assert.equal(mesh.stats.sharpEdges,0,'Upstream geometric-turn acceptance');
  if(def.key==='wallStagger')assert.equal(hash(mesh),baseline,'Unused field stays honestly ineffective');
  results.push({key:def.key,value,sourceTriangles:mesh.indices.length/3,hash:hash(mesh),effectiveTopSlope:mesh.stats.effectiveTopSlope});
 }
}
for(const d of CONTROL_DEFINITIONS.filter(d=>d.group==='Appearance'))for(const value of [d.min,d.max])assert.deepEqual(resolvedControls({[d.key]:value},d.key).parameters,resolvedControls({},d.key).parameters,'Appearance never deforms the mesh');
const isolated=resolvedControls({topScale:.08,obbHeight:15,wallCount:28},'topScale'),combined=resolvedControls({topScale:.08,obbHeight:15,wallCount:28},'topScale',true);
assert.equal(isolated.parameters.obbHeight,4.2);assert.equal(isolated.parameters.wallCount,12);assert.equal(combined.parameters.obbHeight,15);assert.equal(combined.parameters.wallCount,28);
assert.equal(resolvedControls({},'topDirection').parameters.topSlope,20,'Isolated direction has a visible sloped roof');
assert.equal(resolvedControls({},'reductionError').reduction.targetTriangles,0,'Isolated error is not masked by a triangle target');
assert(!('unexpected' in resolvedControls({unexpected:'untrusted'},'topScale').values));
const reductions=[];
for(const targetTriangles of [200,1000,5000]){
 const source=kernel.buildRock(CONTROL_DEFAULTS),before=hash(source),mesh=kernel.simplifyRock(source,{targetTriangles});
 assert.equal(hash(source),before,'Reduction leaves cached source intact');assert(mesh.positions.every(Number.isFinite));
 assert(mesh.stats.triangles<=mesh.stats.rawTriangles);assert.equal(mesh.stats.budgetMet,mesh.stats.triangles<=targetTriangles);
 reductions.push({targetTriangles,triangles:mesh.stats.triangles,budgetMet:mesh.stats.budgetMet});
}
const tight=kernel.simplifyRock(defaults,{error:.001,targetTriangles:0}),loose=kernel.simplifyRock(defaults,{error:.01,targetTriangles:0});assert(tight.stats.triangles>=loose.stats.triangles);
const low=kernel.buildRock({...CONTROL_DEFAULTS,resolution:24}),high=kernel.buildRock({...CONTROL_DEFAULTS,resolution:96});assert(high.indices.length>low.indices.length);
const capped=kernel.buildRock({...CONTROL_DEFAULTS,obbWidth:30,obbHeight:2,obbDepth:12,topSlope:75});assert(capped.stats.effectiveTopSlope<3);
const validation={version:'atomic-controls-1',controls:CONTROL_DEFINITIONS.length,sourceEndpointCases:results.length,exactUpstreamParity:true,verifiedUpstreamFiles:Object.keys(upstream.gitBlobIds).length,checks:['pinned upstream Git blob identity','bundled kernel matches upstream buffers','finite bounded geometry at slider endpoints','geometry angle acceptance','unused stagger stays ineffective','appearance leaves geometry fixed','isolated and combined controls','visible roof direction example','error-only reduction','validated state whitelist','cached source immutable during reduction','truthful triangle budgets','resolution changes source sampling','effective roof clamp'],results,reductions,errorOnly:{tight:tight.stats.triangles,loose:loose.stats.triangles},sourceResolution:{low:low.indices.length/3,high:high.indices.length/3},effectiveSlope:capped.stats.effectiveTopSlope};
fs.writeFileSync(new URL('./validation.json',import.meta.url),JSON.stringify(validation,null,2)+'\n');
console.log(JSON.stringify({controls:validation.controls,endpointCases:results.length,exactUpstreamParity:true,reductions,errorOnly:validation.errorOnly,sourceResolution:validation.sourceResolution,effectiveSlope:validation.effectiveSlope},null,2));
