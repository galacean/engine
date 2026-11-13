// Measure joint contours on the rendered mesh, rather than inspecting the
// noise parameters. Exclude the pinned foot/crown and near-horizontal caps.
export function measureFractureDirection(g){
 const lower=g.bounds[0][1],height=g.bounds[1][1]-lower,segments=[];
 for(let i=0;i<g.indices.length;i+=3){
  const ids=g.indices.slice(i,i+3),p=ids.map(k=>g.positions.slice(k*3,k*3+3)),s=ids.map(k=>g.rockDetail[k*3]);
  const a=p[1].map((v,d)=>v-p[0][d]),b=p[2].map((v,d)=>v-p[0][d]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  if(Math.abs(n[1])/Math.hypot(...n)>.55)continue;
  const hits=[];
  for(let j=0;j<3;j++){
   const k=(j+1)%3;if((s[j]>.5)===(s[k]>.5))continue;
   const t=(.5-s[j])/(s[k]-s[j]);hits.push(p[j].map((v,d)=>v+(p[k][d]-v)*t));
  }
  if(hits.length!==2)continue;
  const y=((hits[0][1]+hits[1][1])*.5-lower)/height;if(y<.24||y>.88)continue;
  const d=hits[1].map((v,j)=>v-hits[0][j]),length=Math.hypot(...d);if(length<1e-7)continue;
  segments.push({length,vertical:Math.abs(d[1])/length});
 }
 const length=segments.reduce((n,s)=>n+s.length,0);
 return {segments:segments.length,contourLengthM:length,within30DegreesOfVertical:length?segments.filter(s=>s.vertical>=Math.cos(Math.PI/6)).reduce((n,s)=>n+s.length,0)/length:0,meanVerticalAlignment:length?segments.reduce((n,s)=>n+s.length*s.vertical,0)/length:0};
}

// Physical mouth edges, independent of tessellation and the interpolated dark
// joint mask. On a rounded shoulder, up means world up projected onto the body
// face: following its curvature must not count as a sideways/random fracture.
export function measureFractureSeams(g){
 const edges=new Map(),planes=new Map(g.surface.cutPlanes.map(p=>[p.tag,p]));
 for(let i=0;i<g.indices.length;i+=3)for(let j=0;j<3;j++){
  const a=g.indices[i+j],b=g.indices[i+(j+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);
  if(!edges.has(key))edges.set(key,[]);edges.get(key).push(i/3);
 }
 const point=id=>g.positions.slice(id*3,id*3+3),segments=[];
 for(const [key,faces] of edges){
  if(faces.length!==2)continue;
  const body=faces.find(i=>g.faceTags[i]<0),cut=faces.find(i=>planes.get(g.faceTags[i])?.kind==='joint');
  if(body===undefined||cut===undefined)continue;
  const [a,b,c]=g.indices.slice(body*3,body*3+3).map(point),u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],ny=n[1]/Math.hypot(...n);
  if(Math.abs(ny)>.55)continue;
  const [p,q]=key.split(':').map(Number).map(point),y=((p[1]+q[1])/2-g.bounds[0][1])/(g.bounds[1][1]-g.bounds[0][1]);
  if(y<.24||y>.88)continue;
  const d=q.map((v,i)=>v-p[i]),length=Math.hypot(...d);if(length<1e-7)continue;
  segments.push({length,vertical:Math.min(1,Math.abs(d[1])/length/Math.sqrt(1-ny*ny))});
 }
 const length=segments.reduce((s,p)=>s+p.length,0);
 return {metric:'physical mouth edges relative to surface up',segments:segments.length,contourLengthM:length,
  within30DegreesOfVertical:length?segments.filter(s=>s.vertical>=Math.cos(Math.PI/6)).reduce((s,p)=>s+p.length,0)/length:0,
  meanVerticalAlignment:length?segments.reduce((s,p)=>s+p.length*p.vertical,0)/length:0};
}
