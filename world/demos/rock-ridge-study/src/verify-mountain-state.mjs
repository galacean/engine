import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {perlinSettings} from './perlin-ridges.mjs';
import {fractureSettings} from './rock-surface.mjs';
import {ORIGINAL_ROCK_PRESENTATION} from './atomic-rock-material.mjs';
import {RIDGE_VERSION} from './ridge-utils.mjs';

// Exercise the actual viewer persistence handlers against legacy saved settings
// and the host's post-drag state echo, without replacing WebGL visual checks.
const viewer=fs.readFileSync(new URL('./viewer.fragment.html',import.meta.url),'utf8');
const data=JSON.parse(fs.readFileSync(new URL('./study-data.json',import.meta.url)));
const preset=viewer.match(/const DEMO_PRESET='([^']+)'/)[1];
const field=value=>({get value(){return String(value);},set value(next){value=next;}});
let saved,rebuilds=0,cameraResets=0;
const context={DEMO_PRESET:preset,ORIGINAL_ROCK_PRESENTATION,RIDGE_VERSION,perlinSettings,fractureSettings,
 viewSelect:field('plan'),seedInput:field(464),heightInput:field(200),modeInput:field('direct'),surfaceInput:field('rocks'),finishInput:field('textured'),guideInput:{checked:false},
 noiseInputs:Object.fromEntries(['frequency','octaves','lacunarity','persistence'].map(k=>[k,field(1)])),
 fractureInputs:Object.fromEntries(['depth','width','irregularity'].map(k=>[k,field(100)])),
 fractureLabels:()=>{},guideGroup:{},labels:{},ridgeLegend:{},render:()=>{},current:null,drag:null,yaw:0,pitch:.5,
 window:{openai:{setWidgetState:state=>{saved=structuredClone(state);return Promise.resolve();}}}};
context.noiseOptions=()=>Object.fromEntries(Object.entries(context.noiseInputs).map(([k,v])=>[k,+v.value]));
context.fractureOptions=()=>fractureSettings(Object.fromEntries(Object.entries(context.fractureInputs).map(([k,v])=>[k,+v.value/100])));
context.authoringKey=()=>JSON.stringify({mode:context.modeInput.value,noise:context.noiseOptions()});
context.fractureKey=()=>JSON.stringify(context.fractureOptions());
context.setCamera=()=>{cameraResets++;context.yaw=.58;context.pitch=.52;};
context.createScene=reset=>{rebuilds++;context.current={...data.scenes[0],ridge:{}};if(reset)context.setCamera();};
vm.createContext(context);
vm.runInContext(viewer.slice(viewer.indexOf(' function save()'),viewer.indexOf(' let sceneTimer;')),context);
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
assert(!viewer.includes('rock-study-case'),'The arrangement picker is removed');
console.log('Mountain state: legacy migration, parameter retention, seed rebuild and orbit echo passed');
