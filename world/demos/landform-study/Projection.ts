import {ROCK_ATOMS} from '@galacean/engine-world-planning/landforms/RockAtoms';
import type {V2Box,V2Point} from '@galacean/engine-world-planning/spatial/V2Model';
import type {Landform} from '@galacean/engine-world-planning/landforms/Landforms';
/** Orthographic view angle; both projections consume the same metre geometry. */
export type View='top'|'oblique';
const palette:Record<string,string>={crown:'#90a9b2',spire:'#829eb8','crown/spire':'#839db0',wall:'#b9c3c8','buttress/shoulder':'#a7b8ae','terrace/cap':'#c9c7b6','saddle/notch':'#b9acc4',skirt:'#c4cebb',mass:'#bbc3c5'};
const shade=(hex:string,f:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*f).toString(16).padStart(2,'0')).join('');
/** Render real 3D OBB faces with orthographic projection, not an image-generation mockup.
 * @param form Shared world geometry.
 * @param view Top (90 degrees) or oblique (45 degrees).
 * @returns SVG including metre grid, derived footprint and reference passage.
 */
export function renderLandform(form:Landform,view:View,labels:Partial<Record<keyof typeof ROCK_ATOMS,string>>={}):string {
 const angle=view==='top'?Math.PI/2:Math.PI/4,azimuth=view==='top'?0:-.25,c=Math.cos(azimuth),s=Math.sin(azimuth);
 const project=(x:number,y:number,z:number)=>({x:c*x-s*z,y:(s*x+c*z)*Math.sin(angle)-y*Math.cos(angle)});
 const vertices=(b:V2Box)=>{const ca=Math.cos(b.yaw),sa=Math.sin(b.yaw);return [0,1].flatMap(up=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>({x:b.center.x+ca*u*b.sizeX/2-sa*v*b.sizeZ/2,y:(b.elevation??0)+up*b.sizeY,z:b.center.z+sa*u*b.sizeX/2+ca*v*b.sizeZ/2})));};
 const all=form.boxes.flatMap(vertices),xs=all.map(p=>p.x),zs=all.map(p=>p.z);
 for(const p of form.passages.flatMap(p=>p.points)){xs.push(p.x);zs.push(p.z);}
 const xmin=Math.floor((Math.min(...xs)-12)/10)*10,xmax=Math.ceil((Math.max(...xs)+12)/10)*10,zmin=Math.floor((Math.min(...zs)-12)/10)*10,zmax=Math.ceil((Math.max(...zs)+12)/10)*10;
 const ground=[{x:xmin,z:zmin},{x:xmax,z:zmin},{x:xmax,z:zmax},{x:xmin,z:zmax}];
 const screen=[...all.map(p=>project(p.x,p.y,p.z)),...ground.map(p=>project(p.x,0,p.z))];
 const minx=Math.min(...screen.map(p=>p.x)),maxx=Math.max(...screen.map(p=>p.x)),miny=Math.min(...screen.map(p=>p.y)),maxy=Math.max(...screen.map(p=>p.y));
 const W=720,H=390,scale=Math.min((W-60)/(maxx-minx),(H-70)/(maxy-miny));
 const map=(x:number,y:number,z:number)=>{const p=project(x,y,z);return {x:W/2+(p.x-(minx+maxx)/2)*scale,y:H/2-6+(p.y-(miny+maxy)/2)*scale};};
 const points=(ps:{x:number;y?:number;z:number}[])=>ps.map(p=>{const q=map(p.x,p.y??0,p.z);return `${q.x.toFixed(2)},${q.y.toFixed(2)}`;}).join(' ');
 let body=`<rect width="720" height="390" fill="#eef0e9"/><polygon points="${points(ground)}" fill="#e1e6da" stroke="#c1ccb9"/>`;
 for(let x=xmin;x<=xmax;x+=10)body+=`<polyline points="${points([{x,z:zmin},{x,z:zmax}])}" stroke="#cbd4c4" stroke-width=".65"/>`;
 for(let z=zmin;z<=zmax;z+=10)body+=`<polyline points="${points([{x:xmin,z},{x:xmax,z}])}" stroke="#cbd4c4" stroke-width=".65"/>`;
 for(const p of form.passages)body+=`<polyline points="${points(p.points)}" fill="none" stroke="#79b9c3" stroke-opacity=".18" stroke-width="${p.width*scale*Math.sin(angle)}"/><polyline points="${points(p.points)}" fill="none" stroke="#5197ac" stroke-width="1.3" stroke-dasharray="5 5"/>`;
 const faces:{depth:number;html:string}[]=[];
 for(const atom of form.atoms)for(const box of atom.boxes){
  const v=vertices(box),ca=Math.cos(box.yaw),sa=Math.sin(box.yaw),look={x:s*Math.cos(angle),y:Math.sin(angle),z:c*Math.cos(angle)};
  const defs=[{ids:[4,5,6,7],normal:[0,1,0],light:1},{ids:[0,1,5,4],normal:[sa,0,-ca],light:.70},{ids:[1,2,6,5],normal:[ca,0,sa],light:.84},{ids:[2,3,7,6],normal:[-sa,0,ca],light:.80},{ids:[3,0,4,7],normal:[-ca,0,-sa],light:.66}];
  for(const face of defs){
   if(face.normal[0]*look.x+face.normal[1]*look.y+face.normal[2]*look.z<1e-8)continue;
   const ps=face.ids.map(i=>v[i]),depth=ps.reduce((n,p)=>n+p.x*look.x+p.y*look.y+p.z*look.z,0)/4;
   faces.push({depth,html:`<polygon data-atom="${atom.id}" data-box="${box.id}" points="${points(ps)}" fill="${shade(palette[atom.kind],face.light)}" stroke="#51626a" stroke-width=".65"><title>${labels[atom.kind]??ROCK_ATOMS[atom.kind].label} · ${atom.width.toFixed(1)} × ${atom.depth.toFixed(1)} × ${atom.height.toFixed(1)} m</title></polygon>`});
  }
 }
 body+=faces.sort((a,b)=>a.depth-b.depth).map(f=>f.html).join('');
 for(const r of form.outlines)body+=`<polygon points="${points(r)}" fill="none" stroke="#9d6daf" stroke-width="1.2" stroke-dasharray="5 4" opacity=".85" pointer-events="none"/>`;
 for(const mark of form.marks){const p=map(mark.x,0,mark.z);body+=`<text x="${p.x}" y="${p.y}" text-anchor="middle" font-size="13" fill="#244b59" stroke="#eef0e9" stroke-width="3" paint-order="stroke" font-weight="600" pointer-events="none">${mark.text}</text>`;}
 const person=form.passages[0]?.points[0]??{x:xmin+6,z:zmin+6},bottom=map(person.x,0,person.z),top=map(person.x,1.8,person.z);
 body+=`<line x1="${bottom.x}" y1="${bottom.y}" x2="${top.x}" y2="${top.y}" stroke="#c07b38" stroke-width="3"/><circle cx="${top.x}" cy="${top.y-2}" r="2.2" fill="#c07b38"/>`;
 const bar=20*scale;
 body+=`<g font-family="system-ui" fill="#50616a" font-size="11"><text x="18" y="23">${view==='top'?'俯瞰 · 90°':'正交俯瞰 · 45°'} / 米制 OBB</text><text x="18" y="372">10 m 网格 · 人体参照 1.8 m</text><path d="M ${W-24-bar} 353 v 5 h ${bar} v -5" fill="none" stroke="#50616a" stroke-width="1.5"/><text x="${W-24-bar/2}" y="374" text-anchor="middle">20 m</text></g>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${form.label}${view==='top'?'俯瞰图':'45度俯瞰图'}">${body}</svg>`;
}
