import type {IslandPlan,PlanPoint} from '@galacean/engine-world-planning/semantic-study/IslandPlanModel';
import {createPlanningGroundSampler} from '@galacean/engine-world-planning/semantic-study/WorldPlanningTerrain';
/** Explicit station inputs; structural variants are comparable in the same metre world. */
export interface ZooStation {label:string;spawn:PlanPoint}
/** Build doors, passage widths, stairs, elevated gaps and distance references over unchanged FBM. */
export function buildMetricsZoo():{plan:IslandPlan;stations:ZooStation[]}{
 const plan:IslandPlan={landformStudy:true,mode:'base-map',parameters:{width:160,depth:160,valleyWidth:0,riverWidth:0,mountainHeight:0,seed:1},land:[{x:0,z:0},{x:160,z:0},{x:160,z:160},{x:0,z:160}],islands:[],rocks:[],mountains:[],waters:[],routes:[],places:[],bridges:[],sights:[],spawn:{x:25,z:42},prompt:'米制白盒测试场',regions:[],buildings:[],ridges:[],supports:[],slopes:[],raster:{heightSamples:161,alphaSamples:1024,spacing:1}};
 const sample=createPlanningGroundSampler(plan),stations:ZooStation[]=[];
 const box=(id:string,x:number,z:number,w:number,d:number,h:number,base:number)=>{plan.buildings.push({id,regionId:id,center:{x,z},width:w,depth:d,height:h,baseHeight:base,yaw:0,outline:[{x:x-w/2,z:z-d/2},{x:x+w/2,z:z-d/2},{x:x+w/2,z:z+d/2},{x:x-w/2,z:z+d/2}]});};
 // Each station has a level reference slab above FBM, so noise cannot confound its measurement.
 const slab=(id:string,x:number,z:number,w:number,d:number)=>{const top=Math.max(...[{x:x-w/2,z:z-d/2},{x:x+w/2,z:z+d/2},{x,z}].map(sample))+1;box(id,x,z,w,d,top,0);return top;};
 for(const [i,width] of [.8,1.25,2,4].entries()){const x=20+i*16,z=30,base=slab('corridor-floor-'+i,x,z,12,26);box('wall-left-'+i,x-width/2-.25,z,.5,16,3,base);box('wall-right-'+i,x+width/2+.25,z,.5,16,3,base);stations.push({label:`通道 ${width} m × 3 m`,spawn:{x,z:42}});}
 for(const [i,height] of [1.5,1.8,2.5,4].entries()){const x=20+i*16,z=68,base=slab('door-floor-'+i,x,z,12,20);box('door-left-'+i,x-2,z,2.75,1,5,base);box('door-right-'+i,x+2,z,2.75,1,5,base);box('door-head-'+i,x,z,1.25,1,5-height,base+height);stations.push({label:`门洞 1.25 m × ${height} m`,spawn:{x,z:75}});}
 for(const [i,rise] of [.15,.3,.5,.8].entries()){const x=20+i*16,z=106,base=slab('stairs-floor-'+i,x,z,12,22);for(let step=0;step<6;step++)box(`step-${i}-${step}`,x,110-step,3,1,rise*(step+1),base);stations.push({label:`台阶高 ${rise} m / 深 1 m`,spawn:{x,z:115}});}
 for(const [i,gap] of [1,2,4,6].entries()){const x=108+i*12,z=65,base=18;box('takeoff-'+i,x,z+6,8,8,base,0);box('landing-'+i,x,z-2-gap,8,8,base,0);stations.push({label:`跳跃间距 ${gap} m`,spawn:{x,z:z+6}});}
 for(const [i,height] of [2,5,10,20].entries())box('scale-'+i,105+i*13,110,4,4,height,sample({x:105+i*13,z:110}));
 stations.push({label:'2 / 5 / 10 / 20 m 高度参照',spawn:{x:125,z:140}});stations.push({label:'FBM 地面 / 100 m 距离',spawn:{x:95,z:145}});
 plan.routes.push({id:'100m-track',label:'100 米直线',from:'track-start',to:'track-end',kind:'main',points:[{x:95,z:145},{x:95,z:45}],width:2});
 for(let metres=0;metres<=100;metres+=10)box('distance-'+metres,97,145-metres,.2,.2,metres%50===0?2:1,sample({x:97,z:145-metres}));
 plan.spawn={...stations[2].spawn};return {plan,stations};
}
