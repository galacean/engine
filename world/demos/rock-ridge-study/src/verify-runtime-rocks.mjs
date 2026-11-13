import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildAtomicKernel} from '../atomic-controls/kernel-bundle.mjs';
import {generateRuntimeRocks,runtimeRockRecipes,runtimeRockFingerprint,buildRuntimeMountain,RUNTIME_ROCK_VERSION} from './runtime-rocks.mjs';
import {createRidgeTarget,transformedVertices,withSceneHeight} from './ridge.mjs';

const data=JSON.parse(fs.readFileSync(new URL('./study-data.json',import.meta.url))),source=data.scenes[0];
assert(!data.geometries,'The distributed scene must contain no baked atomic meshes');
const kernel=Function(buildAtomicKernel()+';return atomicRockKernel();')();await kernel.ready;
function checkSolid(g){
 assert(g.positions.every(Number.isFinite)&&g.normals.every(Number.isFinite));
 const edges=new Map();let volume=0;
 for(let i=0;i<g.indices.length;i+=3){
  const ids=g.indices.slice(i,i+3),[a,b,c]=ids.map(k=>g.positions.slice(k*3,k*3+3));
  const u=b.map((v,d)=>v-a[d]),v=c.map((x,d)=>x-a[d]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  // The unreduced Boolean mesh may contain valid sub-micron fragments. An
  // absolute area cutoff rejects those even when all three GPU positions are
  // distinct. Require nonzero area here and again at actual Float32 precision.
  assert(Math.hypot(...cross)>0,'No collapsed triangles');
  const [fa,fb,fc]=[a,b,c].map(p=>p.map(Math.fround)),fu=fb.map((v,d)=>v-fa[d]),fv=fc.map((v,d)=>v-fa[d]);
  assert(Math.hypot(fu[1]*fv[2]-fu[2]*fv[1],fu[2]*fv[0]-fu[0]*fv[2],fu[0]*fv[1]-fu[1]*fv[0])>0,'Triangles survive GPU Float32 conversion');
  volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=Math.min(a,b)+':'+Math.max(a,b),e=edges.get(key)||{count:0,direction:0};e.count++;e.direction+=a<b?1:-1;edges.set(key,e);}
 }
 assert(volume>0);assert([...edges.values()].every(e=>e.count===2&&e.direction===0),'Closed consistently wound runtime solid');
 assert.equal(g.positions.length/3-edges.size+g.indices.length/3,2,'Connected sphere topology');
 for(let i=0;i<g.positions.length;i++)assert(Math.abs(g.positions[i])<=g.parameters[['obbWidth','obbHeight','obbDepth'][i%3]]/2+.000051,'Runtime mesh stays in its generated OBB within the input position grid');
}
function inside(p,vertices,indices){
 const heights=[];
 for(let i=0;i<indices.length;i+=3){
  const [a,b,c]=indices.slice(i,i+3).map(k=>vertices[k]),x=p[0],z=p[2],d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-9)continue;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;
  if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7){const y=u*a[1]+v*b[1]+(1-u-v)*c[1];if(y>p[1]+1e-6)heights.push(y);}
 }
 heights.sort((a,b)=>a-b);return heights.filter((y,i)=>!i||y-heights[i-1]>1e-5).length%2===1;
}
const seeds=[0,480,481,4294967295],libraries={},fingerprints={};
for(const seed of seeds){
 const g=generateRuntimeRocks(kernel,seed);libraries[seed]=g;fingerprints[seed]=runtimeRockFingerprint(g);
 assert.deepEqual(g,generateRuntimeRocks(kernel,seed),'Recipes and mesh buffers reproduce exactly');
 assert.deepEqual(Object.fromEntries(Object.entries(g).map(([k,v])=>[k,v.parameters])),runtimeRockRecipes(seed));
 for(const mesh of Object.values(g))checkSolid(mesh);
}
assert.equal(new Set(Object.values(fingerprints)).size,seeds.length,'Each seed regenerates the geometry');
for(const name of Object.keys(libraries[480]))assert.notDeepEqual(libraries[480][name].positions,libraries[481][name].positions,'Every variant changes with the seed');
const assemblies=[],cache={};
for(const [seed,topology,mode] of [[480,{seeded:false,peaks:3,branches:4},'direct'],[480,{seeded:false,peaks:5,branches:8},'direct'],[481,{seeded:true},'direct'],[481,{seeded:true},'perlin']]){
 const request={source,seed,mode,topology,fractures:{depth:1.4,width:1.6,irregularity:1.8}},baseBefore=cache.seed===seed?cache.base:null;
 const built=buildRuntimeMountain(kernel,request,cache),scene=built.scene;
 if(baseBefore)assert.equal(built.baseGeometries,baseBefore,'Count/mode changes reuse the same runtime atoms');
 else for(const g of Object.values(built.geometries))checkSolid(g);
 if(mode==='direct')assert.deepEqual(scene.ridge.plan,createRidgeTarget(source,seed,topology),'Atomic geometry does not move the target');
 assert.equal(scene.ridge.composition.components,1);assert(scene.ridge.composition.smallRocks<=2);assert(scene.ridge.composition.structuralMasses<=30);
 const vertices=new Map(scene.rocks.map(r=>[r.id,transformedVertices(r,built.geometries[r.mesh])]));
 for(const rock of scene.rocks){assert(rock.role==='small accent'||rock.massLengthM>=12);for(const p of vertices.get(rock.id))assert(p[0]>source.extent[0]&&p[0]<source.extent[1]&&p[2]>source.extent[2]&&p[2]<source.extent[3]);}
 for(const edge of scene.ridge.composition.contactEdges){
  const rocks=[edge.a,edge.b].map(id=>scene.rocks.find(r=>r.id===id));
  assert(edge.witnesses.filter(w=>rocks.every(r=>inside(w.position,vertices.get(r.id),built.geometries[r.mesh].indices))).length>=2,'Independent overlap witnesses on runtime carved meshes');
 }
 assert(scene.ridge.fit.rmsM<scene.ridge.policy.curveToleranceM*1.25,'Runtime atoms still follow the broad ridge envelope');
 if(seed===480&&topology.peaks===3){
  assert.deepEqual(scene,buildRuntimeMountain(kernel,request,cache).scene,'Complete runtime assembly replay');
  const scaled=withSceneHeight(scene,2);for(const r of scaled.rocks)transformedVertices(r,built.geometries[r.mesh]).forEach((p,i)=>p.forEach((v,d)=>assert(Math.abs(v-vertices.get(r.id)[i][d]*(d===1?2:1))<1e-8)));
 }
 assemblies.push({seed,mode,topology,fingerprint:built.generation.fingerprint,masses:scene.ridge.composition.structuralMasses,smallRocks:scene.ridge.composition.smallRocks,rmsM:scene.ridge.fit.rmsM,maximumUnderM:scene.ridge.fit.maxUnderM,maximumOverM:scene.ridge.fit.maxOverM});
}
const result={version:RUNTIME_ROCK_VERSION,generatedBaseMeshes:seeds.length*8,fingerprints,assemblies,
 checks:['no baked mesh input','seed generates recipes and every mesh variant','exact recipe and mesh replay','finite bounded closed wound geometry','carved runtime solids','target independent from atoms','count edits reuse generated atoms','large connected masses and sparse accents','independent contact witnesses','bounded RMS fit','complete assembly replay','height scales runtime geometry']};
fs.writeFileSync(new URL('../evidence/runtime-rock-validation.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
