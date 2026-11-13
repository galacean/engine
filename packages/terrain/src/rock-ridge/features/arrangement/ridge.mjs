import {RIDGE_VERSION,DEFAULT_RIDGE_SEED,clamp,point,createSurfaceSampler,transformedVertices} from '../../ridge-utils.mjs';
import {ridgeHeightAt} from './ridge-base.mjs';
import {createMountainNetwork} from './mountain-network.mjs';
import {fitRockMasses} from './rock-mass-fit.mjs';
import {extractPerlinRidgeTarget,perlinCurvePoint,createPerlinSource} from './perlin-ridges.mjs';
export {RIDGE_VERSION,DEFAULT_RIDGE_SEED,createSurfaceSampler,transformedVertices,withSceneHeight} from '../../ridge-utils.mjs';
export {ridgeHeightAt} from './ridge-base.mjs';

const smooth01=u=>{u=clamp(u,0,1);return u*u*(3-2*u);};
function knotTangent(knots,i,d){
 const a=knots[Math.max(0,i-1)],b=knots[Math.min(knots.length-1,i+1)];
 return (b.position[d]-a.position[d])/(b.t-a.t);
}
// Every edge is an XYZ cubic. Shared graph nodes have exactly the same XYZ;
// branch directions may diverge there, while each individual edge is C1 smooth.
export function ridgePointAt(plan,t,curveId='main'){
 const curve=plan.curves?plan.curves.find(c=>c.id===curveId):plan,knots=curve.knots;
 if(curve.path)return perlinCurvePoint(curve,t);
 if(t<=knots[0].t)return [...knots[0].position];
 if(t>=knots.at(-1).t)return [...knots.at(-1).position];
 let i=1;while(t>knots[i].t)i++;
 const a=knots[i-1],b=knots[i],dt=b.t-a.t,u=(t-a.t)/dt,u2=u*u,u3=u2*u;
 const p=[0,ridgeHeightAt(curve,t),0];
 for(const d of [0,2])p[d]=(2*u3-3*u2+1)*a.position[d]+(u3-2*u2+u)*dt*knotTangent(knots,i-1,d)+(-2*u3+3*u2)*b.position[d]+(u3-u2)*dt*knotTangent(knots,i,d);
 return p;
}
function curveYaw(curve,t){const a=ridgePointAt(curve,t-.03),b=ridgePointAt(curve,t+.03);return Math.atan2(b[2]-a[2],b[0]-a[0]);}
function curveSamples(curve,pitch){
 const start=curve.knots[0].t,end=curve.knots.at(-1).t,count=Math.ceil((end-start)/pitch);
 const times=Array.from({length:count+1},(_,i)=>start+(end-start)*i/count);
 times.push(...curve.knots.map(k=>k.t));
 return [...new Set(times)].sort((a,b)=>a-b).map(t=>({t,position:ridgePointAt(curve,t),yaw:curveYaw(curve,t),curveId:curve.id}));
}

export function createRidgeTarget(source,inputSeed=DEFAULT_RIDGE_SEED,options={}){
 return createMountainNetwork(source,inputSeed,options);
}

// A radial influence around every network edge makes one XZ-dependent height
// envelope. It has falling flanks in both directions, rather than an extrusion
// of the main profile. Near an edge its exact target height constrains the field.
export function createRidgeField(source,plan){
 const ground=createSurfaceSampler(source,{},true),segments=[],cliff=source.id==='cliff',island=source.id==='island';
 const noise=plan.noise?createPerlinSource(source,plan.seed,plan.noise):null;
 for(const curve of plan.curves){
  const samples=curveSamples(curve,.85).map(s=>{
   const relief=Math.max(0,s.position[1]-ground(s.position[0],s.position[2]));
   const width=(cliff?6+relief*.48:Math.min(island?18:27,(island?5:7)+relief*(island?.52:.66)))*(curve.kind==='branch'?.84:1);
   return {...s,relief,width};
  });
  for(let i=1;i<samples.length;i++)segments.push({a:samples[i-1],b:samples[i]});
 }
 function direct(x,z){
  const base=ground(x,z);let height=base,nearest=Infinity,nearY=base,nearYaw=0;
  for(const {a,b} of segments){
   const dx=b.position[0]-a.position[0],dz=b.position[2]-a.position[2],l2=dx*dx+dz*dz;
   const u=l2>0?clamp(((x-a.position[0])*dx+(z-a.position[2])*dz)/l2,0,1):0;
   const distance=Math.hypot(x-a.position[0]-u*dx,z-a.position[2]-u*dz);
   if(distance<nearest){nearest=distance;nearY=a.position[1]+u*(b.position[1]-a.position[1]);nearYaw=Math.atan2(dz,dx);}
   const width=a.width+u*(b.width-a.width),q=distance/width;
   if(q<1){const ridgeY=a.position[1]+u*(b.position[1]-a.position[1]);height=Math.max(height,base+Math.max(0,ridgeY-base)*(1-q*q)**2);}
  }
  if(nearest<1.6)height=nearY+(height-nearY)*smooth01(nearest/1.6);
  if(noise)height+=noise.detail(x,z)*smooth01(nearest/5)*clamp((height-base)/4,0,1);
  return {height:Math.max(base,height),distance:nearest,yaw:nearYaw};
 }
 const pitch=.75,[x0,x1,z0,z1]=source.extent,nx=Math.ceil((x1-x0)/pitch)+1,nz=Math.ceil((z1-z0)/pitch)+1,px=(x1-x0)/(nx-1),pz=(z1-z0)/(nz-1),values=new Float32Array(nx*nz);
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)values[j*nx+i]=direct(x0+i*px,z0+j*pz).height;
 function sample(x,z){
  const u=clamp((x-x0)/px,0,nx-1.00001),v=clamp((z-z0)/pz,0,nz-1.00001),i=Math.floor(u),j=Math.floor(v),fx=u-i,fz=v-j;
  return (values[j*nx+i]*(1-fx)+values[j*nx+i+1]*fx)*(1-fz)+(values[(j+1)*nx+i]*(1-fx)+values[(j+1)*nx+i+1]*fx)*fz;
 }
 return {sample,direct,ground,pitch,gridSamples:values.length};
}

export function assembleRidgeTarget(source,geometries,plan){
 const scene={...source,rocks:[],guides:[],labels:[]},field=createRidgeField(source,plan),ground=field.ground;
 const cliff=source.id==='cliff',island=source.id==='island',highest=Math.max(...plan.nodes.map(n=>n.y));
 const networkSites=plan.curves.flatMap(curve=>curveSamples(curve,1.5).map(s=>({...s,kind:'ridge'})));
 const bodySites=[];
 for(let z=source.extent[2]+3;z<source.extent[3]-3;z+=4.5)for(let x=source.extent[0]+3;x<source.extent[1]-3;x+=4.5){
  const h=field.sample(x,z),g=ground(x,z);
  if(h>g+2.5&&(!island||g>.3)){const local=field.direct(x,z);if(local.distance>3)bodySites.push({position:[x,h,z],yaw:local.yaw,kind:'body'});}
 }
 const nodeSites=plan.nodes.map(node=>{const curve=plan.curves.find(c=>c.id===node.incidentCurves[0]),knot=curve.knots.find(k=>k.id===node.id);return {...node,t:knot.t,curveId:curve.id,yaw:curveYaw(curve,knot.t)};});
 const masses=fitRockMasses(source,geometries,plan,field,networkSites,bodySites,nodeSites);
 scene.rocks=masses.rocks;
 if(!scene.rocks.length)throw new Error('Ridge network fitting produced no masses');
 const measured=createSurfaceSampler(scene,geometries),allErrors=[],byCurve=[];
 for(const curve of plan.curves){
  const targets=curveSamples(curve,.25).map(s=>({...s,position:point(s.position)})),surfacePoints=targets.map(s=>[s.position[0],measured(s.position[0],s.position[2])+.08,s.position[2]]);
  const errors=targets.map((s,i)=>surfacePoints[i][1]-.08-s.position[1]);allErrors.push(...errors);
  scene.guides.push({kind:'target',curveId:curve.id,branch:curve.kind==='branch',source:'procedural-network-before-atoms',liftM:0,points:targets.map(s=>point(s.position))});
  scene.guides.push({kind:'spine',curveId:curve.id,branch:curve.kind==='branch',source:'actual-surface-at-ridge-xz',liftM:.08,points:surfacePoints.map(point)});
  byCurve.push({id:curve.id,samples:errors.length,maxUnderM:Math.max(0,...errors.map(e=>-e)),maxOverM:Math.max(0,...errors),rmsM:Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length)});
 }
 let primary={position:[0,-Infinity,0],rock:null};
 for(const r of scene.rocks)for(const v of transformedVertices(r,geometries[r.mesh]))if(v[1]>primary.position[1])primary={position:point(v),rock:r.id};
 scene.ridge={version:RIDGE_VERSION,seed:plan.seed,plan,primary,saddles:[],target:{source:'generated-before-atoms',interpolation:'C1 XYZ cubic curves; shared graph junctions',knots:plan.nodes.map(n=>({...n,position:point(n.position)}))},stations:plan.nodes.map(n=>({id:n.id,role:n.role,primary:n.primary,junction:n.incidentCurves.length>1,target:point(n.position),base:[n.position[0],ground(n.position[0],n.position[2]),n.position[2]],heightM:n.y-ground(n.position[0],n.position[2])})),field:{gridPitchM:field.pitch,gridSamples:field.gridSamples,bodyFitSamples:bodySites.length},fit:{samplePitchM:.25,samples:allErrors.length,maxUnderM:Math.max(0,...allErrors.map(e=>-e)),maxOverM:Math.max(0,...allErrors),rmsM:Math.sqrt(allErrors.reduce((s,e)=>s+e*e,0)/allErrors.length),atoms:scene.rocks.length,byCurve}};
 scene.ridge.policy=masses.policy;scene.ridge.composition=masses.composition;
 const crown=plan.nodes.find(n=>n.primary),branch=plan.nodes.filter(n=>n.role==='saddle'&&!n.id.startsWith('main')).sort((a,b)=>b.position[2]-a.position[2])[0];
 scene.labels=[{text:'Dominant peak',anchor:point(crown.position),position:[crown.position[0],crown.y+2.5,crown.position[2]]}];
 if(branch)scene.labels.push({text:'Saddle',anchor:point(branch.position),position:[branch.position[0],branch.y+2.5,branch.position[2]]});
 scene.metrics={rocks:scene.rocks.length,triangles:scene.rocks.reduce((sum,r)=>sum+geometries[r.mesh].stats.triangles,0)};
 if(!cliff)scene.camera={...source.camera,yaw:.58,pitch:.52};
 return scene;
}
export function generateRidgeScene(source,geometries,seed=DEFAULT_RIDGE_SEED,options={}){
 if(source.id!=='peaks')throw new RangeError('The ridge study supports mountain peaks only');
 return assembleRidgeTarget(source,geometries,options.mode==='perlin'?extractPerlinRidgeTarget(source,seed,options.noise):createRidgeTarget(source,seed,options.topology));
}
