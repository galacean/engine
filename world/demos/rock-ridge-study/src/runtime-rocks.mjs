import {normalizeRockFeatures} from './features/settings.mjs';
import {createFeaturePipeline} from './features/pipeline.mjs';
import {runtimeAtomicSource,createShapingFeature} from './features/shaping/index.mjs';
import {createArrangementFeature} from './features/arrangement/index.mjs';

// Stable public entry point for the worker, demo and existing consumers.
// Each feature owns its algorithms and cache. New operations/strategies register
// through these factories without adding branches to the runtime coordinator.
export {RUNTIME_ROCK_VERSION,RUNTIME_ROCK_SLOTS,runtimeRockRecipes,generateRuntimeRocks,runtimeRockFingerprint} from './features/shaping/atomic-rocks.mjs';
export {normalizeRockFeatures} from './features/settings.mjs';
export {createFeaturePipeline} from './features/pipeline.mjs';
export {runtimeAtomicSource,createShapingFeature} from './features/shaping/index.mjs';
export {createArrangementFeature,createRockLibraryScene} from './features/arrangement/index.mjs';

export function createRuntimeMountainBuilder({source=runtimeAtomicSource,stages=[createShapingFeature(),createArrangementFeature()]}={}){
 const build=createFeaturePipeline(source,stages);
 return (kernel,request,cache={})=>build(kernel,{...request,features:normalizeRockFeatures(request.features,request.original)},cache);
}

// Shared composition; worker and Node verification execute the same pipeline.
export const buildRuntimeMountain=createRuntimeMountainBuilder();
