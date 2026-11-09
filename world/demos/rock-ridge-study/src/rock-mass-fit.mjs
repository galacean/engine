import {clamp,point,footprint,random,transformedVertices} from './ridge-utils.mjs';
import {atomProfile} from './ridge-base.mjs';

const massBoundsCache=new WeakMap();
function massBounds(r,g){
 if(massBoundsCache.has(r))return massBoundsCache.get(r);
 const vertices=transformedVertices(r,g),bounds=[0,1,2].map(d=>[Math.min(...vertices.map(p=>p[d])),Math.max(...vertices.map(p=>p[d]))]);
 massBoundsCache.set(r,bounds);return bounds;
}
export function massColumn(r,g,x,z){
 const c=Math.cos(r.yaw),s=Math.sin(r.yaw),dx=x-r.x,dz=z-r.z,p=atomProfile(g);
 const lx=(c*dx+s*dz)/(r.scale*r.longitudinalScale),lz=(-s*dx+c*dz)/(r.scale*r.lateralScale);
 const top=p.sample(lx,lz),bottom=p.bottom(lx,lz),sy=r.scale*r.verticalScale;
 return Number.isFinite(top)&&Number.isFinite(bottom)?[r.y+bottom*sy,r.y+top*sy]:null;
}
function massIntervals(r,g,x,z){
 const c=Math.cos(r.yaw),s=Math.sin(r.yaw),dx=x-r.x,dz=z-r.z;
 const lx=(c*dx+s*dz)/(r.scale*r.longitudinalScale),lz=(-s*dx+c*dz)/(r.scale*r.lateralScale),sy=r.scale*r.verticalScale;
 return atomProfile(g).intervals(lx,lz).map(([lo,hi])=>[r.y+lo*sy,r.y+hi*sy]);
}
// Witnesses are interior vertical intervals shared by the actual two meshes.
// Bounding boxes only reject impossible pairs; they never establish a contact.
export function massOverlap(a,b,geometries){
 const aa=massBounds(a,geometries[a.mesh]),bb=massBounds(b,geometries[b.mesh]);
 const x0=Math.max(aa[0][0],bb[0][0]),x1=Math.min(aa[0][1],bb[0][1]),z0=Math.max(aa[2][0],bb[2][0]),z1=Math.min(aa[2][1],bb[2][1]);
 if(x1-x0<.3||z1-z0<.3||Math.min(aa[1][1],bb[1][1])-Math.max(aa[1][0],bb[1][0])<.18)return null;
 const witnesses=[];
 for(let j=0;j<5;j++)for(let i=0;i<5;i++){
  const x=x0+(x1-x0)*(i+.5)/5,z=z0+(z1-z0)*(j+.5)/5,ac=massIntervals(a,geometries[a.mesh],x,z),bc=massIntervals(b,geometries[b.mesh],x,z);
  let best;
  for(const ai of ac)for(const bi of bc){const lo=Math.max(ai[0],bi[0]),hi=Math.min(ai[1],bi[1]);if(hi-lo>.18&&(!best||hi-lo>best.depthM))best={position:point([x,(lo+hi)/2,z]),depthM:hi-lo};}
  if(best)witnesses.push(best);
 }
 return witnesses.length>=2?{witnesses:witnesses.slice(0,3),samples:witnesses.length}:null;
}
export function massContactGraph(rocks,geometries){
 const edges=[],links=rocks.map(()=>[]);
 for(let i=0;i<rocks.length;i++)for(let j=i+1;j<rocks.length;j++){
  const overlap=massOverlap(rocks[i],rocks[j],geometries);
  if(overlap){edges.push({a:rocks[i].id,b:rocks[j].id,...overlap});links[i].push(j);links[j].push(i);}
 }
 const visited=new Set(),components=[];
 for(let i=0;i<rocks.length;i++)if(!visited.has(i)){
  const component=[],queue=[i];while(queue.length){const k=queue.pop();if(visited.has(k))continue;visited.add(k);component.push(k);queue.push(...links[k]);}components.push(component);
 }
 return {edges,components};
}

export function fitRockMasses(source,geometries,plan,field,networkSites,bodySites,nodeSites){
 const ground=field.ground,cliff=source.id==='cliff',island=source.id==='island',highest=Math.max(...plan.nodes.map(n=>n.y));
 const band=cliff?1.8:island?2.8:3.2,minLength=12,smallBudget=2,massBudget=30;
 const sites=[...networkSites.map(s=>({...s,weight:1.0})),...bodySites.map(s=>({...s,weight:.65}))];
 const floors=sites.map(s=>ground(s.position[0],s.position[2]));
 const penalty=(h,i)=>{const e=h-sites[i].position[1],t=sites[i].kind==='body'?band*1.3:band;return (Math.max(0,-e-t)**2+2.2*Math.max(0,e-t)**2)*sites[i].weight;};
 let pieces=[],refitted=0,pruned=0;
 const surfaceOf=list=>sites.map((_,i)=>list.reduce((h,p)=>Math.max(h,p.predicted[i]),floors[i]));
 const loss=surface=>surface.reduce((s,h,i)=>s+penalty(h,i),0);
 function candidate(site,mesh,length,depth,heightFactor,yawOffset,shift,role,others,previousSurface){
  const g=geometries[mesh],profile=atomProfile(g),yaw=site.yaw+yawOffset,c=Math.cos(yaw),s=Math.sin(yaw),sx=length/g.parameters.obbWidth,sz=depth/g.parameters.obbDepth;
  const ax=site.position[0]+Math.cos(site.yaw)*shift,az=site.position[2]+Math.sin(site.yaw)*shift;
  const r={mesh,x:ax-c*profile.top[0]*sx+s*profile.top[2]*sz,z:az-s*profile.top[0]*sx-c*profile.top[2]*sz,y:0,yaw,scale:1,longitudinalScale:sx,lateralScale:sz,verticalScale:1,role,anchorId:site.id??null,curveId:site.curveId??null,ridgeT:site.t??null,massLengthM:length,massDepthM:depth};
  let bottom=Infinity,valid=true;
  footprint(r,g,(x,z)=>{const h=ground(x,z);if(x<source.extent[0]+.25||x>source.extent[1]-.25||z<source.extent[2]+.25||z>source.extent[3]-.25||!Number.isFinite(h)||(island&&h<.10))valid=false;bottom=Math.min(bottom,h);});
  if(!valid)return null;
  bottom-=role==='small accent'?.35:.7;
  const height=Math.min(Math.max(.8,(site.position[1]-bottom)*heightFactor),highest+band-bottom,length*1.8,depth*2.0,role==='small accent'?3:Infinity);
  r.verticalScale=height/profile.height;r.y=bottom-profile.min*r.verticalScale;
  const predicted=sites.map(site=>{
   const dx=site.position[0]-r.x,dz=site.position[2]-r.z,lx=(c*dx+s*dz)/sx,lz=(-s*dx+c*dz)/sz;
   if(lx<g.bounds[0][0]||lx>g.bounds[1][0]||lz<g.bounds[0][2]||lz>g.bounds[1][2])return -Infinity;
   const h=profile.sample(lx,lz);return Number.isFinite(h)?r.y+h*r.verticalScale:-Infinity;
  });
  let envelopeCost=0,probes=0;
  for(let i=0;i<profile.probes.length;i+=3){
   const [x,q,z]=profile.probes[i],wx=r.x+c*x*sx-s*z*sz,wz=r.z+s*x*sx+c*z*sz;
   const excess=Math.max(0,bottom+q*height-field.sample(wx,wz)-band*1.3);envelopeCost+=excess*excess;probes++;
  }
  envelopeCost=envelopeCost/Math.max(1,probes)*15;
  const next=previousSurface.map((h,i)=>Math.max(h,predicted[i]));
  const pieceCost=9+200/(length*depth);
  const anchor=massColumn(r,g,...[site.position[0],site.position[2]]);
  const anchorCost=site.role==='peak'&&anchor?8*Math.max(0,Math.abs(anchor[1]-site.position[1])-band*.55)**2:0;
  const cost=envelopeCost+pieceCost+anchorCost;
  return {rock:r,predicted,site,role,length,depth,cost,score:loss(previousSurface)-loss(next)-cost};
 }
 function connectedToAll(trial,others,components){
  return components.every(component=>component.some(i=>massOverlap(trial.rock,others[i].rock,geometries)));
 }
 function choose(site,role,others,options={}){
  const surface=surfaceOf(others),relief=site.position[1]-ground(site.position[0],site.position[2]);
  const peak=site.role==='peak',tail=role==='toe mass',accent=role==='small accent';
  const nominal=options.length??(tail?14:peak?clamp(relief*.92+5,18,34):clamp(relief*.7+8,16,28));
  const lengths=accent?[5.5]:[...new Set([nominal*1.18,nominal,Math.max(minLength,nominal*.82),minLength])];
  const meshes=options.meshes??(accent?['bank','bank2']:cliff&&site.curveId==='main'?['cliff','cliff2']:tail?['bank','bank2']:peak?['peak','peak2','shoulder']:['shoulder','shoulder2','cliff2']);
  const trials=[];
  for(const length of lengths){
   const depth=accent?4.5:Math.max(tail?8:10,Math.min(island?21:29,length*(tail?.66:.76)+Math.max(0,relief)*.09));
   for(const mesh of meshes)for(const flip of [0,Math.PI])for(const heightFactor of [.90,1.03,1.12]){
    const trial=candidate(site,mesh,length,depth,heightFactor,flip,0,role,others,surface);if(trial)trials.push(trial);
   }
  }
  if(!accent){
   // Broad pieces can move inward from a shoreline or turn away from a low
   // saddle; footprint clearance does not force them into tiny fragments.
   for(const length of [nominal,minLength])for(const mesh of meshes.slice(0,2))for(const flip of [0,Math.PI])for(const shift of [-3,3]){
    const depth=Math.max(tail?8:10,Math.min(island?21:29,length*.76+Math.max(0,relief)*.09));
    const trial=candidate(site,mesh,length,depth,1.0,flip,shift,role,others,surface);if(trial)trials.push(trial);
   }
  }
  // Whole-mass shifts are considered during refitting, not a new fragment.
  if(options.refit){
   for(const shift of [-2.2,2.2])for(const yaw of [-.14,.14])for(const factor of [.96,1.08]){
    const trial=candidate(site,options.mesh,options.length,options.depth,factor,options.flip+yaw,shift,role,others,surface);if(trial)trials.push(trial);
   }
  }
  trials.sort((a,b)=>b.score-a.score);
  const components=others.length?massContactGraph(others.map(p=>p.rock),geometries).components:[];
  return trials.find(t=>connectedToAll(t,others,components));
 }
 function accept(trial){if(!trial)return false;trial.rock.id=source.id+'-mass-'+pieces.length;pieces.push(trial);return true;}
 // Traverse outward from the dominant peak. Every accepted mass intersects
 // the already connected body in actual mesh volume, not just in screen space.
 const nodeMap=new Map(nodeSites.map(n=>[n.id,n])),links=new Map(nodeSites.map(n=>[n.id,[]]));
 for(const curve of plan.curves)for(let i=1;i<curve.knots.length;i++){const a=curve.knots[i-1].id,b=curve.knots[i].id;links.get(a).push(b);links.get(b).push(a);}
 const order=[],seen=new Set(),queue=[nodeSites.find(n=>n.primary).id];
 while(queue.length){const id=queue.shift();if(seen.has(id))continue;seen.add(id);order.push(id);queue.push(...links.get(id));}
 function nodeSite(id){
  const original=nodeMap.get(id);if(original.role!=='tail'||(cliff&&original.curveId==='main'))return original;
  const curve=plan.curves.find(c=>c.id===original.curveId),end=curve.knots[0].id===id?curve.knots[1]:curve.knots.at(-2);
  const t=original.t+(end.t-original.t)*.40;
  const nearby=networkSites.filter(s=>s.curveId===curve.id).reduce((a,b)=>Math.abs(a.t-t)<Math.abs(b.t-t)?a:b);
  return {...original,...nearby,id:original.id,role:'tail'};
 }
 const deferred=[];
 for(const id of order){const site=nodeSite(id),trial=choose(site,site.role==='tail'?'toe mass':'ridge mass',pieces);if(trial&&(trial.score>0||!pieces.length))accept(trial);else deferred.push(id);}
 for(const id of deferred){const site=nodeSite(id),trial=choose(site,site.role==='tail'?'toe mass':'ridge mass',pieces);if(trial&&trial.score>12)accept(trial);}
 // Coordinate descent changes/removes existing large pieces before adding
 // further structure. Connectivity must survive every replacement or removal.
 function refitMasses(){for(let i=0;i<pieces.length;i++){
  const old=pieces[i],others=pieces.filter((_,j)=>j!==i),oldSurface=surfaceOf(pieces),otherSurface=surfaceOf(others);
  if(!old.site.primary&&loss(otherSurface)-loss(oldSurface)<.4&&massContactGraph(others.map(p=>p.rock),geometries).components.length===1){pieces.splice(i--,1);pruned++;continue;}
  const flip=Math.abs(old.rock.yaw-old.site.yaw)>1?Math.PI:0;
  const trial=choose(old.site,old.role,others,{length:old.length,depth:old.depth,mesh:old.rock.mesh,flip,refit:true});
  const oldScore=loss(otherSurface)-loss(oldSurface)-old.cost;
  if(trial&&trial.score>oldScore+2){trial.rock.id=old.rock.id;pieces[i]=trial;refitted++;}
 }}
 refitMasses();
 // Residual additions have the same minimum structural scale and a count
 // cost. Errors already inside the tolerance band never trigger a repair.
 const blocked=new Set();
 for(let pass=0;pass<10&&pieces.length<massBudget;pass++){
  const surface=surfaceOf(pieces);let index=-1,worst=band*1.7;
  for(let i=0;i<sites.length;i++)if(!blocked.has(i)&&sites[i].position[1]-surface[i]>worst){worst=sites[i].position[1]-surface[i];index=i;}
  if(index<0)break;
  const site=sites[index],trial=choose({...site,role:'shoulder'},'shoulder mass',pieces,{length:cliff?18:20});
  if(!trial||trial.score<20||trial.predicted[index]<surface[index]+band*.5){blocked.add(index);continue;}
  accept(trial);
 }
 refitMasses();
 // Sparse low accents are a separate budget. They never stack on a summit
 // or chase a ridge residual, and must overlap the connected base.
 const rng=random(plan.seed,source.id+':sparse-foot-accents');let accents=0;
 const tails=nodeSites.filter(n=>n.role==='tail').map(n=>({n,rank:rng()})).sort((a,b)=>a.rank-b.rank);
 for(const {n} of tails){
  if(accents>=smallBudget)break;
  const side=rng()>.5?1:-1,x=n.position[0]-Math.sin(n.yaw)*side*4,z=n.position[2]+Math.cos(n.yaw)*side*4,g=ground(x,z);
  const site={...n,position:[x,g+1.8+rng()*.8,z],role:'accent'};
  const trial=choose(site,'small accent',pieces);
  if(trial){accept(trial);accents++;}
 }
 pieces.forEach((p,i)=>p.rock.id=source.id+'-mass-'+i);
 const rocks=pieces.map(p=>p.rock),contacts=massContactGraph(rocks,geometries);
 return {rocks,policy:{curveToleranceM:band,minimumMassLengthM:minLength,smallRockBudget:smallBudget,maximumSmallHeightM:3,maximumMasses:massBudget,allowSummitStacking:false},composition:{structuralMasses:rocks.length-accents,smallRocks:accents,refittedMasses:refitted,prunedMasses:pruned,components:contacts.components.length,contactEdges:contacts.edges}};
}
