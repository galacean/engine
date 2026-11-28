import type { Point } from './ReferenceContours.ts';
/** Oriented rectangle in the same coordinate system as its target polygon. */
export interface FitBox { x:number; y:number; width:number; height:number; angle:number }
/** Rectangle corners; angle is in radians. */
export function boxRing(b:FitBox):Point[] {
 const c=Math.cos(b.angle),s=Math.sin(b.angle);
 return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>({x:b.x+u*b.width/2*c-v*b.height/2*s,y:b.y+u*b.width/2*s+v*b.height/2*c}));
}
/** Even-odd point membership for a simple closed polygon. */
export function inPolygon(x:number,y:number,ring:Point[]):boolean {
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
type Edge = [Point,Point];
const edges=(r:Point[]):Edge[]=>r.map((p,i)=>[p,r[(i+1)%r.length]]);
function intervals(r:Point[],y:number):number[][] {
 const xs:number[]=[];
 for(const [a,b] of edges(r))if((a.y>y)!==(b.y>y))xs.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));
 xs.sort((a,b)=>a-b);const spans:number[][]=[];
 for(let i=0;i+1<xs.length;i+=2)spans.push([xs[i],xs[i+1]]);
 return spans;
}
function merge(spans:number[][]):number[][] {
 const out:number[][]=[];
 for(const s of spans.sort((a,b)=>a[0]-b[0])){
  const last=out.at(-1);if(last&&s[0]<=last[1])last[1]=Math.max(last[1],s[1]);else out.push([...s]);
 }return out;
}
/** Exact polygonal area integration (floating-point tolerance), independent of the
 * raster used by the fitter. Splits at every vertex and edge intersection so interval
 * lengths are linear within each slab. Overlapping boxes are counted only once.
 * @param target Simple target ring, without holes.
 * @param boxes Unclipped output rectangles.
 * @returns Coverage, leakage relative to box union, IoU, and raw areas.
 */
export function measureCoverage(target:Point[],boxes:FitBox[]) {
 const rings=boxes.map(boxRing),all=[target,...rings],es=all.flatMap(edges);
 const ys=all.flatMap(r=>r.map(p=>p.y));
 for(let i=0;i<es.length;i++)for(let j=i+1;j<es.length;j++){
  const [a,b]=es[i],[c,d]=es[j],ux=b.x-a.x,uy=b.y-a.y,vx=d.x-c.x,vy=d.y-c.y;
  const den=ux*vy-uy*vx;if(Math.abs(den)<1e-10)continue;
  const dx=c.x-a.x,dy=c.y-a.y,t=(dx*vy-dy*vx)/den,u=(dx*uy-dy*ux)/den;
  if(t>0&&t<1&&u>0&&u<1)ys.push(a.y+t*uy);
 }
 ys.sort((a,b)=>a-b);let targetArea=0,unionArea=0,intersectionArea=0;
 for(let i=1;i<ys.length;i++){
  const h=ys[i]-ys[i-1];if(h<1e-9)continue;
  const y=(ys[i]+ys[i-1])/2,a=intervals(target,y),b=merge(rings.flatMap(r=>intervals(r,y)));
  targetArea+=h*a.reduce((sum,[l,r])=>sum+r-l,0);
  unionArea+=h*b.reduce((sum,[l,r])=>sum+r-l,0);
  for(const [l,r] of a)for(const [u,v] of b)intersectionArea+=h*Math.max(0,Math.min(r,v)-Math.max(l,u));
 }
 const outsideArea=Math.max(0,unionArea-intersectionArea);
 return {targetArea,unionArea,intersectionArea,outsideArea,coverage:targetArea?intersectionArea/targetArea:0,leakage:unionArea?outsideArea/unionArea:0,iou:targetArea+outsideArea?intersectionArea/(targetArea+outsideArea):0};
}
