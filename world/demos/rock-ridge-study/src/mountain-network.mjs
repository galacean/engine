import {RIDGE_VERSION,DEFAULT_RIDGE_SEED,random,clamp,createSurfaceSampler} from './ridge-utils.mjs';

// Grow a spatial tree before any mesh is read. Limits express the footprint and
// minimum useful mass size; there is no stored layout, main axis or branch motif.
export function createMountainNetwork(source,inputSeed=DEFAULT_RIDGE_SEED){
 const seed=Number(inputSeed)>>>0,rng=random(seed,'mountain-topology-1');
 const ground=createSurfaceSampler(source,{},true),[x0,x1,z0,z1]=source.extent;
 const cx=(x0+x1)/2,cz=(z0+z1)/2,rx=(x1-x0)/2-14,rz=(z1-z0)/2-12;
 const nodes=[],curves=[],links=new Map(),distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
 const inside=(p,scale=1)=>((p[0]-cx)/(rx*scale))**2+((p[2]-cz)/(rz*scale))**2<=1;
 function node(role,x,z,y,primary=false){
  const n={id:'mountain-node-'+nodes.length,position:[x,y,z],y,role,primary,incidentCurves:[]};
  nodes.push(n);links.set(n.id,[]);return n;
 }
 function curve(points,type){
  const id=curves.length?'ridge-'+curves.length:'main';let t=0;
  const knots=points.map((n,i)=>{if(i){t+=distance(n.position,points[i-1].position);links.get(n.id).push(points[i-1]);links.get(points[i-1].id).push(n);}n.incidentCurves.push(id);return {...n,position:[...n.position],t};});
  const edge={id,kind:curves.length?'branch':'trunk',type,knots};curves.push(edge);return edge;
 }
 const requestedPeaks=1+Math.floor(rng()*5),requestedSpurs=3+Math.floor(rng()*4);
 const x=cx+(rng()-.5)*12,z=cz+(rng()-.5)*8,crown=26+rng()*7;
 const primary=node('peak',x,z,ground(x,z)+crown,true),peaks=[primary];
 // A new summit chooses a nearby existing summit as parent. Rejection is spatial:
 // the same count can produce a chain, a fork, or several asymmetric arms.
 for(let i=1;i<requestedPeaks;i++){
  let best;
  for(let attempt=0;attempt<100;attempt++){
   const parent=peaks[Math.floor(rng()*peaks.length)],angle=rng()*Math.PI*2,run=19+rng()*12;
   const p=[parent.position[0]+Math.cos(angle)*run,0,parent.position[2]+Math.sin(angle)*run];
   if(!inside(p,.79))continue;
   const separation=Math.min(...peaks.map(n=>distance(n.position,p)));
   if(separation<17||peaks.some(n=>n!==parent&&distance(n.position,p)<run*.94))continue;
   const score=separation*.2+rng()*2-links.get(parent.id).length*.8;
   if(!best||score>best.score)best={parent,p,score};
  }
  if(!best)break;
  const {parent,p}=best,relief=crown*(.56+rng()*.28);
  const peak=node('peak',p[0],p[2],Math.min(primary.y-3,ground(p[0],p[2])+relief));peaks.push(peak);
  const u=.38+rng()*.24,dx=p[0]-parent.position[0],dz=p[2]-parent.position[2],run=Math.hypot(dx,dz),bend=(rng()-.5)*run*.16;
  const sx=parent.position[0]+u*dx-dz/run*bend,sz=parent.position[2]+u*dz+dx/run*bend,floor=ground(sx,sz);
  const saddle=node('saddle',sx,sz,floor+(Math.min(parent.y,peak.y)-floor)*(.73+rng()*.13));
  curve([parent,saddle,peak],'summit-link');
 }
 // Descending spurs compete for empty angular sectors and room inside the
 // footprint. Their count, parent, direction, length and shoulder are seeded.
 function spurCandidate(parents){
  let best;
  for(let attempt=0;attempt<100;attempt++){
   const root=parents[Math.floor(rng()*parents.length)],angle=rng()*Math.PI*2,run=20+rng()*15;
   const p=[root.position[0]+Math.cos(angle)*run,0,root.position[2]+Math.sin(angle)*run];
   if(!inside(p))continue;
   const neighbors=links.get(root.id),clearance=neighbors.length?Math.min(...neighbors.map(n=>{
    const a=Math.atan2(n.position[2]-root.position[2],n.position[0]-root.position[0]);
    return Math.acos(clamp(Math.cos(a-angle),-1,1));
   })):Math.PI;
   if(clearance<.68)continue;
   const separation=Math.min(...nodes.filter(n=>n!==root).map(n=>distance(p,n.position)),30);
   if(separation<10)continue;
   // Keep a spur away from existing nonincident ridges, not just their ends.
   let edgeGap=Infinity;
   for(const edge of curves)for(let k=1;k<edge.knots.length;k++){
    const a=edge.knots[k-1],b=edge.knots[k];if(a.id===root.id||b.id===root.id)continue;
    for(const fraction of [.35,.65,1]){
     const q=[root.position[0]+(p[0]-root.position[0])*fraction,0,root.position[2]+(p[2]-root.position[2])*fraction];
     const dx=b.position[0]-a.position[0],dz=b.position[2]-a.position[2];
     const t=clamp(((q[0]-a.position[0])*dx+(q[2]-a.position[2])*dz)/(dx*dx+dz*dz),0,1);
     edgeGap=Math.min(edgeGap,Math.hypot(q[0]-a.position[0]-t*dx,q[2]-a.position[2]-t*dz));
    }
   }
   if(edgeGap<6)continue;
   const score=Math.min(clearance,2.5)*3+separation*.13+rng()*2-neighbors.length*.5;
   if(!best||score>best.score)best={root,p,run,score};
  }
  return best;
 }
 for(let i=0;i<requestedSpurs;i++){
  const candidate=spurCandidate(peaks);if(!candidate)break;
  const {root,p,run}=candidate,tailY=ground(p[0],p[2])+1.2+rng()*1.4;
  const points=[root];
  if(rng()<.6){
   const u=.42+rng()*.16,bend=(rng()-.5)*run*.18,dx=(p[0]-root.position[0])/run,dz=(p[2]-root.position[2])/run;
   const sx=root.position[0]+dx*run*u-dz*bend,sz=root.position[2]+dz*run*u+dx*bend;
   points.push(node('shoulder',sx,sz,root.y+(tailY-root.y)*(.35+rng()*.2)));
  }
  points.push(node('tail',p[0],p[2],tailY));curve(points,'descending-spur');
 }
 // Some shoulders split again. Others remain unbranched, and a spur never has
 // to invent another summit/saddle just to satisfy a fixed four-knot recipe.
 const forkBudget=Math.floor(rng()*3),shoulders=nodes.filter(n=>n.role==='shoulder');
 let forks=0;
 for(let i=0;i<forkBudget&&shoulders.length;i++){
  const candidate=spurCandidate(shoulders);if(!candidate)break;
  const {root,p}=candidate;root.role='junction';
  for(const edge of curves)for(const k of edge.knots)if(k.id===root.id)k.role='junction';
  curve([root,node('tail',p[0],p[2],ground(p[0],p[2])+1.2+rng())],'fork-spur');
  shoulders.splice(shoulders.indexOf(root),1);forks++;
 }
 return {version:RIDGE_VERSION,seed,kind:'seed-grown-mountain-network',nodes,curves,
  topology:{requestedPeaks,requestedSpurs,peaks:peaks.length,saddles:nodes.filter(n=>n.role==='saddle').length,
   spurs:curves.filter(c=>c.type==='descending-spur').length,forks,
   minimumPeakSpacingM:17,method:'spatial summit growth / shared saddle links / descending spurs / optional forks'}};
}
