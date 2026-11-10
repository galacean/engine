import {clamp} from './ridge-utils.mjs';

export const ROCK_SURFACE_VERSION='fractured-slab-1';
const surfaceCache=new WeakMap();
const surfaceBlend=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const surfaceHash=(x,y,z,seed)=>{
 let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,2147483647)^(seed|0);
 h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;
};
const surfaceCross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const surfaceDot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const surfaceSub=(a,b)=>a.map((v,i)=>v-b[i]);
const surfaceUnit=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};

// Long, uneven cells supply face patches and joints. They are regions of one
// continuous mesh, never detached rocks or uniformly spaced extruded strips.
function surfaceRegion(p,size,seed){
 const q=[p[0]/size[0]*3.4+.08*Math.sin(p[1]/size[1]*9+seed),p[1]/size[1]*1.8+.11*Math.sin(p[0]/size[0]*8),p[2]/size[2]*3.2+.07*Math.sin(p[1]/size[1]*7)];
 const cell=q.map(Math.floor),candidates=[];let first=null,second=null;
 for(let z=-1;z<=1;z++)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
  const c=[cell[0]+x,cell[1]+y,cell[2]+z],center=c.map((v,d)=>v+.15+.70*surfaceHash(...c,seed+d*1013)),distance=center.reduce((s,v,d)=>s+(v-q[d])**2,0);
  const candidate={id:c.join(','),center,distance,value:surfaceHash(...c,seed+7717)};candidates.push(candidate);
  if(!first||distance<first.distance){second=first;first=candidate;}else if(!second||distance<second.distance)second=candidate;
 }
 const boundary=(second.distance-first.distance)/(2*Math.hypot(...surfaceSub(second.center,first.center)));
 return {id:first.id,value:first.value,boundary,neighbors:candidates.filter(c=>c.distance-first.distance<.35).map(c=>({id:c.id,weight:(.35-(c.distance-first.distance))**2}))};
}

function surfaceSubdivide(g,levels){
 let vertices=Array.from({length:g.positions.length/3},(_,i)=>g.positions.slice(i*3,i*3+3)),indices=[...g.indices];
 for(let level=0;level<levels;level++){
  const edgeCache=new Map(),next=[];
  const middle=(a,b)=>{const key=Math.min(a,b)+':'+Math.max(a,b);if(edgeCache.has(key))return edgeCache.get(key);const id=vertices.length;vertices.push(vertices[a].map((v,d)=>(v+vertices[b][d])*.5));edgeCache.set(key,id);return id;};
  for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3),ab=middle(a,b),bc=middle(b,c),ca=middle(c,a);next.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);}
  indices=next;
 }
 return {vertices,indices};
}

function surfaceNormals(vertices,indices){
 const sums=vertices.map(()=>[0,0,0]),weights=new Float64Array(vertices.length),faces=[];
 for(let i=0;i<indices.length;i+=3){
  const [a,b,c]=indices.slice(i,i+3),normal=surfaceCross(surfaceSub(vertices[b],vertices[a]),surfaceSub(vertices[c],vertices[a])),weight=Math.hypot(...normal);
  faces.push(normal);for(const k of [a,b,c]){for(let d=0;d<3;d++)sums[k][d]+=normal[d];weights[k]+=weight;}
 }
 return {normals:sums.map(surfaceUnit),weights,faces};
}

export function fractureRockGeometry(g){
 if(surfaceCache.has(g))return surfaceCache.get(g);
 const {vertices,indices}=surfaceSubdivide(g,2),original=surfaceNormals(vertices,indices),seed=g.parameters.seed+92071;
 const size=[g.parameters.obbWidth,g.parameters.obbHeight,g.parameters.obbDepth],minimum=g.bounds[0][1],height=g.bounds[1][1]-minimum;
 const scale=Math.min(size[0],size[2],size[1]*1.5),regions=vertices.map(p=>surfaceRegion(p,size,seed)),patches=new Map();
 for(let i=0;i<vertices.length;i++){
  const region=regions[i];if(!patches.has(region.id))patches.set(region.id,{position:[0,0,0],normal:[0,0,0],weight:0});
  const patch=patches.get(region.id),w=original.weights[i];patch.weight+=w;
  for(let d=0;d<3;d++){patch.position[d]+=vertices[i][d]*w;patch.normal[d]+=original.normals[i][d]*w;}
 }
 for(const patch of patches.values()){patch.position=patch.position.map(v=>v/(patch.weight||1));patch.normal=surfaceUnit(patch.normal);}
 const details=[],protectedVertices=[],deltas=vertices.map((p,i)=>{
  const region=regions[i],y=(p[1]-minimum)/height;
  const mask=surfaceBlend(.065,.19,y)*(1-surfaceBlend(.985,1,y));
  const protect=mask===0||(g.parameters.topRoughness===0&&y>.65);protectedVertices.push(protect);
  const joint=1-surfaceBlend(.005,.15,region.boundary),rim=surfaceBlend(.06,.14,region.boundary)*(1-surfaceBlend(.14,.24,region.boundary));
  const chip=.5+.5*Math.sin(p[1]/scale*27+Math.sin(p[0]/scale*21)+Math.sin(p[2]/scale*19));
  const projection=[0,0,0];let totalWeight=0;
  for(const neighbor of region.neighbors){
   const patch=patches.get(neighbor.id);if(!patch)continue;
   const plane=clamp(surfaceDot(surfaceSub(p,patch.position),patch.normal),-scale*.035,scale*.065);
   for(let d=0;d<3;d++)projection[d]+=patch.normal[d]*plane*neighbor.weight;
   totalWeight+=neighbor.weight;
  }
  const recess=scale*(.018*joint+Math.max(0,chip-.64)*.006*joint);
  details.push(protect?[0,region.value,0]:[joint*mask,region.value,rim*mask]);
  if(protect)return [0,0,0];
  // Blend neighboring plane projections instead of fading back to the round
  // source at every border. This keeps joints continuous without raised rims.
  const wanted=p.map((v,d)=>v-(projection[d]/totalWeight+original.normals[i][d]*recess)*mask);
  return wanted.map((v,d)=>clamp(v,g.bounds[0][d],g.bounds[1][d])-p[d]);
 });
 const factors=new Float64Array(vertices.length).fill(1),result=vertices.map(p=>[...p]);
 const update=()=>{for(let i=0;i<vertices.length;i++)for(let d=0;d<3;d++)result[i][d]=vertices[i][d]+deltas[i][d]*factors[i];};
 // Limit the local displacement where a narrow source triangle cannot carry
 // it. This preserves winding and closed topology instead of making holes.
 let limited=0,remaining=0;
 for(let pass=0;pass<48;pass++){
  update();const unsafe=new Set();
  for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3),before=original.faces[i/3],after=surfaceCross(surfaceSub(result[b],result[a]),surfaceSub(result[c],result[a]));if(surfaceDot(before,after)<surfaceDot(before,before)*.08)for(const id of [a,b,c])unsafe.add(id);}
  remaining=unsafe.size;if(!remaining)break;
  for(const id of unsafe){if(factors[id]===1)limited++;factors[id]*=.52;}
 }
 if(remaining){factors.fill(0);update();throw new Error('Rock surface displacement could not preserve source triangle orientation');}
 const final=surfaceNormals(result,indices),positions=result.flat(),bounds=[0,1,2].map(d=>[Math.min(...result.map(p=>p[d])),Math.max(...result.map(p=>p[d]))]);
 let anchor=[0,-Infinity,0];for(let i=0;i<g.positions.length;i+=3)if(g.positions[i+1]>=anchor[1])anchor=g.positions.slice(i,i+3);
 const output={...g,positions,indices,normals:final.normals.flat(),rockDetail:details.flat(),bounds:[bounds.map(b=>b[0]),bounds.map(b=>b[1])],stats:{triangles:indices.length/3,method:ROCK_SURFACE_VERSION},surface:{version:ROCK_SURFACE_VERSION,sourceTriangles:g.indices.length/3,anchor,patches:patches.size,limitedVertices:limited,vertices:result.length,maximumDisplacementM:Math.max(...result.map((p,i)=>Math.hypot(...surfaceSub(p,vertices[i])))),protectedVertices:protectedVertices.filter(Boolean).length}};
 surfaceCache.set(g,output);return output;
}

export function fracturedRockLibrary(geometries){return Object.fromEntries(Object.entries(geometries).map(([id,g])=>[id,fractureRockGeometry(g)]));}

// Split only the render normals at physical creases. Geometry used by fitting
// and contact measurements stays welded and has identical triangle positions.
export function creasedRockAttributes(g){
 const p=g.positions,indices=g.indices,vertices=Array.from({length:p.length/3},(_,i)=>p.slice(i*3,i*3+3));
 const {faces}=surfaceNormals(vertices,indices),unit=faces.map(surfaceUnit),adjacent=vertices.map(()=>[]);
 for(let i=0;i<indices.length;i++)adjacent[indices[i]].push(Math.floor(i/3));
 const positions=[],normals=[],rockDetail=[],threshold=Math.cos(55*Math.PI/180);
 for(let i=0;i<indices.length;i++){
  const id=indices[i],face=Math.floor(i/3),sum=[0,0,0];
  for(const j of adjacent[id])if(surfaceDot(unit[face],unit[j])>=threshold)for(let d=0;d<3;d++)sum[d]+=faces[j][d];
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
diffuseColor.rgb*= (.78+.28*vRockDetail.y)*(.86+.25*rsGrainValue)*(1.-.43*vRockDetail.x)+.08*vRockDetail.z;
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(.5-rsGrainValue)*.18,.65,1.);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec3 rsDx=dFdx(-vViewPosition),rsDy=dFdy(-vViewPosition);
float rsFilter=1.-smoothstep(.15,.65,max(length(dFdx(vRockLocal)),length(dFdy(vRockLocal))));
float rsHeight=rsGrainValue*.034*rsFilter;
vec3 rsR1=cross(rsDy,normal),rsR2=cross(normal,rsDx);
float rsDet=dot(rsDx,rsR1);
normal=normalize(abs(rsDet)*normal-sign(rsDet)*(dFdx(rsHeight)*rsR1+dFdy(rsHeight)*rsR2));
`);
 };
 material.customProgramCacheKey=()=>ROCK_SURFACE_VERSION;
 return material;
}
