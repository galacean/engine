import {clamp,createSurfaceSampler,RIDGE_VERSION} from './ridge-utils.mjs';

export const PERLIN_DEFAULTS={frequency:4,octaves:5,lacunarity:2,persistence:.5};
export function perlinSettings(input={}){
 const result={...PERLIN_DEFAULTS,...input};
 for(const [key,lo,hi] of [['frequency',1,4],['octaves',1,8],['lacunarity',1,3],['persistence',0,1]]){
  if(!Number.isFinite(result[key])||result[key]<lo||result[key]>hi||(key==='octaves'&&!Number.isInteger(result[key])))throw new RangeError('Invalid Perlin '+key);
 }
 return result;
}

// Port of the lab's PerlinNoise.ts: same permutation, gradients, quintic fade
// and octave phase stream. Prefixes keep the standalone bundle self-contained.
function perlinRandom(seed){let state=seed>>>0;return ()=>{state=(state+0x6d2b79f5)>>>0;let v=Math.imul(state^(state>>>15),state|1);v^=v+Math.imul(v^(v>>>7),v|61);return ((v^(v>>>14))>>>0)/4294967296;};}
export function labPerlin2D(seed){
 const rng=perlinRandom(seed),permutation=new Uint8Array(512),d=Math.SQRT1_2,gradients=[[1,0],[-1,0],[0,1],[0,-1],[d,d],[-d,d],[d,-d],[-d,-d]];
 for(let i=0;i<256;i++)permutation[i]=i;
 for(let i=255;i>0;i--){const j=Math.floor(rng()*(i+1));[permutation[i],permutation[j]]=[permutation[j],permutation[i]];}
 permutation.set(permutation.subarray(0,256),256);
 const dot=(ix,iz,x,z)=>{const g=gradients[permutation[permutation[ix]+iz]&7];return g[0]*x+g[1]*z;};
 const fade=t=>t*t*t*(t*(t*6-15)+10),mix=(a,b,t)=>a+(b-a)*t;
 return (x,z)=>{const ix=Math.floor(x),iz=Math.floor(z),dx=x-ix,dz=z-iz,gx=ix&255,gz=iz&255;
  const a=mix(dot(gx,gz,dx,dz),dot(gx+1,gz,dx-1,dz),fade(dx)),b=mix(dot(gx,gz+1,dx,dz-1),dot(gx+1,gz+1,dx-1,dz-1),fade(dx));
  return mix(a,b,fade(dz))*Math.SQRT2;
 };
}
export function perlinLayers(seed,settings){
 const s=perlinSettings(settings),noise=labPerlin2D(seed),rng=perlinRandom(seed^0x9e3779b9),layers=[];
 let frequency=s.frequency,amplitude=1;
 for(let i=0;i<s.octaves;i++){layers.push({frequency,amplitude,x:rng()*256,z:rng()*256});frequency*=s.lacunarity;amplitude*=s.persistence;}
 const sample=(x,z,subset=layers)=>{let sum=0,weight=0;for(const l of subset){sum+=noise(x*l.frequency+l.x,z*l.frequency+l.z)*l.amplitude;weight+=l.amplitude;}return weight?sum/weight:0;};
 return {layers,sample};
}

// The mask and field exist before meshes are passed to the fitter. Structural
// wavelengths are >=24 m (twice the minimum mass length); fine octaves cannot
// introduce graph vertices. Each subset keeps its own amplitude normalization.
export function createPerlinSource(source,seed,settings={}){
 const options=perlinSettings(settings),noise=perlinLayers(seed,options),domainM=100,minimumWavelengthM=24;
 const coarse=noise.layers.filter(l=>domainM/l.frequency>=minimumWavelengthM-1e-9),fine=noise.layers.filter(l=>!coarse.includes(l));
 const ground=createSurfaceSampler(source,{},true),cliff=source.id==='cliff',island=source.id==='island',nx=65,nz=49;
 const rx=cliff?34:island?42:44,rz=cliff?13:island?18:29,amplitude=cliff?7:island?26:30;
 const positions=[],masks=[],floors=[],raw=[],neighbors=[];
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  const u=2*i/(nx-1)-1,v=2*j/(nz-1)-1,x=u*rx,z=cliff?Math.sqrt(Math.max(0,36*36-x*x))-39+v*rz:v*rz;
  const mask=Math.max(0,1-(u*u+v*v)**2)**.65,g=ground(clamp(x,source.extent[0],source.extent[1]),clamp(z,source.extent[2],source.extent[3]));
  positions.push([x,g,z]);masks.push(mask);floors.push(g);raw.push(mask*Math.max(.02,.42+.70*noise.sample(x/domainM+.5,z/domainM+.5,coarse)));
  const adjacent=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)if((dx||dz)&&i+dx>=0&&i+dx<nx&&j+dz>=0&&j+dz<nz)adjacent.push((j+dz)*nx+i+dx);neighbors.push(adjacent);
 }
 const maximum=Math.max(...raw),valid=masks.map((m,i)=>m>.025&&(!island||floors[i]>.4));
 for(let k=0;k<positions.length;k++)positions[k][1]=floors[k]+amplitude*raw[k]/maximum;
 // Fine contribution is amplitude-weighted against all layers, capped at 1.2 m.
 // It changes the surface envelope, never the coarse topology or pinned nodes.
 const fineWeight=fine.reduce((s,l)=>s+l.amplitude,0)/noise.layers.reduce((s,l)=>s+l.amplitude,0);
 const detail=(x,z)=>1.2*fineWeight*noise.sample(x/domainM+.5,z/domainM+.5,fine);
 return {options,seed,domainM,minimumWavelengthM,coarseOctaves:coarse.length,fineOctaves:fine.length,nx,nz,positions,masks,floors,valid,neighbors,detail};
}

function perlinSimplify(points,tolerance=1.15){
 if(points.length<3)return points;
 const a=points[0],b=points.at(-1),delta=b.map((v,d)=>v-a[d]),length=delta.reduce((s,v)=>s+v*v,0);let far=0,index=-1;
 for(let i=1;i<points.length-1;i++){const p=points[i],t=length?clamp(p.reduce((s,v,d)=>s+(v-a[d])*delta[d],0)/length,0,1):0,d=Math.hypot(...p.map((v,k)=>v-a[k]-t*delta[k]));if(d>far){far=d;index=i;}}
 return far>tolerance?[...perlinSimplify(points.slice(0,index+1),tolerance).slice(0,-1),...perlinSimplify(points.slice(index),tolerance)]:[a,b];
}

export function extractPerlinRidgeTarget(source,inputSeed=382,settings={}){
 const seed=Number(inputSeed)>>>0,field=createPerlinSource(source,seed,settings),{positions:p,valid,neighbors}=field,n=p.length;
 const height=k=>p[k][1],distance=(a,b)=>Math.hypot(p[a][0]-p[b][0],p[a][2]-p[b][2]);
 // Ascending watershed: every cell belongs to an actual coarse-field maximum.
 const uphill=new Int32Array(n).fill(-1),basin=new Int32Array(n).fill(-1);
 for(let k=0;k<n;k++)if(valid[k]){let best=0;for(const j of neighbors[k])if(valid[j]){const slope=(height(j)-height(k))/distance(j,k);if(slope>best){best=slope;uphill[k]=j;}}}
 const root=k=>{if(basin[k]>=0)return basin[k];return basin[k]=uphill[k]<0?k:root(uphill[k]);};
 const peaks=[];for(let k=0;k<n;k++)if(valid[k]){root(k);if(uphill[k]<0)peaks.push(k);}
 const crown=peaks.reduce((a,b)=>height(a)>height(b)?a:b),passes=new Map();
 for(let k=0;k<n;k++)if(valid[k])for(const j of neighbors[k])if(valid[j]&&basin[k]!==basin[j]){
  const a=Math.min(basin[k],basin[j]),b=Math.max(basin[k],basin[j]),key=a+':'+b,y=Math.min(height(k),height(j)),old=passes.get(key);
  if(!old||y>old.y)passes.set(key,{a,b,cellA:k,cellB:j,y});
 }
 // Highest connecting passes form the basin maximum-spanning tree. The elder
 // component survives each merge; losing peak height minus pass is prominence.
 const parent=new Map(peaks.map(k=>[k,k])),elder=new Map(peaks.map(k=>[k,k])),prominence=new Map([[crown,Infinity]]),tree=[];
 const find=k=>{const v=parent.get(k);if(v!==k)parent.set(k,find(v));return parent.get(k);};
 for(const edge of [...passes.values()].sort((a,b)=>b.y-a.y||a.a-b.a||a.b-b.b)){
  const a=find(edge.a),b=find(edge.b);if(a===b)continue;
  const ea=elder.get(a),eb=elder.get(b),winner=height(ea)>=height(eb)?ea:eb,loser=winner===ea?eb:ea;
  prominence.set(loser,height(loser)-edge.y);parent.set(b,a);elder.set(a,winner);tree.push(edge);
 }
 const selected=[crown],minimumProminence=source.id==='cliff'?.5:1.8,minimumRelief=source.id==='cliff'?2:7;
 for(const k of [...peaks].sort((a,b)=>(prominence.get(b)||0)-(prominence.get(a)||0)||height(b)-height(a))){
  if(selected.length>=4)break;
  if(k!==crown&&(prominence.get(k)||0)>=minimumProminence&&height(k)-field.floors[k]>minimumRelief&&selected.every(j=>distance(j,k)>=12))selected.push(k);
 }
 const basinLinks=new Map(peaks.map(k=>[k,[]]));
 for(const edge of tree){basinLinks.get(edge.a).push({next:edge.b,edge});basinLinks.get(edge.b).push({next:edge.a,edge});}
 const toward=new Map([[crown,null]]),queue=[crown];
 while(queue.length){const k=queue.shift();for(const link of basinLinks.get(k))if(!toward.has(link.next)){toward.set(link.next,{next:k,edge:link.edge});queue.push(link.next);}}
 const used=new Set();for(const k of selected){let at=k;while(at!==crown){const link=toward.get(at);if(!link)throw new Error('Disconnected Perlin watershed');used.add(link.edge);at=link.next;}}
 const graph=new Map([[crown,new Set()]]);
 const connect=(a,b)=>{if(!graph.has(a))graph.set(a,new Set());if(!graph.has(b))graph.set(b,new Set());graph.get(a).add(b);graph.get(b).add(a);};
 const ascend=k=>{while(uphill[k]>=0){connect(k,uphill[k]);k=uphill[k];}};
 for(const edge of used){connect(edge.cellA,edge.cellB);ascend(edge.cellA);ascend(edge.cellB);}
 // Descending spurs follow high downhill neighbors, with an outward direction
 // preference. They are traced on this same coarse field, not drawn in a view.
 const tails=new Set(),centroid=selected.reduce((a,k)=>[a[0]+p[k][0]/selected.length,a[1]+p[k][2]/selected.length],[0,0]);
 const requests=selected.flatMap(k=>{const heading=Math.atan2(p[k][2]-centroid[1],p[k][0]-centroid[0]);return selected.length===1?[0,2.1,4.2].map(angle=>({k,angle})): [{k,angle:heading}];});
 const traceSpur=({k,angle})=>{let at=k,run=0;const path=[k],direction=[Math.cos(angle),Math.sin(angle)];
  for(let step=0;step<60;step++){
   let next=-1,score=-Infinity;
   for(const j of neighbors[at])if(valid[j]&&!graph.has(j)&&!path.includes(j)&&height(j)<height(at)-1e-7){
    const dx=p[j][0]-p[at][0],dz=p[j][2]-p[at][2],length=distance(j,at),dot=(dx*direction[0]+dz*direction[1])/length;
    if(dot<.15)continue;
    const candidate=dot*.7-(height(at)-height(j))/length*.3;if(candidate>score){score=candidate;next=j;}
   }
   if(next<0)break;run+=distance(at,next);path.push(next);at=next;
   if(run>32||height(at)-field.floors[at]<2.5)break;
  }
  if(run>=(source.id==='cliff'?5:9)){for(let i=1;i<path.length;i++)connect(path[i-1],path[i]);tails.add(at);}
 };
 for(const request of requests)traceSpur(request);
 for(let attempt=0;attempt<4&&graph.get(crown).size<3;attempt++){
  const angles=[...graph.get(crown)].map(k=>Math.atan2(p[k][2]-p[crown][2],p[k][0]-p[crown][0])).sort((a,b)=>a-b);
  if(!angles.length)break;let gap=-1,angle=0;
  for(let i=0;i<angles.length;i++){const width=(i===angles.length-1?angles[0]+Math.PI*2:angles[i+1])-angles[i];if(width>gap){gap=width;angle=angles[i]+width/2;}}
  traceSpur({k:crown,angle:angle+[0,.5,-.5,.9][attempt]});
 }
 const anchors=new Set();
 for(const [k,links] of graph){const next=[...links];if(links.size!==2||uphill[k]<0||(height(k)<height(next[0])&&height(k)<height(next[1])))anchors.add(k);}
 const nodeFor=k=>({id:'field-'+k,position:[...p[k]],y:height(k),role:tails.has(k)?'tail':uphill[k]<0?'peak':[...graph.get(k)].every(j=>height(j)>height(k))?'saddle':'junction',primary:k===crown,sourceCell:k,incidentCurves:[]});
 const nodes=[...anchors].map(nodeFor),byCell=new Map(nodes.map(node=>[node.sourceCell,node])),curves=[],visited=new Set();
 const pair=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
 for(const start of anchors)for(const next of graph.get(start)){
  if(visited.has(pair(start,next)))continue;
  const cells=[start];let previous=start,at=next;visited.add(pair(previous,at));
  while(true){cells.push(at);if(anchors.has(at))break;const following=[...graph.get(at)].find(j=>j!==previous);previous=at;at=following;visited.add(pair(previous,at));}
  const raw=cells.map(k=>p[k]),smoothed=raw.map((v,i)=>i===0||i===raw.length-1?v:[(raw[i-1][0]+v[0]*2+raw[i+1][0])/4,v[1],(raw[i-1][2]+v[2]*2+raw[i+1][2])/4]);
  const simplified=perlinSimplify(smoothed),path=[];let t=0;
  for(let i=0;i<simplified.length;i++){if(i)t+=Math.hypot(simplified[i][0]-simplified[i-1][0],simplified[i][2]-simplified[i-1][2]);path.push({t,y:simplified[i][1],position:[...simplified[i]]});}
  if(t<1e-7)throw new Error('Degenerate Perlin ridge');
  const id=curves.length?'field-edge-'+curves.length:'main',a=byCell.get(start),b=byCell.get(at);
  a.incidentCurves.push(id);b.incidentCurves.push(id);
  curves.push({id,kind:curves.length?'branch':'trunk',knots:[{...a,t:0},{...b,t}],path,sourceCells:cells});
 }
 const indices=[];for(let j=0;j<field.nz-1;j++)for(let i=0;i<field.nx-1;i++){const k=j*field.nx+i;indices.push(k,k+field.nx,k+1,k+1,k+field.nx,k+field.nx+1);}
 return {version:RIDGE_VERSION,seed,kind:'perlin-watershed-network',nodes,curves,
  noise:{...field.options,domainM:field.domainM,minimumWavelengthM:field.minimumWavelengthM,coarseOctaves:field.coarseOctaves,fineOctaves:field.fineOctaves},
  extraction:{method:'ascending-watershed / maximum-pass tree / prominence pruning',rawPeaks:peaks.length,selectedPeaks:selected.length,minimumProminenceM:minimumProminence,minimumPeakSpacingM:12,maximumSelectedPeaks:4,selectedCells:selected,passes:[...used].map(e=>({...e})),resolution:[field.nx,field.nz]},
  sourceField:{positions:p.flat(),indices,detailOffsets:p.map((v,k)=>field.detail(v[0],v[2])*field.masks[k]),ground:field.floors}
 };
}

// Monotone Hermite Y preserves peaks/saddles. Interior shape points are bends,
// not extra extrema or rock anchors. X/Z use cubic tangents on the same path.
export function perlinCurvePoint(curve,t){
 const path=curve.path;
 if(t<=0)return [...path[0].position];if(t>=path.at(-1).t)return [...path.at(-1).position];
 let i=1;while(t>path[i].t)i++;
 const a=path[i-1],b=path[i],dt=b.t-a.t,u=(t-a.t)/dt,u2=u*u,u3=u2*u;
 const tangent=(k,d)=>{
  if(d===1){
   if(k===0||k===path.length-1)return 0;
   const h0=path[k].t-path[k-1].t,h1=path[k+1].t-path[k].t,s0=(path[k].y-path[k-1].y)/h0,s1=(path[k+1].y-path[k].y)/h1;
   if(s0*s1<=0)return 0;
   const w0=2*h1+h0,w1=h1+2*h0;return (w0+w1)/(w0/s0+w1/s1);
  }
  const l=path[Math.max(0,k-1)],r=path[Math.min(path.length-1,k+1)];return (r.position[d]-l.position[d])/(r.t-l.t);
 };
 return [0,1,2].map(d=>(2*u3-3*u2+1)*a.position[d]+(u3-2*u2+u)*dt*tangent(i-1,d)+(-2*u3+3*u2)*b.position[d]+(u3-u2)*dt*tangent(i,d));
}
