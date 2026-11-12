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

export const CARVE_VERSION='bsp-runtime-optimization-1';
const carveEpsilon=1e-10;
const carveDot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const carveSub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const carveCross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const carveUnit=a=>{const l=Math.hypot(a[0],a[1],a[2]);return [a[0]/l,a[1]/l,a[2]/l];};
function carvePolygon(points,tag,plane){
 const loop=[];let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
 for(let i=0;i<points.length;i++){
  const p=points[i],q=points[(i+points.length-1)%points.length];
  if(Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2])>carveEpsilon){
   loop.push(p);minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);minZ=Math.min(minZ,p[2]);
   maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);maxZ=Math.max(maxZ,p[2]);
  }
 }
 if(loop.length<3)return null;
 let ax=0,ay=0,az=0;const p=loop[0];
 for(let i=1;i<loop.length-1;i++){
  const b=loop[i],c=loop[i+1],ux=b[0]-p[0],uy=b[1]-p[1],uz=b[2]-p[2],vx=c[0]-p[0],vy=c[1]-p[1],vz=c[2]-p[2];
  ax+=uy*vz-uz*vy;ay+=uz*vx-ux*vz;az+=ux*vy-uy*vx;
 }
 const area=[ax,ay,az];if(Math.hypot(ax,ay,az)<1e-20)return null;
 const n=plane?.n||carveUnit(area);return {points:loop,tag,plane:plane||{n,w:carveDot(n,loop[0])},bounds:[minX,minY,minZ,maxX,maxY,maxZ]};
}
function carveSplit(poly,plane,same,opposite,front,back){
 // A bounding box wholly on one side proves the same classification as testing
 // every vertex. Boxes crossing the plane still use the exact vertex test.
 const n=plane.n,bounds=poly.bounds,x=n[0]>=0?0:3,y=n[1]>=0?1:4,z=n[2]>=0?2:5;
 if(n[0]*bounds[x]+n[1]*bounds[y]+n[2]*bounds[z]-plane.w>carveEpsilon){front.push(poly);return;}
 if(n[0]*bounds[(x+3)%6]+n[1]*bounds[(y+3)%6]+n[2]*bounds[(z+3)%6]-plane.w< -carveEpsilon){back.push(poly);return;}
 const count=poly.points.length;let kind=0;
 // Most visits classify a polygon wholly to one side. Only a spanning polygon
 // needs per-vertex distance/type arrays; keep those allocations off that path.
 for(let i=0;i<count;i++){
  const d=carveDot(plane.n,poly.points[i])-plane.w,type=d>carveEpsilon?1:d< -carveEpsilon?2:0;
  kind|=type;if(kind===3)break;
 }
 if(!kind){(carveDot(poly.plane.n,plane.n)>0?same:opposite).push(poly);return;}
 if(kind===1){front.push(poly);return;}if(kind===2){back.push(poly);return;}
 const distances=new Array(count),types=new Array(count);
 for(let i=0;i<count;i++){const d=carveDot(plane.n,poly.points[i])-plane.w;distances[i]=d;types[i]=d>carveEpsilon?1:d< -carveEpsilon?2:0;}
 const a=[],b=[];
 for(let i=0;i<poly.points.length;i++){
  const j=(i+1)%poly.points.length,p=poly.points[i],q=poly.points[j];
  if(types[i]!==2)a.push(p);if(types[i]!==1)b.push(p);
  if((types[i]|types[j])===3){const t=distances[i]/(distances[i]-distances[j]),hit=[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,p[2]+(q[2]-p[2])*t];a.push(hit);b.push(hit);}
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
 outside(polygons,output=[]){
  // Empty branches cannot contribute a polygon. Accumulate in the same front /
  // back order instead of recursively copying concatenated polygon arrays.
  if(!polygons.length)return output;
  if(!this.plane){for(const p of polygons)output.push(p);return output;}
  const front=[],back=[];
  for(const p of polygons)carveSplit(p,this.plane,front,back,front,back);
  if(this.front)this.front.outside(front,output);else for(const p of front)output.push(p);
  if(this.back)this.back.outside(back,output);return output;
 }
 clip(other){this.polygons=other.outside(this.polygons);this.front?.clip(other);this.back?.clip(other);}
 collect(output=[]){for(const p of this.polygons)output.push(p);this.front?.collect(output);this.back?.collect(output);return output;}
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

// A single closed fracture with a piecewise-linear tip path. Fixed, unequal
// wedge angles make each wall quad planar even as its center and depth change.
// Adjacent sections share their entire ring: there are no internal end caps.
export function sweptCarveCutter(sections,n,opening,firstTag){
 const t=[-n[1],n[0]],outer=3,point=(r,y,c)=>[n[0]*r+t[0]*c,y,n[1]*r+t[1]*c];
 const rings=sections.map(s=>[point(s.tip,s.y,s.center),point(outer,s.y,s.center+opening[0]*(outer-s.tip)),point(outer,s.y,s.center-opening[1]*(outer-s.tip))]);
 const polygons=[],planes=[],regions=[];
 const add=(points,role)=>{const tag=firstTag+planes.length,p=carvePolygon(points,tag);if(!p)throw new Error('Empty fracture face');for(const q of points)if(Math.abs(carveDot(p.plane.n,q)-p.plane.w)>1e-9)throw new Error('Nonplanar fracture wall');polygons.push(p);planes.push({...p.plane,tag,role});return p.plane;};
 add([...rings[0]].reverse(),'end');
 for(let i=1;i<rings.length;i++){
  const walls=[];for(let j=0;j<3;j++)walls.push(add([rings[i-1][j],rings[i-1][(j+1)%3],rings[i][(j+1)%3],rings[i][j]],j===1?'back':'wall'));
  regions.push([...walls,{n:[0,-1,0],w:-sections[i-1].y},{n:[0,1,0],w:sections[i].y}]);
 }
 add(rings.at(-1),'end');return {polygons,planes,regions};
}

export function carveSolidMesh(positions,indices,cutters){
 const vertices=Array.from({length:positions.length/3},(_,i)=>positions.slice(i*3,i*3+3));
 let polygons=[];for(let i=0;i<indices.length;i+=3){const p=carvePolygon(indices.slice(i,i+3).map(id=>vertices[id]),-i/3-1);if(p)polygons.push(p);}
 for(const cutter of cutters)polygons=carveSubtract(polygons,cutter.polygons);
 return triangulateCarvePolygons(polygons);
}

// Numeric cell coordinates preserve the existing neighboring-cell search order
// without allocating a string and temporary coordinate array for every lookup.
function carveGridPush(grid,x,y,z,id){
 let column=grid.get(x);if(!column){column=new Map();grid.set(x,column);}
 let row=column.get(y);if(!row){row=new Map();column.set(y,row);}
 let cell=row.get(z);if(!cell){cell=[];row.set(z,cell);}cell.push(id);
}
function triangulateCarvePolygons(polygons){
 const vertices=[],bins=new Map(),tolerance=carveEpsilon*4;
 const vertex=p=>{
  const cx=Math.floor(p[0]/tolerance),cy=Math.floor(p[1]/tolerance),cz=Math.floor(p[2]/tolerance);
  for(let x=-1;x<=1;x++){
   const column=bins.get(cx+x);if(!column)continue;
   for(let y=-1;y<=1;y++){
    const row=column.get(cy+y);if(!row)continue;
    for(let z=-1;z<=1;z++){
     const cell=row.get(cz+z);if(!cell)continue;
     for(const id of cell){const q=vertices[id];if(Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2])<tolerance)return id;}
    }
   }
  }
  const id=vertices.length;vertices.push(p);carveGridPush(bins,cx,cy,cz,id);return id;
 };
 const loops=polygons.map(p=>p.points.map(vertex)),grid=new Map(),step=.12;
 for(let i=0;i<vertices.length;i++){const p=vertices[i];carveGridPush(grid,Math.floor(p[0]/step),Math.floor(p[1]/step),Math.floor(p[2]/step),i);}
 const indices=[],faceTags=[];
 // BSP intersection points must appear on BOTH incident polygon boundaries.
 // Build a conforming polygon mesh before triangulating; no vertices move.
 for(let poly=0;poly<loops.length;poly++){
  const loop=loops[poly],loopVertices=new Set(loop),boundary=[];
  for(let j=0;j<loop.length;j++){
   const a=loop[j],b=loop[(j+1)%loop.length];if(a===b)continue;
   const p=vertices[a],q=vertices[b],dx=q[0]-p[0],dy=q[1]-p[1],dz=q[2]-p[2],l2=dx*dx+dy*dy+dz*dz,hits=[{id:a,t:0}];
   const lx=Math.floor((Math.min(p[0],q[0])-tolerance)/step),ly=Math.floor((Math.min(p[1],q[1])-tolerance)/step),lz=Math.floor((Math.min(p[2],q[2])-tolerance)/step);
   const hx=Math.floor((Math.max(p[0],q[0])+tolerance)/step),hy=Math.floor((Math.max(p[1],q[1])+tolerance)/step),hz=Math.floor((Math.max(p[2],q[2])+tolerance)/step);
   for(let x=lx;x<=hx;x++){
    const column=grid.get(x);if(!column)continue;
    for(let y=ly;y<=hy;y++){
     const row=column.get(y);if(!row)continue;
     for(let z=lz;z<=hz;z++){
      const cell=row.get(z);if(!cell)continue;
      for(const id of cell){
       if(loopVertices.has(id))continue;const v=vertices[id],vx=v[0]-p[0],vy=v[1]-p[1],vz=v[2]-p[2],t=(vx*dx+vy*dy+vz*dz)/l2;
       if(t<=0||t>=1)continue;if(Math.hypot(vx-t*dx,vy-t*dy,vz-t*dz)<tolerance)hits.push({id,t});
      }
     }
    }
   }
   hits.sort((a,b)=>a.t-b.t);boundary.push(...hits.map(h=>h.id));
  }
  const unique=boundary.filter((v,i)=>v!==boundary[(i+boundary.length-1)%boundary.length]);if(unique.length<3)continue;
  let x=0,y=0,z=0;for(const id of unique){const p=vertices[id];x+=p[0];y+=p[1];z+=p[2];}
  const center=vertex([x/unique.length,y/unique.length,z/unique.length]);
  for(let i=0;i<unique.length;i++){const a=unique[i],b=unique[(i+1)%unique.length];if(a===b||a===center||b===center)continue;indices.push(center,a,b);faceTags.push(polygons[poly].tag);}
 }
 return {positions:vertices.flat(),indices,faceTags};
}
