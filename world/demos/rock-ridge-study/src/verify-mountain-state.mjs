import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {perlinSettings} from './perlin-ridges.mjs';
import {fractureSettings} from './rock-surface.mjs';
import {fractureSmoothing} from '../../../../packages/terrain/src/rock-ridge/features/shaping/rock-normals.mjs';
import {ORIGINAL_ROCK_PRESENTATION} from './atomic-rock-material.mjs';
import {mountainCounts} from './mountain-network.mjs';
import {normalizeRockFeatures,RUNTIME_ROCK_VERSION} from './runtime-rocks.mjs';
import {RIDGE_VERSION} from './ridge-utils.mjs';

// Exercise the actual viewer persistence handlers against legacy saved settings
// and the host's post-drag state echo, without replacing WebGL visual checks.
const viewer=fs.readFileSync(new URL('./viewer.fragment.html',import.meta.url),'utf8');
const data=JSON.parse(fs.readFileSync(new URL('./study-data.json',import.meta.url)));
const preset=viewer.match(/const DEMO_PRESET='([^']+)'/)[1];
const field=value=>({get value(){return String(value);},set value(next){value=next;}});
let saved,rebuilds=0,cameraResets=0,normalUpdates=0;
const context={DEMO_PRESET:preset,ORIGINAL_ROCK_PRESENTATION,RIDGE_VERSION,RUNTIME_ROCK_VERSION,normalizeRockFeatures,perlinSettings,fractureSettings,fractureSmoothing,mountainCounts,
 normalInput:field(65),normalLabels:()=>{},updateFractureNormals:()=>normalUpdates++,
 featureInputs:{arrangement:{checked:true},shaping:{checked:true}},
 generatedKey:'',pendingOrbit:null,seededCounts:{checked:true},peakCountInput:field(3),branchCountInput:field(4),countLabels:()=>{},
 viewSelect:field('plan'),seedInput:field(464),heightInput:field(200),modeInput:field('direct'),surfaceInput:field('rocks'),finishInput:field('textured'),guideInput:{checked:false},
 noiseInputs:Object.fromEntries(['frequency','octaves','lacunarity','persistence'].map(k=>[k,field(1)])),
 fractureInputs:Object.fromEntries(['depth','width','irregularity'].map(k=>[k,field(100)])),
 fractureLabels:()=>{},guideGroup:{},labels:{},ridgeLegend:{},render:()=>{},current:null,drag:null,yaw:0,pitch:.5,
 window:{openai:{setWidgetState:state=>{saved=structuredClone(state);return Promise.resolve();}}}};
context.normalAmount=()=>fractureSmoothing(+context.normalInput.value/100);
context.noiseOptions=()=>Object.fromEntries(Object.entries(context.noiseInputs).map(([k,v])=>[k,+v.value]));
context.fractureOptions=()=>fractureSettings(Object.fromEntries(Object.entries(context.fractureInputs).map(([k,v])=>[k,+v.value/100])));
context.authoringKey=()=>JSON.stringify({mode:context.modeInput.value,noise:context.noiseOptions()});
context.fractureKey=()=>JSON.stringify(context.fractureOptions());
context.countOptions=()=>mountainCounts({seeded:context.seededCounts.checked,peaks:+context.peakCountInput.value,branches:+context.branchCountInput.value});
context.countKey=()=>context.seededCounts.checked?'seeded':JSON.stringify(context.countOptions());
context.featureOptions=()=>Object.fromEntries(Object.entries(context.featureInputs).map(([id,input])=>[id,input.checked]));
context.featureKey=()=>JSON.stringify(context.featureOptions());
context.runtimeKey=()=>context.featureKey()+':'+context.seedInput.value+':'+context.countKey();
context.setCamera=()=>{cameraResets++;context.yaw=.58;context.pitch=.52;};
context.createScene=reset=>{rebuilds++;context.generatedKey=context.runtimeKey();context.current={...data.scenes[0],ridge:{}};if(reset)context.setCamera();};
vm.createContext(context);
vm.runInContext(viewer.slice(viewer.indexOf(' function save()'),viewer.indexOf(' function queueScene(')),context);
const legacy={modelContent:{demoPreset:'island-425-fractures-145-v1',arrangement:'island',view:'side',seed:464,heightPercent:200,
 ridgeMode:'direct',noise:{frequency:4,octaves:5,lacunarity:2,persistence:.85},surface:'rocks',rockFinish:'textured',surfacePresentation:ORIGINAL_ROCK_PRESENTATION,
 fractures:{depth:1.4,width:1.6,irregularity:1.8},showLayout:true},privateContent:{yaw:1.23,pitch:.71}};
assert(context.restoreState(legacy));assert.equal(context.current.id,'peaks');
assert.equal(context.seedInput.value,'464');assert.equal(context.heightInput.value,'200');
assert.equal(context.viewSelect.value,'side');assert.equal(context.finishInput.value,'textured');
assert.deepEqual(context.fractureOptions(),legacy.modelContent.fractures);assert.deepEqual(context.noiseOptions(),legacy.modelContent.noise);
assert.equal(context.yaw,1.23);assert.equal(context.pitch,.71);
context.save();assert.equal(saved.modelContent.arrangement,'peaks');assert.equal(saved.modelContent.demoPreset,preset);
context.yaw=2.1;context.pitch=.4;context.save();
const before=[rebuilds,cameraResets];assert(context.restoreState(saved));
assert.deepEqual([rebuilds,cameraResets],before,'A state echo must not rebuild or reset the camera');
assert.equal(context.yaw,2.1);assert.equal(context.pitch,.4);
const reseeded=structuredClone(saved);reseeded.modelContent.seed=465;context.restoreState(reseeded);
assert.equal(rebuilds,before[0]+1);assert.equal(cameraResets,before[1],'Changing a seed preserves the orbit');
const manual=structuredClone(saved);manual.modelContent.topology={seeded:false,peaks:3,branches:4};context.restoreState(manual);context.save();assert.deepEqual(saved.modelContent.topology,manual.modelContent.topology);
assert(!viewer.includes('rock-study-case'),'The arrangement picker is removed');
console.log('Mountain state: legacy migration, parameter retention, seed rebuild and orbit echo passed');

// Independent feature switches persist without overwriting their parameters.
const disabled=structuredClone(saved);disabled.modelContent.features={arrangement:false,shaping:false};
context.restoreState(disabled);context.save();assert.deepEqual(saved.modelContent.features,disabled.modelContent.features);
assert.deepEqual(saved.modelContent.fractures,disabled.modelContent.fractures);
assert.deepEqual(saved.modelContent.topology,disabled.modelContent.topology);
const disabledEcho=[rebuilds,cameraResets];context.restoreState(saved);assert.deepEqual([rebuilds,cameraResets],disabledEcho);
const oldOriginal=structuredClone(legacy);oldOriginal.modelContent.rockFinish='original';context.restoreState(oldOriginal);context.save();
assert.equal(saved.modelContent.features.shaping,false);assert.equal(saved.modelContent.features.arrangement,true);assert.equal(saved.modelContent.rockFinish,'clay');
console.log('Feature state: independent switches, parameter retention, legacy original migration and orbit echo passed');

// Normal-only edits update buffers without rebuilding geometry or resetting orbit.
const smoothState=structuredClone(saved);smoothState.modelContent.fractureSmoothing=.85;
const beforeNormals=[rebuilds,cameraResets,normalUpdates];
context.restoreState(smoothState);context.save();
assert.equal(saved.modelContent.fractureSmoothing,.85);
assert.deepEqual([rebuilds,cameraResets],beforeNormals.slice(0,2));
assert.equal(normalUpdates,beforeNormals[2]+1);
assert.deepEqual(saved.privateContent,smoothState.privateContent);
context.restoreState(saved);assert.equal(normalUpdates,beforeNormals[2]+1);
console.log('Fracture normals: persisted smoothing changes only normal buffers, preserving geometry and orbit');
