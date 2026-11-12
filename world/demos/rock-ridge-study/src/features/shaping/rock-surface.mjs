import {clamp} from '../../ridge-utils.mjs';
import {convexCarveCutter,sweptCarveCutter,carveSolidMesh} from './solid-carve.mjs';

export const ROCK_SURFACE_VERSION='fracture-controls-6';
export const FRACTURE_DEFAULTS=Object.freeze({depth:1,width:1,irregularity:1});
export function fractureSettings(options={}){return Object.fromEntries(Object.entries(FRACTURE_DEFAULTS).map(([key,value])=>[key,Number.isFinite(options?.[key])?clamp(options[key],0,2):value]));}
const PREVIOUS_SURFACE_VERSION='solid-carving-4';
const surfaceCache=new WeakMap(),previousSurfaceCache=new WeakMap();
const surfaceBlend=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const surfaceHash=(x,y,z,seed)=>{
 let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,2147483647)^(seed|0);
 h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;
};
const surfaceCross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const surfaceDot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const surfaceSub=(a,b)=>a.map((v,i)=>v-b[i]);
const surfaceUnit=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};

function surfaceNormals(vertices,indices){
 const sums=vertices.map(()=>[0,0,0]),weights=new Float64Array(vertices.length),faces=[];
 for(let i=0;i<indices.length;i+=3){
  const [a,b,c]=indices.slice(i,i+3),normal=surfaceCross(surfaceSub(vertices[b],vertices[a]),surfaceSub(vertices[c],vertices[a])),weight=Math.hypot(...normal);
  faces.push(normal);for(const k of [a,b,c]){for(let d=0;d<3;d++)sums[k][d]+=normal[d];weights[k]+=weight;}
 }
 return {normals:sums.map(surfaceUnit),weights,faces};
}

// Comparison uses the exact straight-wedge construction from solid-carving-4.
export function previousFractureRockGeometry(g){
 if(!previousSurfaceCache.has(g))previousSurfaceCache.set(g,solidFractureGeometry(g,false));
 return previousSurfaceCache.get(g);
}
export function fractureRockGeometry(g,options){
 const settings=fractureSettings(options),key=JSON.stringify(settings),cached=surfaceCache.get(g);
 if(cached?.key===key)return cached.geometry;
 const geometry=solidFractureGeometry(g,true,settings);surfaceCache.set(g,{key,geometry});return geometry;
}
function solidFractureGeometry(g,irregular,settings=FRACTURE_DEFAULTS){
 const version=irregular?ROCK_SURFACE_VERSION:PREVIOUS_SURFACE_VERSION;
 const seed=g.parameters.seed+54139,lo=g.bounds[0],hi=g.bounds[1],height=hi[1]-lo[1],center=[(lo[0]+hi[0])*.5,(lo[2]+hi[2])*.5],radius=[(hi[0]-lo[0])*.5,(hi[2]-lo[2])*.5];
 const normalize=p=>[(p[0]-center[0])/radius[0],(p[1]-lo[1])/height,(p[2]-center[1])/radius[1]],denormalize=p=>[center[0]+p[0]*radius[0],lo[1]+p[1]*height,center[1]+p[2]*radius[1]];
 const normalized=Array.from({length:g.positions.length/3},(_,i)=>normalize(g.positions.slice(i*3,i*3+3))),phase=surfaceHash(0,0,0,seed)*Math.PI*2;
 const faces=Array.from({length:6},(_,i)=>{
  const angle=phase+i*Math.PI/3+(surfaceHash(i,0,0,seed)-.5)*.30,n=[Math.cos(angle),Math.sin(angle)],support=(a,b)=>Math.max(.15,...normalized.filter(p=>p[1]>=a&&p[1]<=b).map(p=>p[0]*n[0]+p[2]*n[1]));
  const bottom=support(.12,.40),top=support(.64,.86),slope=(top-bottom)/.49,cut=.73+.07*surfaceHash(i,1,0,seed);return {n,offset:(bottom-slope*.26)*cut,slope:slope*cut};
 });
 const cutters=[],planeInfo=[],cutterBounds=[{n:[1,0,0],w:3},{n:[-1,0,0],w:3},{n:[0,1,0],w:1.1},{n:[0,-1,0],w:.1},{n:[0,0,1],w:3},{n:[0,0,-1],w:3}];
 // Each cutter exits the body on inclined end planes. There are no horizontal
 // end caps on the rock, vertex displacement, or per-triangle backoff factors.
 const ends=(n,offset,slope,low=.065,high=g.parameters.topRoughness===0?.65:.985)=>{
  const start=low+.16,stop=high-.12,lowerSlope=(offset+slope*start-1.7)/(start-low),upperSlope=(1.7-offset-slope*stop)/(high-stop);
  return [{n:[-n[0],lowerSlope,-n[1]],w:-(1.7-lowerSlope*low)},{n:[-n[0],upperSlope,-n[1]],w:-(1.7-upperSlope*high)},{n:[-n[0],0,-n[1]],w:-.18}];
 };
 const add=(planes,kind)=>{const cutter=convexCarveCutter([...planes,...cutterBounds],planeInfo.length+1);cutters.push(cutter);planeInfo.push(...cutter.planes.map(p=>({...p,kind})));};
 let anchor=[0,-Infinity,0];for(let i=0;i<g.positions.length;i+=3)if(g.positions[i+1]>=anchor[1])anchor=g.positions.slice(i,i+3);
 const summit=normalize(anchor);
 for(const face of faces){
  // Broad faces run through the foot and crown, so stopping a cut cannot leave
  // a rim or plinth. Keep the actual summit inside every cutting halfspace.
  face.offset=Math.max(face.offset,face.n[0]*summit[0]+face.n[1]*summit[2]-face.slope+1e-5);
  if(g.parameters.topRoughness!==0)add([{n:[-face.n[0],face.slope,-face.n[1]],w:-face.offset},{n:[-face.n[0],0,-face.n[1]],w:-.18}],'face');
 }
 const firstJoint=cutters.length,fracturePaths=[];
 for(let i=0;i<5;i++){
  if(irregular&&(!settings.depth||!settings.width))break;
  const angle=phase+.26+i*Math.PI*2/5+(surfaceHash(i,3,0,seed)-.5)*.32,n=[Math.cos(angle),Math.sin(angle)],t=[-n[1],n[0]];
  const face=faces.filter(f=>f.n[0]*n[0]+f.n[1]*n[1]>.1).sort((a,b)=>(a.offset+a.slope*.5)/(a.n[0]*n[0]+a.n[1]*n[1])-(b.offset+b.slope*.5)/(b.n[0]*n[0]+b.n[1]*n[1]))[0];
  const alignment=face.n[0]*n[0]+face.n[1]*n[1],offset=face.offset/alignment-(.20+.07*surfaceHash(i,5,0,seed)),slope=face.slope/alignment,opening=.40+.12*surfaceHash(i,4,0,seed),lean=.025;
  const sides=[-1,1].map(sign=>({n:[sign*t[0]-opening*n[0],opening*slope-sign*lean,sign*t[1]-opening*n[1]],w:-opening*offset-sign*lean*.5}));
  if(!irregular){add([...sides,...ends(n,offset,slope,.08+.04*surfaceHash(i,6,0,seed))],'joint');continue;}
  const low=.025+.13*surfaceHash(i,6,0,seed),high=g.parameters.topRoughness===0?.65:.87+.115*surfaceHash(i,7,0,seed),span=high-low;
  const tangent=face.n[0]*t[0]+face.n[1]*t[1],aspect=Math.min(1,height/Math.hypot(t[0]*radius[0],t[1]*radius[1])*.4),drift=(surfaceHash(i,8,0,seed)-.5)*.25*aspect;
  const stations=[0,.19+.035*surfaceHash(i,9,0,seed),.40+.06*surfaceHash(i,10,0,seed),.66+.06*surfaceHash(i,11,0,seed),.85+.025*surfaceHash(i,12,0,seed),1];
  // A few independent geological-scale bends, not vertex-frequency noise.
  // Depth variation changes the opening width continuously; unequal walls
  // prevent a repeated symmetric V profile. Both tips exit outside the rock.
  const centers=stations.map((u,j)=>(drift*(u-.5)+(surfaceHash(i,13+j,0,seed)-.5)*.30*aspect)*settings.irregularity);
  const sections=stations.map((u,j)=>{
   const y=low+u*span,center=centers[j],skin=(face.offset+face.slope*y-tangent*center)/alignment;
   const variation=.65+.60*surfaceHash(i,20+j,0,seed),depth=(.20+.07*surfaceHash(i,5,0,seed))*(settings.irregularity===1?variation:.95+(variation-.95)*settings.irregularity)*settings.depth;
   const exit=g.parameters.topRoughness===0?1.7:skin+.035;
   return {y,center,tip:Math.max(.22,j===0||j===stations.length-1?exit:skin-depth)};
  });
  const asymmetry=.62+.24*surfaceHash(i,27,0,seed),openings=[opening*asymmetry*settings.width,opening*(1.65-asymmetry)*settings.width];
  const cutter=sweptCarveCutter(sections,n,openings,planeInfo.length+1);
  cutters.push(cutter);planeInfo.push(...cutter.planes.map(p=>({...p,kind:'joint'})));fracturePaths.push({n,opening:openings,sections});
 }
 const mesh=carveSolidMesh(normalized.flat(),g.indices,cutters),result=Array.from({length:mesh.positions.length/3},(_,i)=>denormalize(mesh.positions.slice(i*3,i*3+3))),indices=mesh.indices;
 const final=surfaceNormals(result,indices),bounds=[0,1,2].map(d=>[Math.min(...result.map(p=>p[d])),Math.max(...result.map(p=>p[d]))]);
 const details=result.map(p=>{
  const q=normalize(p);let joint=0;for(const cutter of cutters.slice(firstJoint)){const distance=Math.min(...(cutter.regions||[cutter.planes]).map(region=>Math.max(...region.map(plane=>surfaceDot(plane.n,q)-plane.w))));joint=Math.max(joint,1-surfaceBlend(0,.07,Math.max(0,distance)));}return [joint,.51,0];
 });
 const output={...g,positions:result.flat(),indices,normals:final.normals.flat(),rockDetail:details.flat(),faceTags:mesh.faceTags,bounds:[bounds.map(b=>b[0]),bounds.map(b=>b[1])],stats:{triangles:indices.length/3,method:version},surface:{version,sourceTriangles:g.indices.length/3,anchor,planes:firstJoint,fractures:irregular?fracturePaths.length:5,vertices:result.length,construction:'solid subtraction',...(irregular?{fracturePaths,settings}:{}),cutPlanes:planeInfo,normalizedFrame:{center,radius,minimum:lo[1],height}}};
 return output;
}

export function fracturedRockLibrary(geometries,options){return Object.fromEntries(Object.entries(geometries).map(([id,g])=>[id,fractureRockGeometry(g,options)]));}

// Split only the render normals at physical creases. Geometry used by fitting
// and contact measurements stays welded and has identical triangle positions.
export function creasedRockAttributes(g){
 const p=g.positions,indices=g.indices,vertices=Array.from({length:p.length/3},(_,i)=>p.slice(i*3,i*3+3));
 const {faces}=surfaceNormals(vertices,indices),unit=faces.map(surfaceUnit),adjacent=vertices.map(()=>[]);
 for(let i=0;i<indices.length;i++)adjacent[indices[i]].push(Math.floor(i/3));
 const positions=[],normals=[],rockDetail=[],threshold=Math.cos(30*Math.PI/180);
 for(let i=0;i<indices.length;i++){
  const id=indices[i],face=Math.floor(i/3),sum=[0,0,0];
  for(const j of adjacent[id])if(g.faceTags?.[face]>0?g.faceTags[j]===g.faceTags[face]:!(g.faceTags?.[j]>0)&&surfaceDot(unit[face],unit[j])>=threshold)for(let d=0;d<3;d++)sum[d]+=faces[j][d];
  positions.push(...vertices[id]);normals.push(...surfaceUnit(sum));rockDetail.push(...(g.rockDetail?.slice(id*3,id*3+3)||[0,.5,0]));
 }
 return {positions,normals,rockDetail};
}

export function applyStoneSurface(material,THREE,oxideColor){
 material.roughness=.88;material.extensions={...material.extensions,derivatives:true};
 material.onBeforeCompile=shader=>{
  shader.uniforms.rockOxide={value:new THREE.Color(oxideColor)};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 rockDetail; varying vec3 vRockLocal; varying vec3 vRockDetail;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRockLocal=position;vRockDetail=rockDetail;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vRockLocal; varying vec3 vRockDetail; uniform vec3 rockOxide;
float rsHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float rsNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(rsHash(i),rsHash(i+vec3(1,0,0)),f.x),mix(rsHash(i+vec3(0,1,0)),rsHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(rsHash(i+vec3(0,0,1)),rsHash(i+vec3(1,0,1)),f.x),mix(rsHash(i+vec3(0,1,1)),rsHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float rsGrain(vec3 p){return rsNoise(p*6.)*.68+rsNoise(p*17.)*.32;}
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
float rsGrainValue=rsGrain(vRockLocal);
float rsOxide=smoothstep(.64,.85,rsNoise(vRockLocal*.47+vec3(8.,1.,3.)))*.32;
diffuseColor.rgb=mix(diffuseColor.rgb,rockOxide,rsOxide);
diffuseColor.rgb*= (.84+.18*vRockDetail.y)*(.86+.25*rsGrainValue)*(1.-.43*vRockDetail.x)+.08*vRockDetail.z;
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(.5-rsGrainValue)*.18,.65,1.);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec3 rsDx=dFdx(-vViewPosition),rsDy=dFdy(-vViewPosition);
float rsFilter=1.-smoothstep(.15,.65,max(length(dFdx(vRockLocal)),length(dFdy(vRockLocal))));
float rsHeight=rsGrainValue*.020*rsFilter;
vec3 rsR1=cross(rsDy,normal),rsR2=cross(normal,rsDx);
float rsDet=dot(rsDx,rsR1);
normal=normalize(abs(rsDet)*normal-sign(rsDet)*(dFdx(rsHeight)*rsR1+dFdy(rsHeight)*rsR2));
`);
 };
 material.customProgramCacheKey=()=>ROCK_SURFACE_VERSION;
 return material;
}
