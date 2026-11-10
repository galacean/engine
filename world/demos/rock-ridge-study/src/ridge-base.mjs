import {RIDGE_VERSION,DEFAULT_RIDGE_SEED,random,clamp,point,footprint,createSurfaceSampler,createColumnSampler,transformedVertices,traceCrest} from './ridge-utils.mjs';
export {RIDGE_VERSION,DEFAULT_RIDGE_SEED,createSurfaceSampler,transformedVertices,withSceneHeight} from './ridge-utils.mjs';

// The complete 3D target is generated before reading any atomic-rock geometry.
// Its smoothstep segments have zero vertical derivative at every peak and saddle.
export function planAxis(plan) {
  if(plan.axis.kind==='arc'){
    const radius=plan.axis.radius,at=t=>[t,Math.sqrt(Math.max(0,radius*radius-t*t))-radius];
    return {at,project:p=>({t:p[0],offset:p[2]-at(p[0])[1]}),section:(t,o)=>[t,at(t)[1]+o]};
  }
  const {heading,bend,phase}=plan.axis,c=Math.cos(heading),s=Math.sin(heading);
  const across=t=>bend*Math.sin(Math.PI*t/plan.span+phase)+bend*.22*Math.sin(2*Math.PI*t/plan.span-phase);
  const at=t=>[c*t-s*across(t),s*t+c*across(t)];
  return {at,project:p=>{const t=c*p[0]+s*p[2];return {t,offset:-s*p[0]+c*p[2]-across(t)};},section:(t,o)=>{const [x,z]=at(t);return [x-s*o,z+c*o];}};
}

export function ridgeHeightAt(plan,t){
  const knots=plan.knots;
  if(t<=knots[0].t)return knots[0].y;
  if(t>=knots.at(-1).t)return knots.at(-1).y;
  let i=1;while(t>knots[i].t)i++;
  const a=knots[i-1],b=knots[i],u=(t-a.t)/(b.t-a.t),blend=u*u*(3-2*u);
  return a.y+(b.y-a.y)*blend;
}

export function singleRidgePointAt(plan,t){const [x,z]=planAxis(plan).at(t);return [x,ridgeHeightAt(plan,t),z];}

export function createMainRidgeTarget(source,inputSeed=DEFAULT_RIDGE_SEED){
  const seed=Number(inputSeed)>>>0,rng=random(seed,source.id+':target-3d'),cliff=source.id==='cliff',island=source.id==='island';
  const ground=createSurfaceSampler(source,{},true);
  const span=cliff?72*Math.sin(64*Math.PI/180):island?69+6*rng():81+6*rng();
  const plan={version:RIDGE_VERSION,seed,span,coastScale:1,axis:cliff?{kind:'arc',radius:36}:{kind:'bent',heading:(rng()-.5)*(island?.16:.30),bend:(rng()-.5)*(island?9:15),phase:rng()*Math.PI*2},knots:[]};
  if(island){
    for(let attempt=0;attempt<16;attempt++){
      const a=planAxis(plan);let minimum=Infinity;
      for(let i=0;i<=24;i++)for(const o of [-12,0,12]){const [x,z]=a.section(-plan.span/2-4+(plan.span+8)*i/24,o);minimum=Math.min(minimum,ground(x,z));}
      if(minimum>.4){plan.minimumCoastGround=minimum;break;}
      plan.span*=.95;plan.axis.bend*=.95;plan.coastScale*=.95;
    }
  }
  const axis=planAxis(plan),count=cliff?3:island?3:rng()<.78?3:4,primary=cliff?1:1+(count===4&&rng()>.5?1:0);
  // Relief is proportional to the available horizontal run. Higher saddles
  // connect broad masses rather than asking the fitter to build isolated spires.
  const crown=cliff?16.5+2*rng():(island?23+6*rng():26+7*rng());
  const peaks=Array.from({length:count},(_,i)=>{
    const station=island?(i===0?-.34:i===primary?-.10:.24):-.35+.7*i/(count-1);
    const t=(station+(rng()-.5)*.04)*plan.span,[x,z]=axis.at(t);
    const y=cliff?(i===primary?crown:14.6+rng()*1.3):ground(x,z)+(i===primary?crown:crown*(island?.55+rng()*.15:.68+rng()*.17));
    return {t,y,role:'peak',primary:i===primary};
  });
  const start=-plan.span/2,end=plan.span/2;
  const startPoint=axis.at(start),endPoint=axis.at(end);
  plan.knots.push({t:start,y:cliff?13.1+rng()*.7:ground(...startPoint)+2.8+rng()*1.3,role:'tail'});
  for(let i=0;i<peaks.length;i++){
    if(i){
      const a=peaks[i-1],b=peaks[i],t=a.t+(b.t-a.t)*(.43+.14*rng()),[x,z]=axis.at(t),floor=ground(x,z);
      const y=cliff?12.8+rng()*.6:floor+(Math.min(a.y,b.y)-floor)*(.70+.12*rng());
      plan.knots.push({t,y,role:'saddle'});
    }
    plan.knots.push(peaks[i]);
  }
  plan.knots.push({t:end,y:cliff?13.0+rng()*.7:ground(...endPoint)+2.8+rng()*1.3,role:'tail'});
  return plan;
}

const atomProfileCache=new WeakMap();
export function atomProfile(g){
  if(atomProfileCache.has(g))return atomProfileCache.get(g);
  const min=g.bounds[0][1],height=g.bounds[1][1]-min,vertices=[];
  let top=[0,-Infinity,0];
  for(let i=0;i<g.positions.length;i+=3){const v=g.positions.slice(i,i+3);vertices.push(v);if(v[1]>=top[1])top=v;}
  // Subdividing a flat crown must not silently choose a different anchor.
  if(g.surface?.anchor)top=g.surface.anchor;
  const probes=[];
  for(const v of vertices)if(v[1]>min+height*.05)probes.push([v[0],(v[1]-min)/height,v[2]]);
  // Mid-face checks keep broad facets from bridging above a narrow saddle.
  for(let i=0;i<g.indices.length;i+=3){
    const a=vertices[g.indices[i]],b=vertices[g.indices[i+1]],c=vertices[g.indices[i+2]],q=((a[1]+b[1]+c[1])/3-min)/height;
    if(q>.18)probes.push([(a[0]+b[0]+c[0])/3,q,(a[2]+b[2]+c[2])/3]);
  }
  const empty={terrain:{positions:[],indices:[]},rocks:[{mesh:'atom',x:0,y:0,z:0,scale:1,yaw:0}]};
  const inverted={...g,positions:g.positions.map((v,i)=>i%3===1?-v:v)};
  const underside=createSurfaceSampler(empty,{atom:inverted});
  const fitProbes=g.surface&&probes.length>1800?probes.filter((_,i)=>i%Math.ceil(probes.length/1800)===0):probes;
  const profile={min,height,top,probes:fitProbes,sample:createSurfaceSampler(empty,{atom:g}),bottom:(x,z)=>-underside(x,z),intervals:createColumnSampler(g)};atomProfileCache.set(g,profile);return profile;
}
