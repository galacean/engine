import fs from 'node:fs';
import { generateRidgeScene, DEFAULT_RIDGE_SEED } from './ridge.mjs';
const baked=JSON.parse(fs.readFileSync(new URL('./geometry.json',import.meta.url)));
const scenes=[];
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
function baseCase(id,name,extent,height,notes){return {id,name,extent,ground:height,rocks:[],guides:[],labels:[],notes};}
function rock(scene,mesh,x,z,scale,yaw,role,options={}){
 const g=baked.geometries[mesh],p=g.parameters,c=Math.cos(yaw),s=Math.sin(yaw);
 let bottom=Infinity;
 for(let ix=0;ix<=6;ix++)for(let iz=0;iz<=6;iz++){
  const dx=(ix/6-.5)*p.obbWidth*scale,dz=(iz/6-.5)*p.obbDepth*scale;
  bottom=Math.min(bottom,scene.ground(x+c*dx-s*dz,z+s*dx+c*dz));
 }
 bottom-=options.burial??.3;
 if(options.top!==undefined)bottom=options.top-g.bounds[1][1]*scale+g.bounds[0][1]*scale;
 if(options.base!==undefined)bottom=options.base;
 scene.rocks.push({id:scene.id+'-'+scene.rocks.length,mesh,x,z,scale,yaw,y:bottom-g.bounds[0][1]*scale,role});
}
// All layouts below are proposed study examples, not snapshots of a shipped Seed.
// They reuse the upstream generator and adapt Seed's curve, support and exclusion concepts.
{
 const edge=x=>Math.sqrt(Math.max(0,36*36-x*x))-36;
 const s=baseCase('cliff','1a · Curved cliff',[-46,46,-33,31],(x,z)=>12*(1-smooth(-6,4,z-edge(x)))+.12*Math.sin(x*.14),
  'A curved cliff crest with ridges extending across the upper ground.');
 s.camera={target:[0,5,-2],yaw:.14,pitch:.47,span:98};
 scenes.push(s);
}
{
 const route=[];
 for(let i=0;i<=30;i++)route.push([-34+52*i/30,24-9*i/30]);
 for(let i=1;i<=30;i++){const a=Math.PI/2-Math.PI*i/30;route.push([18+6*Math.cos(a),9+6*Math.sin(a)]);}
 for(let i=1;i<=30;i++)route.push([18-48*i/30,3-13*i/30]);
 const hill=(x,z)=>(36-z)*.28;
 const ground=(x,z)=>{let nearest=Infinity,level=0;
  for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));const px=a[0]+dx*t,pz=a[1]+dz*t,d=Math.hypot(x-px,z-pz);if(d<nearest){nearest=d;level=hill(px,pz);}}
  const weight=1-smooth(1.8,3.8,nearest);return hill(x,z)*(1-weight)+level*weight;
 };
 const s=baseCase('path','1b · Uphill path bend',[-42,42,-29,33],ground,
  'Reserve a 3.5 m turning corridor, anchor the inside bend, leave the exit visible.');
 const candidates=[['cliff',-24,14,.62,-.17,'backing'],['cliff2',-12,12,.67,-.17,'backing'],['cliff',1,10,.55,-.17,'backing'],['bank',17,9,.72,1.5,'bend anchor'],['cliff2',-20,-15,.68,.27,'backing'],['cliff',-6,-11,.6,.27,'backing'],['bank',12,-6,.8,.27,'exit'],['bank2',28,13,.42,1.1,'footstone'],['bank',-27,30,.35,-.17,'footstone']];
 for(const a of candidates)rock(s,...a);
 let minimumClearance=Infinity;
 for(const r of s.rocks){const p=baked.geometries[r.mesh].parameters,c=Math.cos(r.yaw),sn=Math.sin(r.yaw);
  for(const [x,z]of route){const dx=x-r.x,dz=z-r.z,lx=c*dx+sn*dz,lz=-sn*dx+c*dz;const gap=Math.hypot(Math.max(0,Math.abs(lx)-p.obbWidth*r.scale/2),Math.max(0,Math.abs(lz)-p.obbDepth*r.scale/2));minimumClearance=Math.min(minimumClearance,gap);}
 }
 s.guides=[{kind:'route',width:3.5,points:route.map(([x,z])=>[x,ground(x,z)+.08,z])}];
 s.labels=[{text:'Reserved turning space',position:[26,14,9]},{text:'Open uphill exit',position:[-27,16,-10]}];
 s.validation={corridorWidthM:3.5,minimumCenterlineToObbM:+minimumClearance.toFixed(3),controllerVerified:false};
 if(minimumClearance<1.75)throw new Error('Uphill corridor intersects a proposed rock: '+minimumClearance);
 s.camera={target:[0,9,0],yaw:-.3,pitch:.63,span:96};scenes.push(s);
}
{
 const s=baseCase('island','2 · Offshore vista',[-67,67,-49,49],(x,z)=>{
  const a=Math.atan2(z/29,x/54),r=Math.hypot(x/54,z/29)/(1+.065*Math.sin(a*3)+.035*Math.cos(a*5));
  return -3+5.4*(1-smooth(.76,1.05,r))+1.1*Math.exp(-((x/31)**2+(z/15)**2));
 },'A dominant crown with unequal branching ridges inside the coastline.');
 s.water=0;
 s.camera={target:[0,10,0],yaw:.18,pitch:.28,span:141};
 scenes.push(s);
}
{
 const s=baseCase('peaks','3 · Mountain peaks',[-56,56,-41,42],(x,z)=>1+7*Math.exp(-((x/31)**2+(z/24)**2)),
  'Unequal summits joined by ridges extending across the width and depth.');
 s.camera={target:[0,18,0],yaw:.22,pitch:.30,span:117};
 scenes.push(s);
}
{
 const s=baseCase('platform','4 · Walkable shelves',[-38,38,-23,23],()=>0,
  'Broad flat caps overlap; the route follows controlled top heights.');
 const xs=[-23,-16,-9,-2,5,12,19],zs=[-2,-1.5,-.2,1.2,2,1.6,.6];
 const scales=[.95,1.1,.9,1.18,.92,1,1.4],yaws=[-.03,.08,.12,.13,.02,-.09,-.10];
 xs.forEach((x,i)=>rock(s,i%2?'slab2':'slab',x,zs[i],scales[i],yaws[i],'cap',{top:.16*(i+1)}));
 rock(s,'bank',16,-7,.48,.1,'edge',{top:1.45});
 rock(s,'bank2',23,8,.35,-.1,'edge',{top:.65});
 rock(s,'bank2',-18,-7,.28,.1,'edge',{top:.40});
 s.route=Array.from({length:96},(_,i)=>{const x=-31+50*i/95;let j=1;while(j<xs.length-1&&x>xs[j])j++;const t=Math.max(0,Math.min(1,(x-xs[j-1])/(xs[j]-xs[j-1])));return [x,zs[j-1]+(zs[j]-zs[j-1])*t];});
 s.guides=[{kind:'route',width:3,points:s.route.map(([x,z])=>[x,.2,z])}];
 s.labels=[{text:'3 m route envelope',position:[-3,2.2,5]},{text:'Broad landing',position:[21,2.8,.2]}];
 s.camera={target:[0,.5,0],yaw:.5,pitch:.55,span:79};
 scenes.push(s);
}
{
 const river=z=>7.5*Math.sin(z/17),half=z=>5.8+.7*Math.cos(z/23);
 const s=baseCase('river','5 · Riverside',[-40,40,-48,48],(x,z)=>-1.8+3.6*smooth(half(z)-.4,half(z)+5,Math.abs(x-river(z))),
  'Three unequal bank clusters, a clear channel and an open access reach.');
 s.water=0;
 for(const [z,side,k] of [[-27,-1,1.25],[18,1,1.1],[35,1,.65]]){
  const a=Math.atan2(1,(7.5/17)*Math.cos(z/17));
  const normal=[-Math.sin(a),Math.cos(a)];
  const x=river(z)+side*(half(z)+2.8);
  rock(s,'bank',x,z,k,a,'anchor',{burial:.55});
  rock(s,'bank2',x+side*2.3,z-6,k*.6,a+.08,'companion',{burial:.4});
  rock(s,'bank',x+side*3.5,z+4.5,k*.38,a-.11,'fragment',{burial:.3});
 }
 rock(s,'bank2',river(-4)-half(-4)-3.5,-4,.45,1.2,'isolated',{burial:.5});
 s.channel=Array.from({length:70},(_,i)=>{const z=-47+94*i/69;return [river(z),z,half(z)];});
 s.guides=[{kind:'water',points:s.channel.map(([x,z])=>[x,.18,z])},{kind:'route',points:[[30,1.95,-7],[20,1.95,-5],[11,1.95,-3]]}];
 s.labels=[{text:'Bank cluster',position:[20,9,18]},{text:'Open access',position:[24,2,-10]}];
 s.camera={target:[0,1,0],yaw:.66,pitch:.68,span:103};
 scenes.push(s);
}
function worldTriangles(s){return s.rocks.flatMap(r=>{
 const g=baked.geometries[r.mesh],c=Math.cos(r.yaw),sn=Math.sin(r.yaw),v=[];
 for(let i=0;i<g.positions.length;i+=3){const x=g.positions[i]*r.scale,z=g.positions[i+2]*r.scale;v.push([r.x+c*x-sn*z,r.y+g.positions[i+1]*r.scale,r.z+sn*x+c*z]);}
 return Array.from({length:g.indices.length/3},(_,i)=>g.indices.slice(i*3,i*3+3).map(j=>v[j]));
})}
const platform=scenes.find(s=>s.id==='platform'),triangles=worldTriangles(platform);
function surface(x,z){let best=0;for(const [a,b,c] of triangles){
 const d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-8)continue;
 const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d;
 const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;
 if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)best=Math.max(best,u*a[1]+v*b[1]+(1-u-v)*c[1]);
 }return best;}
let maxRise=0,maxDrop=0,minCorridor=Infinity;
function routeZ(x){let i=1;while(i<platform.route.length-1&&x>platform.route[i][0])i++;const a=platform.route[i-1],b=platform.route[i],t=Math.max(0,Math.min(1,(x-a[0])/(b[0]-a[0])));return a[1]+(b[1]-a[1])*t;}
for(const offset of [-1.5,-.75,0,.75,1.5]){
 let previous=0;
 for(let x=-31;x<=19;x+=.1){const slope=(routeZ(x+.05)-routeZ(x-.05))/.1,l=Math.hypot(1,slope),h=surface(x-offset*slope/l,routeZ(x)+offset/l);maxRise=Math.max(maxRise,h-previous);maxDrop=Math.max(maxDrop,previous-h);previous=h;if(x>-25&&x<19)minCorridor=Math.min(minCorridor,h);}
}
platform.guides[0].points=platform.route.map(([x,z])=>[x,surface(x,z)+.06,z]);
platform.validation={samplePitchM:.1,corridorWidthM:3,maxSampledRiseM:+maxRise.toFixed(4),maxSampledDropM:+maxDrop.toFixed(4),minInteriorSurfaceM:+minCorridor.toFixed(4),controllerVerified:false};
if(maxRise>.22||maxDrop>.22||minCorridor<.10)throw new Error('Platform route fails study geometry bounds: '+JSON.stringify(platform.validation));
for(const s of scenes){
 const [x0,x1,z0,z1]=s.extent,nx=s.id==='river'?56:40,nz=s.id==='river'?52:36,vertices=[],indices=[];
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=x0+(x1-x0)*i/nx,z=z0+(z1-z0)*j/nz;vertices.push(+x.toFixed(3),+s.ground(x,z).toFixed(3),+z.toFixed(3));}
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);}
 s.terrain={positions:vertices,indices};delete s.ground;
 Object.assign(s,generateRidgeScene(s,baked.geometries,DEFAULT_RIDGE_SEED));
 s.metrics={rocks:s.rocks.length,triangles:s.rocks.reduce((n,r)=>n+baked.geometries[r.mesh].stats.triangles,0)};
}
const data={...baked,study:{kind:'proposed-arrangement-examples',date:'2026-11-09',seedWorldCommit:'9c832eb7f87640475237df003473538c693a90d4',collisionAndNavigationRuntimeTested:false},scenes};
fs.writeFileSync(new URL('./study-data.json',import.meta.url),JSON.stringify(data));
fs.writeFileSync(new URL('./arrangement-recipes.json',import.meta.url),JSON.stringify({...data.study,generator:data.generator,scenes:scenes.map(({terrain,...s})=>s)},null,2));
console.log(JSON.stringify(scenes.map(({id,metrics,validation})=>({id,...metrics,validation})),null,2));
console.log('data bytes',JSON.stringify(data).length);
