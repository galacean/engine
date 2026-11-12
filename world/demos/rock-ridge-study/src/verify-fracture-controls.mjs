import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fractureRockGeometry,fractureSettings,FRACTURE_DEFAULTS,ROCK_SURFACE_VERSION} from './rock-surface.mjs';

const data=JSON.parse(fs.readFileSync(new URL('./geometry.json',import.meta.url)));
const geometries=data.geometries||data,original=JSON.stringify(geometries);
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const volume=g=>{let value=0;for(let i=0;i<g.indices.length;i+=3){const [a,b,c]=g.indices.slice(i,i+3).map(id=>g.positions.slice(id*3,id*3+3));value+=dot(a,cross(b,c))/6;}return value;};
const settings=[{depth:0,width:1,irregularity:1},{depth:1,width:0,irregularity:1}];
for(const depth of [.1,2])for(const width of [.1,2])for(const irregularity of [0,2])settings.push({depth,width,irregularity});
assert.deepEqual(fractureSettings(),FRACTURE_DEFAULTS);
assert.deepEqual(fractureSettings({depth:-1,width:Infinity,irregularity:3}),{depth:0,width:1,irregularity:2});
const cases=[];
for(const [id,source] of Object.entries(geometries)){
 for(const options of settings){
  const g=fractureRockGeometry(source,options),edges=new Map(),planes=new Map(g.surface.cutPlanes.map(p=>[p.tag,p]));
  const vertices=Array.from({length:g.positions.length/3},(_,i)=>g.positions.slice(i*3,i*3+3)),retained=new Set(vertices.map(p=>p.map(v=>v.toFixed(7)).join(',')));
  assert(g.positions.every(Number.isFinite)&&g.normals.every(Number.isFinite),id+' finite');
  for(let i=0;i<g.indices.length;i+=3){
   const ids=g.indices.slice(i,i+3),[a,b,c]=ids.map(id=>vertices[id].map(Math.fround));
   assert(Math.hypot(...cross(sub(b,a),sub(c,a)))>0,id+JSON.stringify(options)+' GPU triangle');
   const p=planes.get(g.faceTags[i/3]);if(p?.kind==='joint')assert.equal(p.role,'wall',id+' no exposed end caps');
   for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=Math.min(a,b)+':'+Math.max(a,b),e=edges.get(key)||{count:0,balance:0};e.count++;e.balance+=a<b?1:-1;edges.set(key,e);}
  }
  assert([...edges.values()].every(e=>e.count===2&&e.balance===0),id+JSON.stringify(options)+' closed topology');
  assert.equal(vertices.length-edges.size+g.indices.length/3,2,id+' connected sphere topology');
  assert(volume(g)>0&&volume(g)<=volume(source)+1e-8,id+' subtraction volume');
  assert(retained.has(g.surface.anchor.map(v=>v.toFixed(7)).join(',')),id+' summit');
  if(source.parameters.topRoughness===0)for(let i=0;i<source.positions.length;i+=3){const p=source.positions.slice(i,i+3);if((p[1]-source.bounds[0][1])/(source.bounds[1][1]-source.bounds[0][1])>.65)assert(retained.has(p.map(v=>v.toFixed(7)).join(',')),id+' platform cap');}
  if(!options.depth||!options.width){assert.equal(g.surface.fractures,0);assert(g.rockDetail.every((v,i)=>i%3!==0||v===0),'Disabled fractures have no joint tone');}
  cases.push({id,...options,triangles:g.indices.length/3});
 }
}
const sensitivity=[];
for(const id of ['wall','peak','slab']){
 const source=geometries[id],baseline=fractureRockGeometry(source),baselinePositions=[...baseline.positions];
 for(const control of ['depth','width']){
  const shallow=fractureRockGeometry(source,{[control]:.5}),strong=fractureRockGeometry(source,{[control]:1.5});
  assert(volume(shallow)>volume(strong)+.01,id+' '+control+' changes solid carving');
  sensitivity.push({id,control,volumeAt50Percent:volume(shallow),volumeAt150Percent:volume(strong)});
 }
 assert.notDeepEqual(fractureRockGeometry(source,{irregularity:0}).positions,fractureRockGeometry(source,{irregularity:2}).positions,id+' irregularity changes geometry');
 assert.deepEqual(fractureRockGeometry(source).positions,baselinePositions,id+' default restored after tuning');
 assert.deepEqual(fractureRockGeometry(structuredClone(source),{depth:1.5,width:.5,irregularity:2}),fractureRockGeometry(source,{depth:1.5,width:.5,irregularity:2}),id+' deterministic replay');
}
assert.equal(JSON.stringify(geometries),original,'Controls preserve source meshes');
const result={version:ROCK_SURFACE_VERSION,cases,sensitivity,checks:['120 boundary and disabled-control meshes','closed connected wound solids and nonzero GPU triangles','no exposed fracture end caps','summits and platform caps retained','depth and width change actual removed volume','irregularity changes geometry','deterministic replay and default restoration','immutable sources and sanitized settings']};
fs.writeFileSync(new URL('../evidence/fracture-controls-validation.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({version:ROCK_SURFACE_VERSION,cases:cases.length,sensitivity:sensitivity.length}));
