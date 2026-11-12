import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildAtomicKernel} from '../atomic-controls/kernel-bundle.mjs';
import {generateRuntimeRocks} from './runtime-rocks.mjs';
import {fractureRockGeometry,creasedRockAttributes} from './rock-surface.mjs';
import {fractureRockGeometryBefore,creasedRockAttributesBefore} from './fixtures/fracture-before.mjs';

const kernel=Function(buildAtomicKernel()+';return atomicRockKernel();')();await kernel.ready;
const fixtures=JSON.parse(fs.readFileSync(new URL('geometry.json',import.meta.url))).geometries;
const current={depth:1.3,width:1.6,irregularity:1.8},cases=[];
function check(label,source,settings,render=false){
 const before=fractureRockGeometryBefore(source,settings),after=fractureRockGeometry(source,settings);
 assert.deepEqual(after,before,label+': all geometry, planes, paths and surface attributes remain exact');
 if(render)assert.deepEqual(creasedRockAttributes(after),creasedRockAttributesBefore(before),label+': rendered sharp normals remain exact');
 cases.push({label,settings,triangles:after.indices.length/3,renderCompared:render});
}
for(const [name,g] of Object.entries(fixtures))check('historical:'+name,g,{depth:1,width:1,irregularity:1});
let selected;
for(const seed of [0,480,481,482,4294967295]){
 const base=generateRuntimeRocks(kernel,seed);if(seed===482)selected=base;
 for(const [name,g] of Object.entries(base))check('runtime:'+seed+':'+name,g,current,seed===482);
 console.log('Exact runtime parity:',seed);
}
const controls=[{depth:0,width:1,irregularity:1},{depth:1,width:0,irregularity:1},
 {depth:.1,width:.1,irregularity:0},{depth:.1,width:2,irregularity:2},
 {depth:2,width:.1,irregularity:0},{depth:2,width:2,irregularity:2}];
for(const [name,g] of [['peak',selected.peak],['cliff',selected.cliff],['flat slab',fixtures.slab]])
 for(const settings of controls)check('boundary:'+name,g,settings);
const hash=file=>createHash('sha256').update(fs.readFileSync(new URL(file,import.meta.url))).digest('hex');
const result={referenceCommit:'1326a3fd56cab7013381ed3a168f7e3c1f159b2f',cases:cases.length,
 currentCarverSha256:hash('solid-carve.mjs'),referenceCarverSha256:hash('fixtures/solid-carve-before.mjs'),
 checks:['exact positions and triangle indices','exact mesh connectivity','exact source and cutter face tags','exact normals and per-vertex attributes','exact irregular vertical cutter paths','exact rendered crease normals on seed 482','disabled controls, straight paths, narrow and maximum cuts'],samples:cases};
fs.writeFileSync(new URL('../evidence/carve-optimization-parity.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log('Exact before/after parity passed:',cases.length,'meshes');
