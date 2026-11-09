import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createPerlinSource,extractPerlinRidgeTarget,perlinLayers,perlinSettings} from './perlin-ridges.mjs';
import {generateRidgeScene,assembleRidgeTarget,createRidgeField,ridgePointAt,createSurfaceSampler,transformedVertices,withSceneHeight} from './ridge.mjs';

const data=JSON.parse(fs.readFileSync(new URL('./study-data.json',import.meta.url)));
const fixtures=JSON.parse(fs.readFileSync(new URL('../evidence/perlin-lab-fixtures.json',import.meta.url)));
const sources=data.scenes.filter(s=>['cliff','island','peaks'].includes(s.id)),seeds=[0,18,42,382,4294967295],results=[];
const near=(a,b,tolerance,message)=>assert(Math.abs(a-b)<=tolerance,`${message}: ${a} vs ${b}`);
for(const f of fixtures.samples)near(perlinLayers(f.seed,f.settings).sample(...f.point),f.value,1e-14,'Port agrees with actual lab generator');
for(const options of [{frequency:0},{frequency:5},{octaves:1.5},{octaves:9},{lacunarity:0},{persistence:NaN},{persistence:-1}])assert.throws(()=>perlinSettings(options),RangeError);

// This ray-parity check is independent of the fitter's binned interval routine.
function inside(point,vertices,indices){
 const hits=[];
 for(let i=0;i<indices.length;i+=3){
  const [a,b,c]=indices.slice(i,i+3).map(k=>vertices[k]),x=point[0],z=point[2],d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
  if(Math.abs(d)<1e-9)continue;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;
  if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7){const y=u*a[1]+v*b[1]+(1-u-v)*c[1];if(y>point[1]+1e-6)hits.push(y);}
 }
 hits.sort((a,b)=>a-b);return hits.filter((y,i)=>!i||y-hits[i-1]>1e-5).length%2===1;
}
function reachable(links,start){const visited=new Set(),queue=[start];while(queue.length){const id=queue.pop();if(visited.has(id))continue;visited.add(id);queue.push(...links.get(id));}return visited.size;}

function checkPlan(source,seed,settings={}){
 const plan=extractPerlinRidgeTarget(source,seed,settings),field=createPerlinSource(source,seed,settings);
 assert.deepEqual(plan,extractPerlinRidgeTarget({...source,rocks:[{invalid:'no mesh access'}],guides:[],ridge:null},seed,settings));
 assert(plan.sourceField.positions.every(Number.isFinite),'Finite source field');
 assert(plan.sourceField.detailOffsets.every(v=>Math.abs(v)<=1.2),'Bounded fine detail');
 assert.equal(plan.curves.length,plan.nodes.length-1,'Simplification retains a tree');
 assert(plan.extraction.selectedPeaks<=4,'Major peak budget');
 const graph=new Map(plan.nodes.map(n=>[n.id,[]]));
 for(const node of plan.nodes){
  assert.deepEqual(node.position,field.positions[node.sourceCell],'Every shared node comes from the coarse field');
  assert(field.valid[node.sourceCell]);
  if(node.role==='peak')assert(field.neighbors[node.sourceCell].filter(k=>field.valid[k]).every(k=>field.positions[k][1]<=node.y),'Real field maximum');
 }
 const crown=plan.nodes.find(n=>n.primary);
 near(crown.y,Math.max(...field.positions.filter((_,i)=>field.valid[i]).map(p=>p[1])),1e-9,'Dominant field maximum');
 for(const edge of plan.curves){
  const [a,b]=edge.knots;graph.get(a.id).push(b.id);graph.get(b.id).push(a.id);
  for(const k of edge.knots){assert.deepEqual(k.position,plan.nodes.find(n=>n.id===k.id).position);assert.deepEqual(ridgePointAt(edge,k.t),k.position);}
  for(let i=1;i<edge.path.length-1;i++){
   const k=edge.path[i],eps=.00001,l=ridgePointAt(edge,k.t-eps),r=ridgePointAt(edge,k.t+eps);
   for(let d=0;d<3;d++)near((k.position[d]-l[d])/eps,(r[d]-k.position[d])/eps,.002,'C1 continuity at simplified bends');
  }
  const low=Math.min(a.y,b.y),high=Math.max(a.y,b.y);
  for(let i=0;i<=40;i++){const p=ridgePointAt(edge,b.t*i/40);assert(p.every(Number.isFinite));assert(p[1]>=low-1e-8&&p[1]<=high+1e-8,'No artificial intermediate extrema');}
  for(const cell of edge.sourceCells)assert(field.valid[cell],'Trace stays inside the mask');
 }
 assert.equal(reachable(graph,crown.id),plan.nodes.length,'Connected shared XYZ network');
 assert([...graph.values()].some(v=>v.length>=3),'Multiple ridge directions meet');
 // Extents alone cannot prove a 3D graph; measure a nonzero scalar triple product.
 const vectors=plan.nodes.map(n=>n.position.map((v,d)=>v-crown.position[d]));let volume=0;
 for(const a of vectors)for(const b of vectors)for(const c of vectors)volume=Math.max(volume,Math.abs(a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0])));
 assert(volume>20,'Network is not confined to one fitting plane');
 return plan;
}

for(const source of sources)for(const seed of seeds){
 const plan=checkPlan(source,seed),before=JSON.stringify(plan),scene=assembleRidgeTarget(source,data.geometries,plan);
 assert.equal(JSON.stringify(plan),before,'Fitter leaves the input field and network immutable');
 const sample=createSurfaceSampler(scene,data.geometries),ground=createSurfaceSampler(source,{},true),errors=[];
 for(const curve of plan.curves){
  const count=Math.ceil(curve.knots.at(-1).t/.15);
  for(let i=0;i<=count;i++){const p=ridgePointAt(curve,curve.knots.at(-1).t*i/count);errors.push(sample(p[0],p[2])-p[1]);}
 }
 let guideError=0;
 for(const guide of scene.guides.filter(g=>g.kind==='spine'))for(const p of guide.points)guideError=Math.max(guideError,Math.abs(sample(p[0],p[2])-p[1]+.08));
 assert(guideError<.015,'Orange comparison is the actual displayed mesh surface');
 const rms=Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length),maximum=Math.max(...errors.map(Math.abs)),band=scene.ridge.policy.curveToleranceM;
 assert(rms<band*1.25&&maximum<band*3.2,`${source.id}/${seed}: broad-mass residual ${rms}/${maximum}`);
 const structural=scene.rocks.filter(r=>r.role!=='small accent'),small=scene.rocks.filter(r=>r.role==='small accent');
 assert(structural.length<=30&&structural.every(r=>r.massLengthM>=12));assert(small.length<=2);
 const contactGraph=new Map(scene.rocks.map(r=>[r.id,[]])),vertices=new Map();
 for(const r of scene.rocks){
  const vv=transformedVertices(r,data.geometries[r.mesh]);vertices.set(r.id,vv);
  assert(vv.flat().every(Number.isFinite));
  for(const p of vv){assert(p[0]>source.extent[0]&&p[0]<source.extent[1]&&p[2]>source.extent[2]&&p[2]<source.extent[3]);if(source.id==='island')assert(ground(p[0],p[2])>=0,'Shoreline containment');}
  if(r.role==='small accent')assert(Math.max(...vv.map(p=>p[1]))-Math.min(...vv.map(p=>p[1]))<=3.000001);
 }
 for(const edge of scene.ridge.composition.contactEdges){
  const rocks=[edge.a,edge.b].map(id=>scene.rocks.find(r=>r.id===id));
  assert(edge.witnesses.filter(w=>rocks.every(r=>inside(w.position,vertices.get(r.id),data.geometries[r.mesh].indices))).length>=2,'Independent solid overlap witnesses');
  contactGraph.get(edge.a).push(edge.b);contactGraph.get(edge.b).push(edge.a);
 }
 assert.equal(reachable(contactGraph,scene.rocks[0].id),scene.rocks.length);
 if(seed===18){
  assert.deepEqual(scene,generateRidgeScene(source,data.geometries,seed,{mode:'perlin'}),'Exact assembly replay');
  for(const factor of [.25,1.3,2]){
   const changed=withSceneHeight(scene,factor);
   for(let i=0;i<plan.curves.length;i++)for(let j=0;j<=10;j++){
    const t=plan.curves[i].knots.at(-1).t*j/10,a=ridgePointAt(plan.curves[i],t),b=ridgePointAt(changed.ridge.plan.curves[i],t);
    for(let d=0;d<3;d++)near(b[d],a[d]*(d===1?factor:1),1e-8,'Height scales the continuous curve, including bends');
   }
   plan.sourceField.positions.forEach((v,i)=>near(changed.ridge.plan.sourceField.positions[i],v*(i%3===1?factor:1),1e-8,'Height scales source field'));
   plan.extraction.passes.forEach((p,i)=>near(changed.ridge.plan.extraction.passes[i].y,p.y*factor,1e-8,'Height scales source pass metadata'));
   for(const r of changed.rocks){const original=vertices.get(r.id),vv=transformedVertices(r,data.geometries[r.mesh]);vv.forEach((p,i)=>p.forEach((v,d)=>near(v,original[i][d]*(d===1?factor:1),1e-8,'Height scales all rock vertices')));}
  }
 }
 results.push({scene:source.id,seed,selectedPeaks:plan.extraction.selectedPeaks,curves:plan.curves.length,structuralMasses:structural.length,smallRocks:small.length,verifiedContactEdges:scene.ridge.composition.contactEdges.length,rmsM:rms,maximumDeviationM:maximum,maximumGuideErrorM:guideError});
}

const mountain=sources.find(s=>s.id==='peaks'),base=checkPlan(mountain,18,{frequency:4,octaves:1}),fine=checkPlan(mountain,18,{frequency:4,octaves:8,persistence:.8});
assert.deepEqual(base.nodes,fine.nodes);assert.deepEqual(base.curves,fine.curves);assert.deepEqual(base.sourceField.positions,fine.sourceField.positions);
assert.notDeepEqual(base.sourceField.detailOffsets,fine.sourceField.detailOffsets,'Fine octaves affect the source preview');
const baseField=createRidgeField(mountain,base),fineField=createRidgeField(mountain,fine);let detailResponse=0;
for(let x=-35;x<=35;x+=3)for(let z=-25;z<=25;z+=3)detailResponse=Math.max(detailResponse,Math.abs(baseField.sample(x,z)-fineField.sample(x,z)));
assert(detailResponse>.03&&detailResponse<1.2,'Fine noise reaches the fitting envelope without altering the graph');
const broadA=checkPlan(mountain,18,{frequency:2,octaves:1}),broadB=checkPlan(mountain,18,{frequency:2,octaves:2});
assert.notDeepEqual(broadA.nodes,broadB.nodes,'Adding a structural octave changes the ridge');
for(const settings of [{frequency:1,octaves:1},{frequency:2,octaves:8,lacunarity:1.5,persistence:.8},{frequency:4,octaves:8,lacunarity:1,persistence:1},{frequency:4,octaves:8,lacunarity:3,persistence:0}]){
 const plan=checkPlan(mountain,18,settings),scene=assembleRidgeTarget(mountain,data.geometries,plan);
 assert.equal(scene.ridge.composition.components,1);assert(scene.ridge.composition.smallRocks<=2);assert(scene.ridge.composition.structuralMasses<=30);assert(scene.rocks.every(r=>r.role==='small accent'||r.massLengthM>=12));
}
assert.notDeepEqual(checkPlan(mountain,18,{frequency:2,lacunarity:1.5}).nodes,checkPlan(mountain,18,{frequency:2,lacunarity:2}).nodes);
assert.notDeepEqual(checkPlan(mountain,18,{frequency:2,persistence:0}).nodes,checkPlan(mountain,18,{frequency:2,persistence:1}).nodes);
const bridge=generateRidgeScene(sources.find(s=>s.id==='cliff'),data.geometries,19,{mode:'perlin'}),bridgeSurface=createSurfaceSampler(bridge,data.geometries),bridgeErrors=[];
for(const curve of bridge.ridge.plan.curves)for(let t=0;t<=curve.knots.at(-1).t;t+=.15){const p=ridgePointAt(curve,t);bridgeErrors.push(bridgeSurface(p[0],p[2])-p[1]);}
const longEdgeRegression={scene:'cliff',seed:19,rmsM:Math.sqrt(bridgeErrors.reduce((s,e)=>s+e*e,0)/bridgeErrors.length),maximumDeviationM:Math.max(...bridgeErrors.map(Math.abs))};
assert(longEdgeRegression.rmsM<1.5&&longEdgeRegression.maximumDeviationM<4,'Large masses must reach the far end of long cliff connections');
const output={version:'perlin-ridge-extraction-1',noiseFixtureSamples:fixtures.samples.length,assemblies:results.length,controlExtremeAssemblies:4,longEdgeRegression,detailEnvelopeResponseM:detailResponse,checks:['actual lab noise parity','deterministic graph independent of atoms','field-derived maxima and shared nodes','connected noncoplanar tree','monotone C1 simplified curves','fine octaves do not create ridge nodes','coarse octaves and controls alter the network','fine detail reaches fitting envelope','finite bounds and shoreline containment','sparse accents and broad structural scale','independently ray-verified solid contact','unchanged target during fitting','dense actual-surface residuals','exact full assembly replay','height scales fields, curves and masses','long cliff edges grow connected large masses'],results};
fs.writeFileSync(new URL('../evidence/perlin-validation.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({checks:output.checks.length,assemblies:results.length+5,noiseFixtures:fixtures.samples.length,maxRmsM:Math.max(...results.map(r=>r.rmsM)),maximumDeviationM:Math.max(...results.map(r=>r.maximumDeviationM)),detailEnvelopeResponseM:detailResponse,longEdgeRegression},null,2));
