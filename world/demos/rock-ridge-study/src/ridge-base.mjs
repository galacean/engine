import {createSurfaceSampler,createColumnSampler} from './ridge-utils.mjs';

export function ridgeHeightAt(plan,t){
  const knots=plan.knots;
  if(t<=knots[0].t)return knots[0].y;
  if(t>=knots.at(-1).t)return knots.at(-1).y;
  let i=1;while(t>knots[i].t)i++;
  const a=knots[i-1],b=knots[i],u=(t-a.t)/(b.t-a.t),blend=u*u*(3-2*u);
  return a.y+(b.y-a.y)*blend;
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
