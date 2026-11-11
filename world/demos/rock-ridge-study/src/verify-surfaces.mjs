import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fracturedRockLibrary,fractureRockGeometry,creasedRockAttributes,ROCK_SURFACE_VERSION} from './rock-surface.mjs';
import {generateRidgeScene,createSurfaceSampler,transformedVertices,ridgePointAt,withSceneHeight} from './ridge.mjs';
import {measureFractureDirection} from './measure-fracture-direction.mjs';

const data=JSON.parse(fs.readFileSync(new URL('./study-data.json',import.meta.url)));
const original=JSON.stringify(data.geometries),started=performance.now(),library=fracturedRockLibrary(data.geometries),generationMs=performance.now()-started;
const sub=(a,b)=>a.map((v,d)=>v-b[d]),dot=(a,b)=>a.reduce((s,v,d)=>s+v*b[d],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const vertex=(g,i)=>g.positions.slice(i*3,i*3+3);
const near=(a,b,t,label)=>assert(Math.abs(a-b)<t,`${label}: ${a} / ${b}`);
const prototypes=[];
const directionBaseline=JSON.parse(fs.readFileSync(new URL('../evidence/surface-direction-baseline.json',import.meta.url)));
for(const [id,g] of Object.entries(library)){
 const source=data.geometries[id],edges=new Map(),jointWalls=new Set(),frame=g.surface.normalizedFrame,planes=new Map(g.surface.cutPlanes.map(p=>[p.tag,p]));let volume=0,maximumCutPlaneErrorM=0,cutTriangles=0,sourceTriangles=0;
 const normalize=p=>[(p[0]-frame.center[0])/frame.radius[0],(p[1]-frame.minimum)/frame.height,(p[2]-frame.center[1])/frame.radius[1]];
 const sourceBounds=[0,1,2].map(d=>[Math.min(...source.positions.filter((_,i)=>i%3===d)),Math.max(...source.positions.filter((_,i)=>i%3===d))]);
 const retained=new Set(Array.from({length:g.positions.length/3},(_,i)=>vertex(g,i).map(v=>v.toFixed(7)).join(',')));
 assert.deepEqual(g,fractureRockGeometry(structuredClone(source)),'Deterministic uncached replay');
 assert(g.positions.every(Number.isFinite)&&g.normals.every(Number.isFinite));
 for(let i=0;i<g.positions.length/3;i++){
  const p=vertex(g,i);p.forEach((v,d)=>assert(v>=sourceBounds[d][0]-1e-8&&v<=sourceBounds[d][1]+1e-8,'Subtraction remains in actual source bounds'));
  near(Math.hypot(...g.normals.slice(i*3,i*3+3)),1,1e-6,'Unit mesh normal');
 }
 assert(retained.has(g.surface.anchor.map(v=>v.toFixed(7)).join(',')),'The original summit remains on the solid');
 near(g.bounds[0][1],sourceBounds[1][0],1e-7,'Original bottom height');near(g.bounds[1][1],sourceBounds[1][1],1e-7,'Original top height');
 if(source.parameters.topRoughness===0)for(let i=0;i<source.positions.length/3;i++){const q=vertex(source,i);if(normalize(q)[1]>.65)assert(retained.has(q.map(v=>v.toFixed(7)).join(',')),'Platform cap vertices remain unchanged');}
 for(let i=0;i<g.indices.length;i+=3){
  const ids=g.indices.slice(i,i+3),[a,b,c]=ids.map(k=>vertex(g,k)),normal=cross(sub(b,a),sub(c,a));
  assert(Math.hypot(...normal)>1e-15,'No collapsed triangles');
  const [fa,fb,fc]=[a,b,c].map(p=>p.map(Math.fround));assert(Math.hypot(...cross(sub(fb,fa),sub(fc,fa)))>0,'Triangles survive GPU Float32 conversion');
  const tag=g.faceTags[i/3];
  if(tag>0){
   const plane=planes.get(tag),worldNormal=[plane.n[0]/frame.radius[0],plane.n[1]/frame.height,plane.n[2]/frame.radius[1]],length=Math.hypot(...worldNormal);
   if(plane.kind==='joint'){assert.equal(plane.role,'wall','Fractures expose their connected walls, never end caps or shelves');jointWalls.add(tag);}
   for(const p of [a,b,c])maximumCutPlaneErrorM=Math.max(maximumCutPlaneErrorM,Math.abs(dot(plane.n,normalize(p))-plane.w)/length);
   assert(dot(normal,worldNormal)<0,'Cut faces point into the removed volume');cutTriangles++;
  }else{
   const parent=(-tag-1)*3,[pa,pb,pc]=source.indices.slice(parent,parent+3).map(k=>vertex(source,k)),pn=cross(sub(pb,pa),sub(pc,pa));
   for(const p of [a,b,c])assert(Math.abs(dot(pn,sub(p,pa)))/Math.hypot(...pn)<1e-7,'Retained source faces stay on their original plane');
   assert(dot(normal,pn)>0,'Retained source faces preserve winding');sourceTriangles++;
  }
  volume+=dot(a,cross(b,c))/6;
  for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=Math.min(a,b)+':'+Math.max(a,b),e=edges.get(key)||{count:0,direction:0};e.count++;e.direction+=a<b?1:-1;edges.set(key,e);}
 }
 assert(volume>0,'Positive signed volume');
 assert(cutTriangles>0&&sourceTriangles>0,'Surface combines original faces and actual cut faces');
 assert(jointWalls.size>12,'Visible fractures retain multiple wall directions instead of reverting to five straight slots');
 assert(maximumCutPlaneErrorM<1e-7,'Every new cut face lies on one continuous cutter plane');
 assert([...edges.values()].every(e=>e.count===2&&e.direction===0),'Closed consistently wound manifold');
 assert.equal(g.positions.length/3-edges.size+g.indices.length/3,2,'Source sphere topology preserved');
 const render=creasedRockAttributes(g);
 assert.equal(render.positions.length,g.indices.length*3);
 for(let i=0;i<g.indices.length;i++){
  assert.deepEqual(render.positions.slice(i*3,i*3+3),vertex(g,g.indices[i]),'Rendered and measured triangles match exactly');
  near(Math.hypot(...render.normals.slice(i*3,i*3+3)),1,1e-6,'Unit crease normal');
  const plane=planes.get(g.faceTags[Math.floor(i/3)]);
  if(plane){const n=[plane.n[0]/frame.radius[0],plane.n[1]/frame.height,plane.n[2]/frame.radius[1]];near(dot(render.normals.slice(i*3,i*3+3),n)/Math.hypot(...n),-1,1e-6,'Cut face shading remains exactly on its plane');}
 }
 assert(render.rockDetail.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 let sourceVolume=0;for(let i=0;i<source.indices.length;i+=3){const [a,b,c]=source.indices.slice(i,i+3).map(k=>vertex(source,k));sourceVolume+=dot(a,cross(b,c))/6;}
 assert(volume<sourceVolume*.999,'Carving removes solid volume');
 const direction=measureFractureDirection(g),before=directionBaseline.prototypes.find(p=>p.id===id);
 // Sparse cuts on the 2.4 m platform slabs need less total length than tall
 // cliffs. Require meaningful coverage relative to each prototype's height.
 assert(direction.contourLengthM>2*(g.bounds[1][1]-g.bounds[0][1]),'Fracture contours remain present relative to rock height');
 if(!id.startsWith('slab')){
  assert(direction.within30DegreesOfVertical>before.within30DegreesOfVertical+.10,`${id}: direction must improve on the previous all-direction pattern`);
  assert(direction.within30DegreesOfVertical>.55,'Vertical joints dominate the steep faces');
 }
 const {cutPlanes,normalizedFrame,fracturePaths,...surface}=g.surface;
 prototypes.push({id,triangles:g.indices.length/3,...surface,visibleJointWalls:jointWalls.size,cutTriangles,sourceTriangles,maximumCutPlaneErrorM,signedVolumeM3:volume,removedVolumeM3:sourceVolume-volume,direction});
}
assert.equal(JSON.stringify(data.geometries),original,'Upstream geometry is immutable');

// Independent unbinned ray parity, not the fitter's interval sampler.
function inside(point,vertices,indices){
 const hits=[];
 for(let i=0;i<indices.length;i+=3){
  const [a,b,c]=indices.slice(i,i+3).map(k=>vertices[k]),[x,,z]=point,d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
  if(Math.abs(d)<1e-9)continue;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;
  if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7){const y=u*a[1]+v*b[1]+(1-u-v)*c[1];if(y>point[1]+1e-6)hits.push(y);}
 }
 hits.sort((a,b)=>a-b);return hits.filter((v,i)=>!i||v-hits[i-1]>1e-5).length%2===1;
}
const assemblies=[];
for(const [id,seed,options] of [['cliff',18,{mode:'perlin'}],['cliff',19,{mode:'perlin'}],['island',18,{mode:'perlin'}],['island',425,{mode:'perlin',noise:{frequency:4,octaves:5,lacunarity:2,persistence:.85}}],['island',425,{mode:'perlin',noise:{frequency:4,octaves:3,lacunarity:2,persistence:.85}}],['peaks',18,{mode:'perlin'}],['peaks',416,{mode:'perlin',noise:{frequency:4,octaves:5,lacunarity:2,persistence:.85}}],['peaks',382,{mode:'direct'}]]){
 const source=data.scenes.find(s=>s.id===id),before=JSON.stringify(source),scene=generateRidgeScene(source,library,seed,options),sample=createSurfaceSampler(scene,library),ground=createSurfaceSampler(source,{},true),errors=[];
 assert.equal(JSON.stringify(source),before);
 // Geometry may change the fit, never the independent target.
 assert.deepEqual(scene.ridge.plan,generateRidgeScene(source,data.geometries,seed,options).ridge.plan);
 const vertices=new Map(scene.rocks.map(r=>[r.id,transformedVertices(r,library[r.mesh])])),graph=new Map(scene.rocks.map(r=>[r.id,[]]));
 for(const r of scene.rocks){
  const vv=vertices.get(r.id);
  assert(vv.flat().every(Number.isFinite));
  for(const p of vv){assert(p[0]>source.extent[0]&&p[0]<source.extent[1]&&p[2]>source.extent[2]&&p[2]<source.extent[3]);if(id==='island')assert(ground(p[0],p[2])>=0);}
  if(r.role==='small accent')assert(Math.max(...vv.map(p=>p[1]))-Math.min(...vv.map(p=>p[1]))<=3.000001);else assert(r.massLengthM>=12);
 }
 for(const edge of scene.ridge.composition.contactEdges){
  const rocks=[edge.a,edge.b].map(id=>scene.rocks.find(r=>r.id===id));
  assert(edge.witnesses.filter(w=>rocks.every(r=>inside(w.position,vertices.get(r.id),library[r.mesh].indices))).length>=2,'Two solid contact witnesses after deformation');
  graph.get(edge.a).push(edge.b);graph.get(edge.b).push(edge.a);
 }
 const seen=new Set(),queue=[scene.rocks[0].id];while(queue.length){const id=queue.pop();if(seen.has(id))continue;seen.add(id);queue.push(...graph.get(id));}
 assert.equal(seen.size,scene.rocks.length);assert(scene.ridge.composition.smallRocks<=2);assert(scene.ridge.composition.structuralMasses<=30);
 for(const curve of scene.ridge.plan.curves){const count=Math.ceil(curve.knots.at(-1).t/.15);for(let i=0;i<=count;i++){const p=ridgePointAt(curve,curve.knots.at(-1).t*i/count);errors.push(sample(p[0],p[2])-p[1]);}}
 const rmsM=Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length),maximumDeviationM=Math.max(...errors.map(Math.abs)),band=scene.ridge.policy.curveToleranceM;
 assert(rmsM<band*1.25&&maximumDeviationM<band*3.2,`${id}/${seed}: surface residual ${rmsM}/${maximumDeviationM}`);
 let maximumGuideErrorM=0;
 for(const guide of scene.guides.filter(g=>g.kind==='spine'))for(const p of guide.points)maximumGuideErrorM=Math.max(maximumGuideErrorM,Math.abs(p[1]-guide.liftM-sample(p[0],p[2])));
 assert(maximumGuideErrorM<.015,'Orange guide measures the deformed surface');
 if(seed===416||seed===425){
  assert.deepEqual(scene,generateRidgeScene(source,library,seed,options),'Assembly replay with surface detail');
  for(const factor of [.25,1.3,1.45,2]){
   const scaled=withSceneHeight(scene,factor);
   for(const r of scaled.rocks)transformedVertices(r,library[r.mesh]).forEach((p,i)=>p.forEach((v,d)=>near(v,vertices.get(r.id)[i][d]*(d===1?factor:1),1e-8,'Height scales detailed triangles')));
  }
 }
 assemblies.push({scene:id,seed,options,structuralMasses:scene.ridge.composition.structuralMasses,smallRocks:scene.ridge.composition.smallRocks,verifiedContactEdges:scene.ridge.composition.contactEdges.length,rmsM,maximumDeviationM,maximumGuideErrorM});
}

const platform=data.scenes.find(s=>s.id==='platform'),oldTop=createSurfaceSampler(platform,data.geometries),newTop=createSurfaceSampler(platform,library);
let platformSamples=0,maximumPlatformChangeM=0;
function routeZ(x){let i=1;while(i<platform.route.length-1&&x>platform.route[i][0])i++;const a=platform.route[i-1],b=platform.route[i],t=Math.max(0,Math.min(1,(x-a[0])/(b[0]-a[0])));return a[1]+(b[1]-a[1])*t;}
for(const offset of [-1.5,-.75,0,.75,1.5])for(let x=-31;x<=19;x+=.1){const slope=(routeZ(x+.05)-routeZ(x-.05))/.1,l=Math.hypot(1,slope),px=x-offset*slope/l,pz=routeZ(x)+offset/l;maximumPlatformChangeM=Math.max(maximumPlatformChangeM,Math.abs(newTop(px,pz)-oldTop(px,pz)));platformSamples++;}
assert(maximumPlatformChangeM<1e-6,'Entire sampled 3m platform route remains unchanged');
const output={version:ROCK_SURFACE_VERSION,generationMs,checks:['immutable source and uncached deterministic replay','finite bounded geometry and unit normals','closed wound manifold and nonzero GPU triangles','every generated cut face lies on its cutter plane','fractures expose varied connected wall planes without end caps','cut face render normals stay on their analytic planes','retained source faces remain coplanar and consistently wound','original bottom height summit and flat platform caps','render positions equal measured mesh positions','vertical joint contours on non-platform steep faces','independent ridge target unchanged','large connected masses and sparse accents','independent ray parity on carved contact witnesses','dense fit and measured orange guides','carved mesh height scaling including 145 percent','unchanged 3m platform route'],prototypes,assemblies,platformSamples,maximumPlatformChangeM};
fs.writeFileSync(new URL('../evidence/surface-validation.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({version:output.version,prototypes:prototypes.length,assemblies:assemblies.length,platformSamples,maximumPlatformChangeM,maxRmsM:Math.max(...assemblies.map(r=>r.rmsM)),maximumDeviationM:Math.max(...assemblies.map(r=>r.maximumDeviationM)),generationMs},null,2));
