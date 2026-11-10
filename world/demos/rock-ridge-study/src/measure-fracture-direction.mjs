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
