import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";

export const buildingGenerationPlan = { parameters: { seed: 1, width: 128, depth: 128 }, authoredResources: [], buildings: [
  { id:"a",center:{x:20,z:20},width:8,depth:6,height:6,yaw:.4 },
  { id:"a-b",center:{x:25,z:20},width:8,depth:6,height:6,yaw:.4 },
  { id:"round",center:{x:50,z:25},width:7,depth:7,height:10,yaw:.3 },
  ...Array.from({length:12},(_,i)=>({id:"variant-"+i,center:{x:10+i*10,z:55},width:8,depth:7,height:6,yaw:0}))
], fences:[{id:"fence",center:{x:20,z:80},sizeX:8,sizeZ:.2,sizeY:1.3,yaw:.5}],
  courtyards:[{regionId:"yard",fences:[{id:"wall",center:{x:35,z:80},sizeX:.3,sizeZ:7,sizeY:1.7,yaw:-.2}]}]
} as unknown as IslandPlan;
