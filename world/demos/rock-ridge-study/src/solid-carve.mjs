// BSP solid subtraction, adapted from Evan Wallace's csg.js algorithm.
// https://evanw.github.io/csg.js/ — Copyright (c) 2011 Evan Wallace
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

const carveEpsilon=1e-10;
const carveDot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const carveSub=(a,b)=>a.map((v,k)=>v-b[k]);
const carveCross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const carveUnit=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);};
function carvePolygon(points,tag,plane){
 const loop=points.filter((p,i)=>Math.hypot(...carveSub(p,points[(i+points.length-1)%points.length]))>carveEpsilon);
 if(loop.length<3)return null;
 let area=[0,0,0];for(let i=1;i<loop.length-1;i++){const n=carveCross(carveSub(loop[i],loop[0]),carveSub(loop[i+1],loop[0]));area=area.map((v,k)=>v+n[k]);}
 if(Math.hypot(...area)<1e-20)return null;
 const n=plane?.n||carveUnit(area);return {points:loop,tag,plane:plane||{n,w:carveDot(n,loop[0])}};
}
function carveSplit(poly,plane,same,opposite,front,back){
 const distances=poly.points.map(p=>carveDot(plane.n,p)-plane.w),types=distances.map(d=>d>carveEpsilon?1:d< -carveEpsilon?2:0),kind=types.reduce((a,b)=>a|b,0);
 if(!kind){(carveDot(poly.plane.n,plane.n)>0?same:opposite).push(poly);return;}
 if(kind===1){front.push(poly);return;}if(kind===2){back.push(poly);return;}
 const a=[],b=[];
 for(let i=0;i<poly.points.length;i++){
  const j=(i+1)%poly.points.length,p=poly.points[i],q=poly.points[j];
  if(types[i]!==2)a.push(p);if(types[i]!==1)b.push(p);
  if((types[i]|types[j])===3){const t=distances[i]/(distances[i]-distances[j]),hit=p.map((v,k)=>v+(q[k]-v)*t);a.push(hit);b.push(hit);}
 }
 const pa=carvePolygon(a,poly.tag,poly.plane),pb=carvePolygon(b,poly.tag,poly.plane);if(pa)front.push(pa);if(pb)back.push(pb);
}
class CarveTree{
 constructor(polygons=[]){this.plane=null;this.polygons=[];this.front=null;this.back=null;this.insert(polygons);}
 insert(polygons){
  if(!polygons.length)return;if(!this.plane)this.plane=polygons[0].plane;
  const front=[],back=[];for(const p of polygons)carveSplit(p,this.plane,this.polygons,this.polygons,front,back);
  if(front.length){this.front??=new CarveTree();this.front.insert(front);}if(back.length){this.back??=new CarveTree();this.back.insert(back);}
 }
 flip(){
  this.polygons=this.polygons.map(p=>({...p,points:[...p.points].reverse(),plane:{n:p.plane.n.map(v=>-v),w:-p.plane.w}}));
  if(this.plane)this.plane={n:this.plane.n.map(v=>-v),w:-this.plane.w};this.front?.flip();this.back?.flip();[this.front,this.back]=[this.back,this.front];
 }
 outside(polygons){
  if(!this.plane)return polygons;let front=[],back=[];
  for(const p of polygons)carveSplit(p,this.plane,front,back,front,back);
  if(this.front)front=this.front.outside(front);back=this.back?this.back.outside(back):[];return front.concat(back);
 }
 clip(other){this.polygons=other.outside(this.polygons);this.front?.clip(other);this.back?.clip(other);}
 collect(){return this.polygons.concat(this.front?.collect()||[],this.back?.collect()||[]);}
}
function carveSubtract(source,cutter){
 const body=new CarveTree(source),tool=new CarveTree(cutter);
 body.flip();body.clip(tool);tool.clip(body);tool.flip();tool.clip(body);tool.flip();body.insert(tool.collect());body.flip();return body.collect();
}

// Construct a convex cutter from n.p <= w halfspaces. Its faces, not existing
// rock vertices, define the new surface. Every new face retains its plane tag.
export function convexCarveCutter(halfspaces,firstTag){
 const planes=halfspaces.map(({n,w})=>{const l=Math.hypot(...n);return {n:n.map(v=>v/l),w:w/l};}),points=[];
 for(let i=0;i<planes.length;i++)for(let j=i+1;j<planes.length;j++)for(let k=j+1;k<planes.length;k++){
  const a=planes[i],b=planes[j],c=planes[k],bc=carveCross(b.n,c.n),det=carveDot(a.n,bc);if(Math.abs(det)<1e-9)continue;
  const ca=carveCross(c.n,a.n),ab=carveCross(a.n,b.n),p=bc.map((v,d)=>(v*a.w+ca[d]*b.w+ab[d]*c.w)/det);
  if(planes.every(plane=>carveDot(plane.n,p)<=plane.w+carveEpsilon)&&!points.some(q=>Math.hypot(...carveSub(p,q))<carveEpsilon*2))points.push(p);
 }
 const polygons=[];
 planes.forEach((plane,i)=>{
  const face=points.filter(p=>Math.abs(carveDot(plane.n,p)-plane.w)<carveEpsilon*4);if(face.length<3)return;
  const center=[0,1,2].map(d=>face.reduce((s,p)=>s+p[d],0)/face.length),u=carveUnit(carveSub(face[0],center)),v=carveCross(plane.n,u);
  face.sort((a,b)=>Math.atan2(carveDot(carveSub(a,center),v),carveDot(carveSub(a,center),u))-Math.atan2(carveDot(carveSub(b,center),v),carveDot(carveSub(b,center),u)));
  const poly=carvePolygon(face,firstTag+i,plane);if(poly)polygons.push(poly);
 });
 return {polygons,planes:planes.map((plane,i)=>({...plane,tag:firstTag+i}))};
}

export function carveSolidMesh(positions,indices,cutters){
 const vertices=Array.from({length:positions.length/3},(_,i)=>positions.slice(i*3,i*3+3));
 let polygons=[];for(let i=0;i<indices.length;i+=3){const p=carvePolygon(indices.slice(i,i+3).map(id=>vertices[id]),-i/3-1);if(p)polygons.push(p);}
 for(const cutter of cutters)polygons=carveSubtract(polygons,cutter.polygons);
 return triangulateCarvePolygons(polygons);
}

function triangulateCarvePolygons(polygons){
 const vertices=[],bins=new Map(),tolerance=carveEpsilon*4;
 const key=p=>p.map(v=>Math.floor(v/tolerance)).join(',');
 const vertex=p=>{
  const cell=p.map(v=>Math.floor(v/tolerance));
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const id of bins.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))||[])if(Math.hypot(...carveSub(p,vertices[id]))<tolerance)return id;
  const id=vertices.length;vertices.push(p);const bin=key(p);if(!bins.has(bin))bins.set(bin,[]);bins.get(bin).push(id);return id;
 };
 const loops=polygons.map(p=>p.points.map(vertex)),grid=new Map(),step=.12;
 for(let i=0;i<vertices.length;i++){const key=vertices[i].map(v=>Math.floor(v/step)).join(',');if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);}
 const indices=[],faceTags=[];
 // BSP intersection points must appear on BOTH incident polygon boundaries.
 // Build a conforming polygon mesh before triangulating; no vertices move.
 for(let poly=0;poly<loops.length;poly++){
  const loop=loops[poly],loopVertices=new Set(loop),boundary=[];
  for(let j=0;j<loop.length;j++){
   const a=loop[j],b=loop[(j+1)%loop.length];if(a===b)continue;
   const p=vertices[a],q=vertices[b],d=carveSub(q,p),l2=carveDot(d,d),hits=[{id:a,t:0}],low=p.map((v,k)=>Math.floor((Math.min(v,q[k])-tolerance)/step)),high=p.map((v,k)=>Math.floor((Math.max(v,q[k])+tolerance)/step));
   for(let x=low[0];x<=high[0];x++)for(let y=low[1];y<=high[1];y++)for(let z=low[2];z<=high[2];z++)for(const id of grid.get([x,y,z].join(','))||[]){
    if(loopVertices.has(id))continue;const delta=carveSub(vertices[id],p),t=carveDot(delta,d)/l2;
    if(t<=0||t>=1)continue;if(Math.hypot(...delta.map((v,k)=>v-t*d[k]))<tolerance)hits.push({id,t});
   }
   hits.sort((a,b)=>a.t-b.t);boundary.push(...hits.map(h=>h.id));
  }
  const unique=boundary.filter((v,i)=>v!==boundary[(i+boundary.length-1)%boundary.length]);if(unique.length<3)continue;
  const center=vertex([0,1,2].map(d=>unique.reduce((s,id)=>s+vertices[id][d],0)/unique.length));
  for(let i=0;i<unique.length;i++){const a=unique[i],b=unique[(i+1)%unique.length];if(a===b||a===center||b===center)continue;indices.push(center,a,b);faceTags.push(polygons[poly].tag);}
 }
 return {positions:vertices.flat(),indices,faceTags};
}
