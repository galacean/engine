import {fracturedRockLibrary,fractureSettings} from './rock-surface.mjs';
import {generateRuntimeRocks,runtimeRockFingerprint,RUNTIME_ROCK_VERSION} from './atomic-rocks.mjs';
import {CARVE_VERSION} from './solid-carve.mjs';

// Source generation is shared input to both features, never a baked recipe.
// Disabling shaping exposes this seeded source without surface processing.
export function runtimeAtomicSource(kernel,request,cache){
 const started=performance.now(),seed=Number(request.seed)>>>0,baseCached=cache.seed===seed&&!!cache.base;
 if(!baseCached){
  cache.base=generateRuntimeRocks(kernel,seed);cache.seed=seed;
  cache.generation={version:RUNTIME_ROCK_VERSION,seed,variants:Object.keys(cache.base).length,fingerprint:runtimeRockFingerprint(cache.base)};
 }
 return {geometries:cache.base,baseGeometries:cache.base,libraryKey:RUNTIME_ROCK_VERSION+':'+seed+':original',generation:cache.generation,
  features:request.features,timings:{implementation:CARVE_VERSION,baseMs:performance.now()-started,baseCached}};
}

// Surface operations are replaceable here; arrangement consumes only the mesh
// library contract, so a new shaper does not change the fitter or orchestrator.
export function createShapingFeature({carve=fracturedRockLibrary}={}){
 return {
  id:'shaping',
  run(request,result,cache){
   const started=performance.now(),settings=fractureSettings(request.fractures),surfaceKey=JSON.stringify(settings),key=result.libraryKey+':'+surfaceKey;
   const fractureCached=cache.key===key;
   if(!fractureCached){cache.geometries=carve(result.baseGeometries,settings);cache.key=key;}
   return {...result,geometries:cache.geometries,libraryKey:RUNTIME_ROCK_VERSION+':'+result.generation.seed+':'+surfaceKey,
    timings:{...result.timings,fractureMs:performance.now()-started,fractureCached,fractureEnabled:true,shapingEnabled:true}};
  },
  bypass(request,result){
   return {...result,timings:{...result.timings,fractureMs:0,fractureCached:false,fractureEnabled:false,shapingEnabled:false}};
  }
 };
}
