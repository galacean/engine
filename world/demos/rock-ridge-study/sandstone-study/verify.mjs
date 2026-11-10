import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildAtomicKernel} from '../atomic-controls/kernel-bundle.mjs';
import {createSandstoneProcessor} from './processor.mjs';
import {SANDSTONE_CONTROLS,sandstoneRecipe,parseSandstoneRecipe} from './recipe.mjs';
const atomic=new Function(buildAtomicKernel()+'\nreturn atomicRockKernel();')();await atomic.ready;
const processor=createSandstoneProcessor(atomic),results=[];
const digest=mesh=>{const h=createHash('sha256');for(const key of ['positions','normals','indices'])h.update(new Uint8Array(mesh[key].buffer));return h.digest('hex');};

// Independent halfedge / vertex-fan audit. Closed edge counts alone can miss a
// pinched non-manifold vertex; each vertex must have one cyclic incident fan.
function inspect(mesh,p){
  const n=mesh.positions.length/3,faces=mesh.indices.length/3,edges=new Map(),incident=Array.from({length:n},()=>[]),adjacent=Array.from({length:faces},()=>[]);let volume=0;
  assert(mesh.positions.every(Number.isFinite)&&mesh.normals.every(Number.isFinite));
  for(let i=0;i<mesh.positions.length;i++)assert(Math.abs(mesh.positions[i])<=[p.width,p.height,p.depth][i%3]/2+1e-5,'Cut mesh stays inside source dimensions');
  for(let face=0;face<faces;face++){
    const ids=Array.from(mesh.indices.subarray(face*3,face*3+3));assert(ids.every(v=>v<n));assert.equal(new Set(ids).size,3);
    const [a,b,c]=ids.map(v=>Array.from(mesh.positions.subarray(v*3,v*3+3))),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    assert(Math.hypot(...cross)>0,'No collapsed triangle');volume+=a.reduce((s,x,k)=>s+x*cross[k],0)/6;
    for(let j=0;j<3;j++){const from=ids[j],to=ids[(j+1)%3],key=Math.min(from,to)*n+Math.max(from,to);incident[from].push(face);const previous=edges.get(key);if(previous){assert.equal(previous.from,to,'Opposite edge winding');assert.equal(previous.to,from);assert(!previous.closed,'Only two faces per edge');previous.closed=true;adjacent[face].push(previous.face);adjacent[previous.face].push(face);}else edges.set(key,{from,to,face,closed:false});}
  }
  assert([...edges.values()].every(e=>e.closed));assert(volume>0);
  const seen=new Uint8Array(faces),stack=[0];seen[0]=1;let reached=0;while(stack.length){const f=stack.pop();reached++;for(const j of adjacent[f])if(!seen[j]){seen[j]=1;stack.push(j);}}assert.equal(reached,faces,'Single connected surface');
  for(const around of incident){assert(around.length>=3);const allowed=new Set(around),seen=new Set([around[0]]),queue=[around[0]];while(queue.length){const f=queue.pop();let degree=0;for(const other of adjacent[f])if(allowed.has(other)){degree++;if(!seen.has(other)){seen.add(other);queue.push(other);}}assert.equal(degree,2,'Cyclic vertex fan');}assert.equal(seen.size,around.length,'No pinched vertex');}
  return {faces,vertices:n,volume};
}
function rays(mesh,p){
  const out=[],pos=mesh.positions,indices=mesh.indices;
  for(const axis of [0,2])for(let iy=0;iy<7;iy++)for(let it=0;it<9;it++){
    const tangent=axis===0?2:0,t=(it/8-.5)*[p.width,p.height,p.depth][tangent]*.78,y=(iy/6-.5)*p.height*.76;let best=Infinity;
    for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,at=pos[a+tangent],bt=pos[b+tangent],ct=pos[c+tangent],ay=pos[a+1],by=pos[b+1],cy=pos[c+1],den=(by-cy)*(at-ct)+(ct-bt)*(ay-cy);if(Math.abs(den)<1e-12)continue;const u=((by-cy)*(t-ct)+(ct-bt)*(y-cy))/den,v=((cy-ay)*(t-ct)+(at-ct)*(y-cy))/den,w=1-u-v;if(u>=0&&v>=0&&w>=0)best=Math.min(best,u*pos[a+axis]+v*pos[b+axis]+w*pos[c+axis]);}
    out.push(best);
  }
  return out;
}
const recipe=sandstoneRecipe(),baseline=processor.generate(recipe),repeat=createSandstoneProcessor(atomic).generate(parseSandstoneRecipe(JSON.stringify(recipe)));
assert.equal(digest(baseline),digest(repeat),'Same recipe reproduces every mesh buffer');
const immutable=digest(baseline),features=JSON.stringify(baseline.features),stageResults=[];
for(let stage=0;stage<=4;stage++){
  const mesh=processor.generate(sandstoneRecipe({},stage));assert.equal(JSON.stringify(mesh.features),features,'Stage changes do not reroll authored fractures');
  const check=inspect(mesh,recipe.parameters);stageResults.push({stage,...check,hash:mesh.stats.hash});
}
assert.equal(digest(baseline),immutable,'Cached output buffers remain immutable');
for(const def of SANDSTONE_CONTROLS){for(const value of [def.min,def.max]){
  const r=sandstoneRecipe({[def.key]:value}),mesh=processor.generate(r),check=inspect(mesh,r.parameters);
  if(value!==recipe.parameters[def.key])assert.notEqual(digest(mesh),immutable,def.key+' changes geometry');results.push({parameter:def.key,value,...check,hash:mesh.stats.hash,retainedSource:mesh.reduction?.accepted===false});
}}
// Different proportions / simultaneous strong cuts are distinct from individual
// endpoint tests and exercise the protected core at thin extreme proportions.
for(const values of [{seed:19,width:3,depth:3,height:16,faceRelief:1.1,jointDepth:.7,jointWidth:.5,edgeDamage:1},{seed:416,width:12,depth:3,height:6,bedThickness:.35,bedRecession:.3,edgeDamage:1},{seed:382,width:9,depth:8,height:12}]){
  const r=sandstoneRecipe({...values,resolution:40}),mesh=processor.generate(r),check=inspect(mesh,r.parameters);results.push({combination:values,...check,hash:mesh.stats.hash});
}
const raw=processor.generate(recipe,{reduced:false}),sourceCheck=inspect(raw,recipe.parameters),reducedCheck=inspect(baseline,recipe.parameters),rawProbes=rays(raw,recipe.parameters),reducedProbes=rays(baseline,recipe.parameters);let maxRayError=0;
for(let i=0;i<rawProbes.length;i++){assert.equal(Number.isFinite(rawProbes[i]),Number.isFinite(reducedProbes[i]),'Reduction preserves probe coverage');if(Number.isFinite(rawProbes[i]))maxRayError=Math.max(maxRayError,Math.abs(rawProbes[i]-reducedProbes[i]));}
assert(maxRayError<.08,'Fracture / face ray profiles survive reduction');assert(Math.abs(sourceCheck.volume-reducedCheck.volume)/sourceCheck.volume<.01);
assert(baseline.indices.length<raw.indices.length*.6,'Reduction is effective');
const clean=atomic.buildRock(processor.sourceParameters(recipe.parameters)),cleanHash=digest(clean);processor.generate(recipe);assert.equal(digest(clean),cleanHash);
for(const bad of [{...recipe,version:'future'},{...recipe,upstream:'other'},{...recipe,parameters:{}},{...recipe,stage:9},{...recipe,parameters:{...recipe.parameters,height:Infinity}}])assert.throws(()=>parseSandstoneRecipe(bad));
const report={version:recipe.version,defaultRecipe:recipe,exactRecipeReplay:true,sha256:digest(baseline),defaultHash:baseline.stats.hash,endpointCases:results.filter(r=>r.parameter).length,combinedCases:3,stageResults,results,reduction:{rawTriangles:sourceCheck.faces,reducedTriangles:reducedCheck.faces,maxRayErrorMeters:maxRayError,rayProbes:rawProbes.length,relativeVolumeError:Math.abs(sourceCheck.volume-reducedCheck.volume)/sourceCheck.volume},checks:['byte-identical positions / normals / indices on recipe replay','finite source-bounded vertices','two opposite faces per edge','single connected surface','one cyclic fan per vertex','positive volume and nonzero triangles','same feature fields at every processing stage','all geometry slider endpoints','strong simultaneous cuts on a thin tall source','independent two-direction surface ray profiles after reduction','immutable generated buffers','strict recipe version / parameter validation']};
fs.writeFileSync(new URL('validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({defaultHash:report.defaultHash,endpointCases:report.endpointCases,combinedCases:3,reduction:report.reduction},null,2));
