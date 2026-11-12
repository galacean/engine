import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRidgeTarget,ridgePointAt} from './ridge.mjs';

const data=JSON.parse(fs.readFileSync(new URL('./study-data.json',import.meta.url)));
assert.deepEqual(data.scenes.map(s=>s.id),['peaks'],'Only the mountain scene is distributed');
const source=data.scenes[0],before=JSON.stringify(source),peakCounts={},spurCounts={},forkCounts={},signatures=new Set();
assert.equal(source.rocks.length,0,'No baked arrangement is used as a template');
assert(!source.ridge,'The source contains no baked ridge network');
for(let seed=0;seed<200;seed++){
 const plan=createRidgeTarget(source,seed),nodes=new Map(plan.nodes.map(n=>[n.id,n]));
 assert.deepEqual(plan,createRidgeTarget(source,seed),'Exact seeded topology replay');
 const peaks=plan.nodes.filter(n=>n.role==='peak'),saddles=plan.nodes.filter(n=>n.role==='saddle'),tails=plan.nodes.filter(n=>n.role==='tail');
 const primary=plan.nodes.filter(n=>n.primary);assert.equal(primary.length,1);
 assert.equal(primary[0].y,Math.max(...plan.nodes.map(n=>n.y)),'One dominant summit');
 assert(peaks.length>=1&&peaks.length<=5);assert.equal(saddles.length,peaks.length-1);
 for(let i=0;i<peaks.length;i++)for(let j=i+1;j<peaks.length;j++)assert(Math.hypot(peaks[i].position[0]-peaks[j].position[0],peaks[i].position[2]-peaks[j].position[2])>=17,'Summits have room for broad masses');
 const graph=new Map(plan.nodes.map(n=>[n.id,[]]));let edgeCount=0;
 for(const curve of plan.curves){
  for(let i=0;i<curve.knots.length;i++){
   const k=curve.knots[i];assert.deepEqual(k.position,nodes.get(k.id).position,'Shared junctions coincide in XYZ');
   assert.deepEqual(ridgePointAt(curve,k.t),k.position,'Curve passes through each graph node');
   if(i){const a=curve.knots[i-1];assert(k.t>a.t);graph.get(a.id).push(k.id);graph.get(k.id).push(a.id);edgeCount++;}
  }
  for(let i=0;i<=30;i++){
   const p=ridgePointAt(curve,curve.knots.at(-1).t*i/30);
   assert(p.every(Number.isFinite));assert(p[0]>source.extent[0]+8&&p[0]<source.extent[1]-8&&p[2]>source.extent[2]+8&&p[2]<source.extent[3]-8,'Curve stays inside the fitting footprint');
  }
 }
 const seen=new Set(),queue=[primary[0].id];while(queue.length){const id=queue.pop();if(seen.has(id))continue;seen.add(id);queue.push(...graph.get(id));}
 assert.equal(seen.size,nodes.size,'All branches join the same mountain');assert.equal(edgeCount,nodes.size-1,'A connected tree has no hidden crossing connections');
 assert([...graph.values()].some(n=>n.length>=3),'Ridges branch in multiple directions');
 assert.equal(plan.topology.peaks,peaks.length);assert.equal(plan.topology.spurs+plan.topology.forks,tails.length);
 if(peaks.length===1)assert.equal(saddles.length,0,'A single summit does not invent saddle/secondary-peak motifs');
 peakCounts[peaks.length]=(peakCounts[peaks.length]||0)+1;spurCounts[tails.length]=(spurCounts[tails.length]||0)+1;forkCounts[plan.topology.forks]=(forkCounts[plan.topology.forks]||0)+1;
 signatures.add(plan.nodes.map(n=>n.role+':'+graph.get(n.id).length).sort().join('|'));
}
assert.equal(JSON.stringify(source),before,'Runtime generation cannot mutate the source');
assert.equal(Object.keys(peakCounts).length,5,'The seed varies summit count across the entire supported range');
assert(Object.keys(spurCounts).length>=4&&Object.keys(forkCounts).length>=2&&signatures.size>=20,'Topology changes, not just coordinate jitter');
let manualCountCases=0;
for(const seed of [0,42,147,464,465,480,4294967295])for(let peaks=1;peaks<=5;peaks++)for(let branches=3;branches<=8;branches++){
 const plan=createRidgeTarget(source,seed,{seeded:false,peaks,branches});
 assert.equal(plan.nodes.filter(n=>n.role==='peak').length,peaks,'Main peak slider count');
 assert.equal(plan.nodes.filter(n=>n.role==='tail').length,branches,'Side ridge slider includes forks');
 assert.deepEqual(plan,createRidgeTarget(source,seed,{seeded:false,peaks,branches}),'Manual counts replay exactly');manualCountCases++;
}
let crowdedCountCases=0;
for(let seed=0;seed<200;seed++)for(const peaks of [1,5]){
 const plan=createRidgeTarget(source,seed,{seeded:false,peaks,branches:8});
 assert.equal(plan.topology.peaks,peaks,`Crowded main peak count, seed ${seed}`);
 assert.equal(plan.topology.spurs+plan.topology.forks,8,`Crowded side ridge count, seed ${seed}`);crowdedCountCases++;
}
assert.deepEqual(createRidgeTarget(source,480,{seeded:true,peaks:1,branches:3}).nodes,createRidgeTarget(source,480,{seeded:true,peaks:5,branches:8}).nodes,'Automatic counts ignore old slider values');
const result={seeds:200,manualCountCases,crowdedCountCases,peakCounts,spurCounts,forkCounts,distinctDegreeRoleSignatures:signatures.size,
 checks:['mountain-only source with no baked topology','exact deterministic replay','seed-dependent summit and spur counts','seed-dependent connectivity and forks','shared XYZ nodes','finite curves within the footprint','connected acyclic graph','dominant summit and separated secondary peaks','no forced saddle on a single summit','immutable source']};
fs.writeFileSync(new URL('../evidence/mountain-topology-validation.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
