import {random} from './ridge-utils.mjs';
import {fracturedRockLibrary,fractureSettings} from './rock-surface.mjs';
import {generateRidgeScene} from './ridge.mjs';

export const RUNTIME_ROCK_VERSION='seeded-atomic-rocks-1';
export const RUNTIME_ROCK_SLOTS=['peak','peak2','shoulder','shoulder2','cliff','cliff2','bank','bank2'];

// These are fitting roles, not stored recipes. Every dimension/profile/face
// parameter and the upstream mesh seed are chosen anew from the mountain seed.
// Independent streams keep atom shapes unchanged when only ridge counts change.
export function runtimeRockRecipes(inputSeed){
 const seed=Number(inputSeed)>>>0;
 return Object.fromEntries(RUNTIME_ROCK_SLOTS.map(slot=>{
  const rng=random(seed,RUNTIME_ROCK_VERSION+':'+slot),range=(a,b)=>a+(b-a)*rng();
  const crown=slot.startsWith('peak'),shoulder=slot.startsWith('shoulder'),toe=slot.startsWith('bank');
  const width=range(crown?20:toe?6:12,crown?27:toe?9:17);
  return [slot,{seed:1+Math.floor(rng()*4294967294),resolution:24,
   obbWidth:width,obbHeight:width*range(crown?.85:toe?.48:.66,crown?1.08:toe?.74:.91),obbDepth:width*range(.68,.9),
   bottomScale:1,topScale:range(crown?.19:shoulder?.42:.67,crown?.34:shoulder?.63:.84),
   shoulderScale:range(crown?.70:.90,crown?.84:.99),shoulderHeight:range(crown?.46:shoulder?.43:.57,crown?.61:shoulder?.59:.70),
   topSlope:range(crown?17:shoulder?10:3,crown?27:shoulder?21:10),topDirection:range(0,360),topRoughness:range(.06,crown?.17:.12),
   outlineIrregularity:range(.07,.21),wear:range(.14,.30),wallCount:Math.floor(range(8,13)),
   wallStrength:range(.30,.47),wallProtrusion:range(.12,.25),wallOverlap:range(.46,.64),wallLength:range(1.3,1.9),wallTilt:range(3,12)}];
 }));
}

export function generateRuntimeRocks(kernel,seed){
 return Object.fromEntries(Object.entries(runtimeRockRecipes(seed)).map(([slot,parameters])=>{
  const raw=kernel.buildRock(parameters),mesh=kernel.simplifyRock(raw,{targetTriangles:1000,error:.008});
  // Preserve bake.mjs's 0.1 mm position grid before solid carving. Feeding its
  // Float32 near-coplanar noise directly to the double-precision BSP creates
  // sub-pixel slivers. This is input precision, not post-carve displacement.
  const positions=Array.from(mesh.positions,v=>Number(v.toFixed(4)));
  const bounds=[Math.min,Math.max].map(fn=>[0,1,2].map(d=>fn(...positions.filter((_,i)=>i%3===d))));
  return [slot,{parameters,positions,normals:Array.from(mesh.normals),indices:Array.from(mesh.indices),bounds,
   generated:{version:RUNTIME_ROCK_VERSION,seed:Number(seed)>>>0,slot},
   stats:{triangles:mesh.indices.length/3,rawTriangles:raw.indices.length/3,budgetMet:mesh.stats.budgetMet,method:mesh.stats.simplificationMethod}}];
 }));
}

export function runtimeRockFingerprint(geometries){
 let hash=2166136261;
 for(const name of RUNTIME_ROCK_SLOTS){const g=geometries[name];for(const array of [new Float32Array(g.positions),new Float32Array(g.normals),new Uint32Array(g.indices)])
  for(const byte of new Uint8Array(array.buffer))hash=Math.imul(hash^byte,16777619);
 }
 return (hash>>>0).toString(16).padStart(8,'0');
}

// Runs in the worker in the viewer, and directly in Node verification. Cache only
// the current seed and fracture settings; never fall back to geometry.json.
export function buildRuntimeMountain(kernel,request,cache={}){
 const seed=Number(request.seed)>>>0;
 if(cache.seed!==seed||!cache.base){cache.base=generateRuntimeRocks(kernel,seed);cache.seed=seed;cache.surfaceKey=null;cache.fractured=null;
  cache.generation={version:RUNTIME_ROCK_VERSION,seed,variants:Object.keys(cache.base).length,fingerprint:runtimeRockFingerprint(cache.base)};}
 const settings=fractureSettings(request.fractures),surfaceKey=JSON.stringify(settings);
 if(!request.original&&cache.surfaceKey!==surfaceKey){cache.fractured=fracturedRockLibrary(cache.base,settings);cache.surfaceKey=surfaceKey;}
 const geometries=request.original?cache.base:cache.fractured;
 const scene=generateRidgeScene(request.source,geometries,seed,{mode:request.mode,noise:request.noise,topology:request.topology});
 return {scene,geometries,baseGeometries:cache.base,libraryKey:RUNTIME_ROCK_VERSION+':'+seed+':'+(request.original?'original':surfaceKey),
  generation:cache.generation};
}
