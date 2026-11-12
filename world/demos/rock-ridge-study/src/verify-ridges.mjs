import fs from 'node:fs';
import assert from 'node:assert/strict';
import {RIDGE_VERSION,generateRidgeScene,createRidgeTarget,assembleRidgeTarget,createRidgeField,ridgePointAt,createSurfaceSampler,transformedVertices,withSceneHeight} from './ridge.mjs';
const data=JSON.parse(fs.readFileSync(new URL('./study-data.json',import.meta.url)));
const seeds=[0,42,334,382,464,465,4294967295],results=[];
function insideMesh(point,vertices,indices){
 const heights=[];
 for(let i=0;i<indices.length;i+=3){
  const a=vertices[indices[i]],b=vertices[indices[i+1]],c=vertices[indices[i+2]],x=point[0],z=point[2];
  const d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-9)continue;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;
  if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7){const y=u*a[1]+v*b[1]+(1-u-v)*c[1];if(y>point[1]+1e-6)heights.push(y);}
 }
 heights.sort((a,b)=>a-b);return heights.filter((v,i)=>!i||v-heights[i-1]>1e-5).length%2===1;
}
const near=(a,b,e,message)=>assert(Math.abs(a-b)<=e,`${message}: ${a} versus ${b}`);
const norm=a=>Math.hypot(...a),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const det=(a,b,c)=>a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
for(const source of data.scenes){
 let previous;
 for(const seed of seeds){
  const started=performance.now(),plan=createRidgeTarget(source,seed),before=JSON.stringify(plan),sourceBefore=JSON.stringify(source);
  assert.deepEqual(plan,createRidgeTarget({...source,rocks:[{invalid:'geometry'}],guides:[],ridge:null},seed),'The network must exist independently of the atoms');
  assert(plan.curves.length>=3,'Need a connected network with multiple directions');
  const graph=new Map(plan.nodes.map(n=>[n.id,new Set()]));
  for(const curve of plan.curves){
   for(let i=0;i<curve.knots.length;i++){
    const k=curve.knots[i],node=plan.nodes.find(n=>n.id===k.id);
    assert.deepEqual(k.position,node.position,'Shared junction coordinates must match exactly');
    assert.deepEqual(ridgePointAt(curve,k.t),k.position,'Every curve interpolates its graph nodes');
    if(i){graph.get(k.id).add(curve.knots[i-1].id);graph.get(curve.knots[i-1].id).add(k.id);}
    if(i>0&&i<curve.knots.length-1){
     const eps=.0001,a=ridgePointAt(curve,k.t-eps),b=k.position,c=ridgePointAt(curve,k.t+eps);
     for(let d=0;d<3;d++)near((b[d]-a[d])/eps,(c[d]-b[d])/eps,.005,'Each XYZ curve has a continuous tangent');
     near((c[1]-a[1])/(2*eps),0,.005,'Height derivative vanishes at extrema');
     const y=[ridgePointAt(curve,k.t-.03)[1],ridgePointAt(curve,k.t+.03)[1]];
     assert(k.role==='peak'?y.every(v=>v<k.y):k.role==='saddle'?y.every(v=>v>k.y):y[0]>k.y&&y[1]<k.y,`True peak/saddle extrema: ${source.id}/${seed}/${k.id}`);
    }
   }
  }
  const reached=new Set(),queue=[plan.nodes[0].id];while(queue.length){const id=queue.pop();if(reached.has(id))continue;reached.add(id);queue.push(...graph.get(id));}
  assert.equal(reached.size,plan.nodes.length,'All ridge branches must be connected');
  assert([...graph.values()].some(n=>n.size>=3),'At least one real branching junction is required');
  const crown=plan.nodes.find(n=>n.primary),vectors=plan.nodes.map(n=>sub(n.position,crown.position));
  let nonPlanarity=0;for(const a of vectors)for(const b of vectors)for(const c of vectors)nonPlanarity=Math.max(nonPlanarity,Math.abs(det(a,b,c)));
  assert(nonPlanarity>200,'The ridge network must not lie in a single vertical fitting plane');
  const scene=assembleRidgeTarget(source,data.geometries,plan);
  assert.equal(JSON.stringify(plan),before,'Fitting may not move the target ridges');
  assert.equal(JSON.stringify(source),sourceBefore,'Fitting may not mutate the source scene');
  assert.deepEqual(scene,generateRidgeScene(source,data.geometries,seed),'Same seed must reproduce the complete network and assembly');
  if(previous)assert.notDeepEqual(scene.rocks,previous,'Different seeds must change the arrangement');previous=scene.rocks;
  const sample=createSurfaceSampler(scene,data.geometries),ground=createSurfaceSampler(scene,data.geometries,true),allErrors=[];
  let maximum=-Infinity,crestError=0;
  for(const rock of scene.rocks){
   assert([rock.x,rock.y,rock.z,rock.yaw,rock.scale,rock.longitudinalScale,rock.lateralScale,rock.verticalScale].every(Number.isFinite));
   assert([rock.scale,rock.longitudinalScale,rock.lateralScale,rock.verticalScale].every(v=>v>0));
   for(const p of transformedVertices(rock,data.geometries[rock.mesh])){
    maximum=Math.max(maximum,p[1]);
    assert(p[0]>source.extent[0]&&p[0]<source.extent[1]&&p[2]>source.extent[2]&&p[2]<source.extent[3],'Actual mesh bounds stay in the scene');
    if(source.id==='island')assert(ground(p[0],p[2])>=0,'Actual island mesh remains inside the shoreline');
   }
  }
  near(maximum,scene.ridge.primary.position[1],.0001,'Measured maximum agrees with actual atom vertices');
  assert(maximum<=Math.max(...plan.nodes.map(n=>n.y))+scene.ridge.policy.curveToleranceM+.0001,'Global summit remains inside the allowed height band');
  const curveResults=[];
  for(const curve of plan.curves){
   const target=scene.guides.find(g=>g.kind==='target'&&g.curveId===curve.id),measured=scene.guides.find(g=>g.kind==='spine'&&g.curveId===curve.id);
   assert(target&&measured,'Every branch needs both target and measured surface guides');
   for(let i=0;i<measured.points.length;i++){
    const p=measured.points[i];crestError=Math.max(crestError,Math.abs(p[1]-measured.liftM-sample(p[0],p[2])));
    near(p[0],target.points[i][0],.0001,'Comparison guides share X');near(p[2],target.points[i][2],.0001,'Comparison guides share Z');
   }
   const errors=[],start=curve.knots[0].t,end=curve.knots.at(-1).t,count=Math.ceil((end-start)/.15);
   for(let i=0;i<=count;i++){const p=ridgePointAt(curve,start+(end-start)*i/count);errors.push(sample(p[0],p[2])-p[1]);}
   for(const k of curve.knots)errors.push(sample(k.position[0],k.position[2])-k.y);
   const fit={id:curve.id,samples:errors.length,maxUnderM:Math.max(0,...errors.map(e=>-e)),maxOverM:Math.max(0,...errors),rmsM:Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length)};
   curveResults.push(fit);allErrors.push(...errors);
  }
  assert(crestError<.015,`Measured guides stay on actual triangle surfaces: ${source.id}/${seed}: ${crestError}`);
  const maxUnderM=Math.max(0,...allErrors.map(e=>-e)),maxOverM=Math.max(0,...allErrors),rmsM=Math.sqrt(allErrors.reduce((s,e)=>s+e*e,0)/allErrors.length);
  const band=scene.ridge.policy.curveToleranceM,withinBand=allErrors.filter(e=>Math.abs(e)<=band).length/allErrors.length;
  const sortedErrors=allErrors.map(Math.abs).sort((a,b)=>a-b),p90=sortedErrors[Math.floor(sortedErrors.length*.90)];
  assert(Math.max(maxUnderM,maxOverM)<band*2.8&&rmsM<band*1.05&&p90<band*1.8,`Broad-mass fit ${source.id}/${seed}: ${JSON.stringify({maxUnderM,maxOverM,rmsM,band,withinBand,p90})}`);
  assert(scene.ridge.field.bodyFitSamples>5,'The spaces between ridge directions participate in the fit');
  const accents=scene.rocks.filter(r=>r.role==='small accent'),structural=scene.rocks.filter(r=>r.role!=='small accent');
  assert(accents.length<=2&&structural.length<=30,'Sparse accent and structural mass budgets');
  assert(structural.every(r=>r.massLengthM>=12-1e-8),'No small structural gap-fill pieces');
  assert(scene.rocks.every(r=>r.role!=='ridge fill'),'The old iterative fragment repair is removed');
  for(const r of accents){const g=data.geometries[r.mesh];assert((g.bounds[1][1]-g.bounds[0][1])*r.verticalScale<=3.000001,'Small accents stay low');}
  const contactGraph=new Map(scene.rocks.map(r=>[r.id,[]])),vertices=new Map(scene.rocks.map(r=>[r.id,transformedVertices(r,data.geometries[r.mesh])]));
  for(const edge of scene.ridge.composition.contactEdges){
   const a=scene.rocks.find(r=>r.id===edge.a),b=scene.rocks.find(r=>r.id===edge.b);
   const valid=edge.witnesses.filter(w=>insideMesh(w.position,vertices.get(a.id),data.geometries[a.mesh].indices)&&insideMesh(w.position,vertices.get(b.id),data.geometries[b.mesh].indices));
   assert(valid.length>=2,`Contact must have two independently ray-verified volume witnesses: ${source.id}/${seed}/${a.id}/${b.id}`);
   contactGraph.get(a.id).push(b.id);contactGraph.get(b.id).push(a.id);
  }
  const connected=new Set(),contactQueue=[scene.rocks[0].id];while(contactQueue.length){const id=contactQueue.pop();if(connected.has(id))continue;connected.add(id);contactQueue.push(...contactGraph.get(id));}
  assert.equal(connected.size,scene.rocks.length,'All masses and accents form one actual connected body');
  let branchResponse;
  if(seed===382){
   for(const factor of [.25,1.3,2]){
    const scaled=withSceneHeight(scene,factor);
    for(let i=0;i<scene.rocks.length;i++){
     const original=transformedVertices(scene.rocks[i],data.geometries[scene.rocks[i].mesh]),changed=transformedVertices(scaled.rocks[i],data.geometries[scene.rocks[i].mesh]);
     for(let j=0;j<original.length;j++){near(changed[j][0],original[j][0],1e-8,'Height preserves X');near(changed[j][2],original[j][2],1e-8,'Height preserves Z');near(changed[j][1],original[j][1]*factor,1e-8,'Height scales Y');}
    }
    for(let i=0;i<plan.curves.length;i++)for(let j=0;j<plan.curves[i].knots.length;j++)near(scaled.ridge.plan.curves[i].knots[j].position[1],plan.curves[i].knots[j].position[1]*factor,1e-8,'Height scales all branch nodes');
    for(let i=0;i<scene.guides.length;i++)for(let j=0;j<scene.guides[i].points.length;j++){const lift=scene.guides[i].liftM??0;near(scaled.guides[i].points[j][1]-lift,(scene.guides[i].points[j][1]-lift)*factor,1e-8,'Height scales the whole network display');}
   }
   const edited=structuredClone(plan),peak=edited.nodes.find(n=>n.role==='peak'&&!edited.curves[0].knots.some(k=>k.id===n.id)),p=[...peak.position];
   for(const curve of edited.curves)for(const k of curve.knots)if(k.id===peak.id){k.y+=6;k.position[1]+=6;}
   const node=edited.nodes.find(n=>n.id===peak.id);node.y+=6;node.position[1]+=6;
   assert.deepEqual(edited.curves[0],plan.curves[0],'The branch edit leaves the main ridge unchanged');
   const changed=assembleRidgeTarget(source,data.geometries,edited),changedSurface=createSurfaceSampler(changed,data.geometries);
   branchResponse=changedSurface(p[0],p[2])-sample(p[0],p[2]);
   assert(branchResponse>1,`A side branch must drive local 3D placement, independently of the main ridge: ${branchResponse}`);
   assert.notDeepEqual(changed.rocks,scene.rocks);
   assert.equal(JSON.stringify(plan),before,'Height and branch edits leave the original network intact');
  }
  results.push({scene:source.id,seed,curves:plan.curves.length,nodes:plan.nodes.length,atoms:scene.rocks.length,nonPlanarity,bodyFitSamples:scene.ridge.field.bodyFitSamples,composition:{structuralMasses:structural.length,smallRocks:accents.length,refitted:scene.ridge.composition.refittedMasses,pruned:scene.ridge.composition.prunedMasses,verifiedContactEdges:scene.ridge.composition.contactEdges.length},fitAtPointOneFiveMeter:{maxUnderM,maxOverM,rmsM,toleranceM:band,withinBandFraction:withinBand,samples:allErrors.length,byCurve:curveResults},maximumSurfaceGuideErrorM:crestError,...(branchResponse!==undefined?{raisedBranchSurfaceResponseM:branchResponse}:{}),durationMs:Math.round(performance.now()-started)});
 }
}
const output={version:RIDGE_VERSION,testedAssemblies:results.length,seeds,checks:['network generated independently of atoms','shared XYZ junctions','connected graph with real branching','noncoplanar ridge directions','C1 continuity along every curve','true peak and saddle extrema','input network immutable during fitting','exact seeded repeat','different seeds vary the assembly','positive finite transforms','actual mountain footprint containment','every branch is marked and measured','soft curve tolerance with bounded residuals','minimum structural scale and sparse accent budget','ray-verified connected mesh volumes','between-branch body fitting','whole-network height scaling','side-branch edit changes local placement with fixed main ridge'],results};
fs.writeFileSync(new URL('../evidence/ridge-validation.json',import.meta.url),JSON.stringify(output,null,2));
console.log(JSON.stringify({version:output.version,assemblies:results.length,checks:output.checks.length,maxUnderM:Math.max(...results.map(r=>r.fitAtPointOneFiveMeter.maxUnderM)),maxOverM:Math.max(...results.map(r=>r.fitAtPointOneFiveMeter.maxOverM)),maxRmsM:Math.max(...results.map(r=>r.fitAtPointOneFiveMeter.rmsM)),branchResponses:results.filter(r=>r.raisedBranchSurfaceResponseM!==undefined).map(r=>({scene:r.scene,responseM:r.raisedBranchSurfaceResponseM}))},null,2));
