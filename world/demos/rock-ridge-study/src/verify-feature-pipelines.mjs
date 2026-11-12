import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {buildAtomicKernel} from '../atomic-controls/kernel-bundle.mjs';
import {createRuntimeMountainBuilder,createShapingFeature,createArrangementFeature,normalizeRockFeatures} from './runtime-rocks.mjs';
import {fracturedRockLibrary} from './rock-surface.mjs';
import {generateRidgeScene} from './ridge.mjs';

const source=JSON.parse(fs.readFileSync(new URL('./study-data.json',import.meta.url))).scenes[0];
const kernel=Function(buildAtomicKernel()+';return atomicRockKernel();')();await kernel.ready;
const calls={atoms:0,carve:0,arrange:0};
const countedKernel={buildRock(parameters){calls.atoms++;return kernel.buildRock(parameters);},simplifyRock:(...args)=>kernel.simplifyRock(...args)};
const stages=[createShapingFeature({carve(...args){calls.carve++;return fracturedRockLibrary(...args);}}),
 createArrangementFeature({arrange(...args){calls.arrange++;return generateRidgeScene(...args);}})];
const build=createRuntimeMountainBuilder({stages}),cache={};
const request={source,seed:482,mode:'perlin',noise:{frequency:4,octaves:5,lacunarity:2,persistence:.85},
 topology:{seeded:false,peaks:5,branches:8},fractures:{depth:1.3,width:1.6,irregularity:1.8}};
const run=(features,changes={})=>build(countedKernel,{...request,...changes,...(features?{features}:{})},cache);
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Recorded from the complete pre-refactor build at commit 52a7aef2408a82803ccc8a8d72c351bde48ee326.
// Include full mesh metadata and complete scene, not only a sampled silhouette.
const baseline={base:'84122e44c0c2d882b0fb49be71fcb5cf59c3aaa096eda4ebebfd5a9bca68bc65',
 geometries:'ffcd2cbfb2066e14534792c380d9e7bd047983c16909bbe4fee473aeea61f7fb',
 scene:'54d662284a97f614c1228b8f08a46c1e3c83f736ec83f0576f760dea14801192'};
const defaultBuild=run();
assert.equal(digest(defaultBuild.baseGeometries),baseline.base,'Default atomic generation is unchanged');
assert.equal(digest(defaultBuild.geometries),baseline.geometries,'Default cuts, face tags and mesh arrays are unchanged');
assert.equal(digest(defaultBuild.scene),baseline.scene,'Default mountain placements and ridge fit are unchanged');
assert.deepEqual(calls,{atoms:8,carve:1,arrange:1});

const neither=run({arrangement:false,shaping:false});
assert.equal(neither.geometries,defaultBuild.baseGeometries);
assert.equal(neither.scene.rocks.length,8);assert(!neither.scene.ridge,'Inspection skips ridge generation entirely');
assert.deepEqual(calls,{atoms:8,carve:1,arrange:1},'Disabling both skips both feature algorithms');
assert.equal(neither.timings.fractureEnabled,false);assert.equal(neither.timings.arrangementEnabled,false);

const arrangedOnly=run({arrangement:true,shaping:false});
assert.equal(arrangedOnly.geometries,defaultBuild.baseGeometries);
assert(arrangedOnly.scene.ridge);assert.equal(calls.carve,1);assert.equal(calls.arrange,2);
const shapedOnly=run({arrangement:false,shaping:true});
assert.equal(shapedOnly.geometries,defaultBuild.geometries);
assert.equal(shapedOnly.scene.rocks.length,8);assert(!shapedOnly.scene.ridge);
assert.equal(calls.carve,1);assert.equal(calls.arrange,2);
const both=run({arrangement:true,shaping:true});
assert.equal(both.geometries,defaultBuild.geometries);assert.equal(both.scene,defaultBuild.scene);
assert.deepEqual(calls,{atoms:8,carve:1,arrange:2},'Toggle round trips reuse both independent feature caches');
const workerReplay=build(countedKernel,structuredClone({...request,features:{arrangement:true,shaping:true}}),cache);
assert.equal(workerReplay.scene,defaultBuild.scene,'Worker message cloning preserves arrangement cache keys');
assert.deepEqual(calls,{atoms:8,carve:1,arrange:2});

const changedFractures={depth:.8,width:1.1,irregularity:1.2};
const disabledCarving=run({arrangement:true,shaping:false},{fractures:changedFractures});
assert.equal(disabledCarving.scene,arrangedOnly.scene,'Inactive shaping edits do not invalidate arrangement');
assert.deepEqual(calls,{atoms:8,carve:1,arrange:2});
const disabledArrangement=run({arrangement:false,shaping:true},{noise:{...request.noise,frequency:2},topology:{seeded:true}});
assert.equal(disabledArrangement.geometries,defaultBuild.geometries);
assert.deepEqual(calls,{atoms:8,carve:1,arrange:2},'Inactive arrangement edits do not invoke either feature');
const reshaped=run({arrangement:false,shaping:true},{fractures:changedFractures});
assert.notEqual(reshaped.geometries,defaultBuild.geometries);
assert.equal(reshaped.baseGeometries,defaultBuild.baseGeometries);
assert.deepEqual(calls,{atoms:8,carve:2,arrange:2},'Carving settings only rerun shaping in inspection mode');
const reseeded=run({arrangement:false,shaping:false},{seed:483});
assert.notEqual(reseeded.generation.fingerprint,defaultBuild.generation.fingerprint);
assert.deepEqual(calls,{atoms:16,carve:2,arrange:2},'Seed changes regenerate atoms without enabling disabled features');

assert.deepEqual(normalizeRockFeatures(),{arrangement:true,shaping:true});
assert.deepEqual(normalizeRockFeatures(undefined,true),{arrangement:true,shaping:false},'Legacy Original clay disables shaping');
assert.equal(normalizeRockFeatures({arrangement:true,shaping:true},true).shaping,true,'Explicit toggles supersede legacy presentation state');

// Prove a new feature can execute and be bypassed without modifying the runtime coordinator.
const extensionCalls=[];
const extension={id:'diagnostic',run(request,result){extensionCalls.push('run');return {...result,diagnostic:true};},
 bypass(request,result){extensionCalls.push('bypass');return {...result,diagnostic:false};}};
const extended=createRuntimeMountainBuilder({stages:[...stages,extension]});
const extensionCache={};
const extendedRequest={...request,features:{arrangement:false,shaping:false,diagnostic:true}};
assert.equal(extended(countedKernel,extendedRequest,extensionCache).diagnostic,true);
assert.equal(extended(countedKernel,{...extendedRequest,features:{...extendedRequest.features,diagnostic:false}},extensionCache).diagnostic,false);
assert.deepEqual(extensionCalls,['run','bypass']);

console.log(JSON.stringify({cases:4,baselineCommit:'52a7aef2408a82803ccc8a8d72c351bde48ee326',baseline,
 checks:['all four feature combinations','exact default geometry and complete scene parity','independent disabled feature bypass',
 'toggle cache retention','inactive parameter edits skip work','active fracture edits invalidate only shaping',
 'seed invalidation','legacy state compatibility','registered extension without coordinator edits']},null,2));
