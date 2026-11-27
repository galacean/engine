import type { Point } from './ReferenceContours.ts';
import { inPolygon, type FitBox } from './PolygonCoverage.ts';
/** Bounded fitting controls in target-coordinate units. */
export interface FitOptions { grid:number; minSide:number; maxSide:number; maxAspect:number; maxBoxes:number; target:number }
/** Default study budget; no per-bank or seed-specific overrides. */
export const fitDefaults:FitOptions={grid:3,minSide:12,maxSide:180,maxAspect:4,maxBoxes:160,target:.945};
function largestRectangle(mask:Uint8Array,nx:number,ny:number,min:number,max:number,aspect:number) {
 const heights=new Int32Array(nx);let best={x:0,y:0,w:0,h:0,area:0};
 for(let y=0;y<ny;y++){
  for(let x=0;x<nx;x++)heights[x]=mask[y*nx+x]?heights[x]+1:0;
  const stack:number[]=[];
  for(let x=0;x<=nx;x++){
   const current=x===nx?0:heights[x];
   while(stack.length&&heights[stack.at(-1)!]>current){
    const at=stack.pop()!,start=stack.length?stack.at(-1)!+1:0;
    let h=Math.min(max,heights[at]),w=Math.min(max,x-start);
    h=Math.min(h,Math.floor(w*aspect));w=Math.min(w,Math.floor(h*aspect));
    if(h>=min&&w>=min&&h*w>best.area)best={x:start,y:y-h+1,w,h,area:h*w};
   }stack.push(x);
  }
 }return best;
}
/** Fit an arbitrary simple polygon with rotated rectangles. Candidates are produced
 * in several coordinate frames, then selected by new union coverage. The polygon
 * is never changed or used to clip rectangles. This is a bounded approximation;
 * callers must independently check final area coverage before declaring success.
 * @param ring Target boundary in arbitrary planar units.
 * @param options Rectangle limits and raster search precision.
 * @returns Unclipped OBBs; a budget shortfall remains observable to the caller.
 */
export function fitPolygon(ring:Point[],options:Partial<FitOptions>={}):FitBox[] {
 const o={...fitDefaults,...options};
 if(ring.length<3||o.grid<=0||o.minSide<o.grid||o.maxSide<o.minSide||o.maxAspect<1||o.maxBoxes<1)throw new Error('Invalid polygon fitting budget');
 const candidates:FitBox[]=[];
 for(let degrees=0;degrees<180;degrees+=15){
  const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const rotated=ring.map(p=>({x:p.x*c+p.y*s,y:-p.x*s+p.y*c}));
  const x0=Math.min(...rotated.map(p=>p.x)),y0=Math.min(...rotated.map(p=>p.y));
  const nx=Math.ceil((Math.max(...rotated.map(p=>p.x))-x0)/o.grid),ny=Math.ceil((Math.max(...rotated.map(p=>p.y))-y0)/o.grid);
  const mask=new Uint8Array(nx*ny);
  // All four corners and centre must be inside. Final exact area measurement
  // detects any sub-grid concavity missed by this conservative candidate filter.
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   const a=x0+x*o.grid,b=y0+y*o.grid;
   mask[y*nx+x]=Number([[0,0],[1,0],[1,1],[0,1],[.5,.5]].every(([u,v])=>inPolygon(a+u*o.grid,b+v*o.grid,rotated)));
  }
  for(let k=0;k<240;k++){
   const r=largestRectangle(mask,nx,ny,Math.ceil(o.minSide/o.grid),Math.floor(o.maxSide/o.grid),o.maxAspect);
   if(!r.area)break;
   const x=x0+(r.x+r.w/2)*o.grid,y=y0+(r.y+r.h/2)*o.grid;
   candidates.push({x:x*c-y*s,y:x*s+y*c,width:r.w*o.grid,height:r.h*o.grid,angle});
   for(let yy=r.y;yy<r.y+r.h;yy++)mask.fill(0,yy*nx+r.x,yy*nx+r.x+r.w);
  }
 }
 const x0=Math.min(...ring.map(p=>p.x)),y0=Math.min(...ring.map(p=>p.y));
 const nx=Math.ceil((Math.max(...ring.map(p=>p.x))-x0)/o.grid),ny=Math.ceil((Math.max(...ring.map(p=>p.y))-y0)/o.grid);
 const target=new Uint8Array(nx*ny),covered=new Uint8Array(nx*ny);let total=0;
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)if(inPolygon(x0+(x+.5)*o.grid,y0+(y+.5)*o.grid,ring)){target[y*nx+x]=1;total++;}
 const choices=candidates.map(box=>{
  const cells:number[]=[],c=Math.cos(box.angle),s=Math.sin(box.angle),rx=(Math.abs(c)*box.width+Math.abs(s)*box.height)/2,ry=(Math.abs(s)*box.width+Math.abs(c)*box.height)/2;
  for(let y=Math.max(0,Math.floor((box.y-ry-y0)/o.grid));y<Math.min(ny,Math.ceil((box.y+ry-y0)/o.grid));y++)
   for(let x=Math.max(0,Math.floor((box.x-rx-x0)/o.grid));x<Math.min(nx,Math.ceil((box.x+rx-x0)/o.grid));x++){
    const dx=x0+(x+.5)*o.grid-box.x,dy=y0+(y+.5)*o.grid-box.y,id=y*nx+x;
    if(target[id]&&Math.abs(dx*c+dy*s)<=box.width/2&&Math.abs(-dx*s+dy*c)<=box.height/2)cells.push(id);
   }
  return {box,cells};
 });
 const output:FitBox[]=[];let count=0;
 while(output.length<o.maxBoxes&&count<total*o.target){
  let best=-1,gain=0;
  for(let i=0;i<choices.length;i++){
   const n=choices[i].cells.reduce((sum,id)=>sum+(covered[id]?0:1),0);
   if(n>gain){gain=n;best=i;}
  }
  if(best<0)break;
  const selected=choices.splice(best,1)[0];output.push(selected.box);
  for(const id of selected.cells)if(!covered[id]){covered[id]=1;count++;}
 }
 return output;
}
