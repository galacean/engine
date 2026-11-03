import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const directory=path.dirname(fileURLToPath(import.meta.url));
/** Read a JSON study asset relative to this module. */
export const read=(name)=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
/** Persist a JSON study asset with its parent directory. */
export const write=(name,value)=>{fs.mkdirSync(path.dirname(path.join(directory,name)),{recursive:true});fs.writeFileSync(path.join(directory,name),JSON.stringify(value,null,2)+'\n');};
/** Read measured color extraction for one source image. */
export function source(id){return read(`reference-data/${id}.json`);}
/** Map image pixels to centered world metres without aspect distortion. */
export function mapPoint(data,x,y,height){const scale=data.world.longestSideMetres/Math.max(data.source.width,data.source.height);const p={x:+((x-data.source.width/2)*scale).toFixed(3),z:+((y-data.source.height/2)*scale).toFixed(3)};return height===undefined?p:{...p,y:height};}
/** Create an empty explicit native recipe for the planning study. */
export function baseRecipe(id){return {version:2,algorithm:'layout-2.0',seed:1729+Number(id.slice(1)),size:1024,resolution:513,alphamapResolution:512,baseHeight:0,roughness:0,noiseScale:200,spawn:{x:0,z:0,yaw:0,elevation:0},player:{radius:0.4,eyeHeight:1.7,maxSlope:0.7,speed:2},riverScale:1,profile:{id:'semantic-study',label:'语义规划',elevation:[0,0],riverWidth:[6,100],meander:[0,100],boxHeight:[5,120],roughness:[0,0]},elevations:[],riverNodes:[],rivers:[],lakes:[],groups:[],canyons:[],boxes:[],pois:[],routeNodes:[],routes:[],views:[]};}
function segmentDistance(p,a,b){let dx=b.x-a.x,dz=b.z-a.z;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
function simplifyOpen(points,epsilon){if(points.length<=2)return points;let far=0,index=0;for(let i=1;i<points.length-1;i++){const d=segmentDistance(points[i],points[0],points.at(-1));if(d>far){far=d;index=i;}}return far>epsilon?[...simplifyOpen(points.slice(0,index+1),epsilon).slice(0,-1),...simplifyOpen(points.slice(index),epsilon)]:[points[0],points.at(-1)];}
/** Simplify a closed contour with a recorded geometric tolerance. */
export function simplifyRing(points,epsilon=3){let far=1;for(let i=1;i<points.length;i++)if(Math.hypot(points[i].x-points[0].x,points[i].z-points[0].z)>Math.hypot(points[far].x-points[0].x,points[far].z-points[0].z))far=i;let result=[...simplifyOpen(points.slice(0,far+1),epsilon).slice(0,-1),...simplifyOpen([...points.slice(far),points[0]],epsilon).slice(0,-1)];if(result.length>110)return simplifyRing(points,epsilon*1.4);return result;}
/** Measure absolute polygon area in square metres. */
export function area(points){return Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.z-q.x*p.z;},0)/2);}
/** Measure maximum original-vertex distance to the simplified boundary. */
export function deviation(original,simplified){return Math.max(...original.map(p=>Math.min(...simplified.map((a,i)=>segmentDistance(p,a,simplified[(i+1)%simplified.length])))));}
/** Convert one extracted contour to an authored column mass and provenance. */
export function massFromRegion(data,region,height,{id=region.id,label=region.id,cellSize=24,profile=[0.7,0.9,1,0.85,0.65],holes=false}={}){const ring=region.polygons[0].worldOutline;const outline=simplifyRing(ring);const mass={id,label,outline,height,baseY:0,cellSize,profile};if(holes)mass.holes=(region.polygons[0].holes||[]).filter(h=>area(h.worldOutline)>200).map(h=>simplifyRing(h.worldOutline));return {mass,provenance:{sourceRegion:region.id,sourceHash:data.source.sha256,verticesBefore:ring.length,verticesAfter:outline.length,maximumVertexDeviation:deviation(ring,outline),areaBefore:area(ring),areaAfter:area(outline),height:'authored; not inferred from color'}};}
/** Create a shared definition with input provenance. */
export function newDefinition(id,title,prompt){return {id,title,prompt,recipe:baseRecipe(id),masses:[],viewpoints:[],controls:[],provenance:{extraction:'HSV masks and contour tracing; topology/height/observer semantics assisted by AI',massMappings:[],annotations:[],limitations:[]}};}
/** Append a shared route anchor with an explicit elevation. */
export function addNode(def,id,label,p,y=0){def.recipe.routeNodes.push({id,label,position:{x:p.x,z:p.z},elevation:y});return id;}
/** Append a route referencing its actual shared endpoints. */
export function addRoute(def,id,label,from,to,points,kind='main-road',width=5,heights){def.recipe.routes.push({id,label,from,to,controls:points.map(p=>({x:p.x,z:p.z})),width,maxSlope:0.7,bendPenalty:1,kind,...(heights?{pointElevations:heights}:{} )});return id;}
/** Append a place with activity footprint and a separate entrance reference. */
export function addPOI(def,id,label,p,y,nodeId,routeId,radius=10){const outline=[{x:p.x-radius,z:p.z-radius},{x:p.x+radius,z:p.z-radius},{x:p.x+radius,z:p.z+radius},{x:p.x-radius,z:p.z+radius}];def.recipe.pois.push({id,label,position:{x:p.x,z:p.z},radius,markerHeight:1.5,markerWidth:2,elevation:y,purpose:label,outline,entrances:[{id:id+'-entry',routeNodeId:nodeId,position:{x:p.x,z:p.z}}],activityAreas:[{id:id+'-area',label:'停留区',purpose:'观景',outline}],arrivalRouteIds:[routeId]});return id;}
/** Bind a semantic scalar to existing numeric fields atomically. */
export function addControl(def,id,label,path,min,max,step=1,extra=[]){def.controls.push({id,label,unit:'m',min,max,step,bindings:[{path},...extra]});}
/** Append an explicit observer and look-at point. */
export function addView(def,id,label,position,target){def.viewpoints.push({id,label,position,target});}
