const { area } = require("./cases.cjs");
const cases = [];
const plot =
  area +
  'const plots=await system.queryPlots({farmId});const plot=plots.value.find(x=>x.label==="B1")??plots.value[0];if(!plot)throw Error("No plot");const plotId=plot.plotId;const target={groundId:plot.groundId,cellX:plot.cellX,cellZ:plot.cellZ};';
const item =
  area +
  'const items=await system.queryItems({farmId});const item=items.value.find(x=>x.type==="watering-can");if(!item)throw Error("No watering can");';
const named =
  area +
  'const plots=await system.queryPlots({farmId});const plot=plots.value.find(x=>x.label==="Audit Plot");if(!plot)throw Error("No audit plot");const plotId=plot.plotId;';
function add(method, source, verify, extra = {}) {
  cases.push({
    id: "farm." + method,
    tool: "editorComponents.FarmingSystem.methods." + method,
    source,
    ...(verify ? { verify } : {}),
    ...extra
  });
}
add(
  "getPlot",
  plot +
    'const r=await system.getPlot({farmId,plotId});if(!r.value||r.value.plotId!==plotId)throw Error("Plot mismatch");return r;'
);
add(
  "inspectCultivation",
  plot +
    'const r=await system.inspectCultivation({farmId,target});if(!r.value.canCultivate)throw Error("Existing plot not cultivable");return r;'
);
add("getAvailableActions", plot + "return await system.getAvailableActions({farmId,target:plotId});");
add("getFieldValues", plot + 'return await system.getFieldValues({farmId,fieldId:"soilMoisture",plotIds:[plotId]});');
add(
  "plant",
  plot +
    'const r=await system.plant({farmId,plotId,seedId:"potato-seed"});const next=await system.getPlot({farmId,plotId});if(next.value?.crop?.cropId!=="potato")throw Error("Plant did not persist");return r;'
);
add(
  "irrigate",
  plot +
    'const before=plot.soil.moistureUnits;const r=await system.irrigate({farmId,plotId});const next=await system.getPlot({farmId,plotId});if(!next.value||next.value.soil.moistureUnits<=before)throw Error("Irrigation missing");return r;'
);
add(
  "damageCrop",
  plot +
    'if(!plot.crop)throw Error("No crop");const r=await system.damageCrop({farmId,plotId,cropInstanceId:plot.crop.instanceId,damagePermille:10,source:"other"});if(r.value.damage.actualDamagePermille!==10)throw Error("Wrong damage");return r;'
);
add(
  "createPlot",
  plot +
    'const existing=new Set(plots.value.map(x=>x.cellX+":"+x.cellZ));for(const [dx,dz] of [[2,0],[0,2],[2,1],[1,2],[-1,0],[0,-1]]){const t={groundId:plot.groundId,cellX:plot.cellX+dx,cellZ:plot.cellZ+dz};if(existing.has(t.cellX+":"+t.cellZ))continue;const check=await system.inspectCultivation({farmId,target:t});if(!check.value.canCultivate)continue;return await system.createPlot({farmId,target:{...t,label:"Audit Plot"}});}throw Error("No cultivable empty fixture cell");',
  named + "return {plotId};"
);
add(
  "updatePlot",
  named + 'return await system.updatePlot({farmId,plotId,patch:{label:"Audit Plot",preparation:"leveled"}});',
  named + 'if(plot.soil.preparation!=="leveled")throw Error("Not leveled");return {plotId};'
);
add(
  "generateItems",
  plot +
    'if(!plot.position)throw Error("Plot not resident");const before=(await system.queryItems({farmId,query:{type:"watering-can"}})).value.length;const r=await system.generateItems({farmId,itemType:"watering-can",count:1,groundId:plot.groundId,position:[plot.position[0]-3,plot.position[1],plot.position[2]]});const after=(await system.queryItems({farmId,query:{type:"watering-can"}})).value.length;if(after<=before)throw Error("Item not generated");return r;'
);
add(
  "pickupItem",
  item +
    'const r=await system.pickupItem({farmId,itemId:item.id,dropPosition:item.position});const carried=await system.getCarry({farmId});if(carried.value.item?.id!==item.id)throw Error("Not carried");return r;'
);
add(
  "useCarriedItem",
  plot +
    'const carried=await system.getCarry({farmId});if(carried.value.item?.type!=="watering-can")throw Error("Wrong fixture tool");return await system.useCarriedItem({farmId,target});'
);
add(
  "placeItem",
  item +
    'const carried=await system.getCarry({farmId});if(!carried.value.item)throw Error("No carried item");const r=await system.placeItem({farmId,expectedItemId:carried.value.item.id,groundId:item.groundId,position:item.position});if((await system.getCarry({farmId})).value.item)throw Error("Item still carried");return r;'
);
add(
  "setContainerCount",
  area +
    'const before=await system.getContainers({farmId,query:{typeId:"basket"}});const count=before.value.length+1;const r=await system.setContainerCount({farmId,typeId:"basket",count});const after=await system.getContainers({farmId,query:{typeId:"basket"}});if(after.value.length!==count)throw Error("Container count mismatch");return r;'
);
add(
  "hoe",
  named +
    'const target={groundId:plot.groundId,cellX:plot.cellX,cellZ:plot.cellZ};const removed=await system.hoe({farmId,target,expectedCropInstanceId:null});const restored=await system.hoe({farmId,target,expectedCropInstanceId:null});await system.updatePlot({farmId,plotId,patch:{label:"Audit Plot"}});return {removed,restored};'
);
// Re-create through the real command if hoe restored the existing cell.
add(
  "deletePlot",
  named + "return await system.deletePlot({farmId,plotId});",
  area +
    'if((await system.queryPlots({farmId})).value.some(x=>x.label==="Audit Plot"))throw Error("Plot survived");return {deleted:true};'
);
const harvest = {
  id: "farm.harvest",
  tool: "editorComponents.FarmingSystem.methods.harvest",
  waitUntil: plot + "return {ready:!!plot.crop?.mature,crop:plot.crop};",
  waitTimeoutMs: 900000,
  source:
    plot +
    'if(!plot.crop?.mature)throw Error("Not mature");const r=await system.harvest({farmId,plotId,cropInstanceId:plot.crop.instanceId});const after=await system.getPlot({farmId,plotId});if(after.value?.crop)throw Error("Harvest left crop");return r;'
};
const harvestTail = [harvest];
const basket =
  area +
  'const items=await system.queryItems({farmId,query:{type:"harvest-basket"}});const basket=items.value.find(x=>x.contents.length);if(!basket)throw Error("No full basket");';
harvestTail.push({
  id: "farm.drop-harvest",
  tool: "editorComponents.FarmingSystem.methods.placeItem",
  source:
    basket +
    "return await system.placeItem({farmId,expectedItemId:basket.id,groundId:basket.groundId,position:[basket.position[0]-3,basket.position[1],basket.position[2]]});"
});
harvestTail.push({
  id: "farm.consumeBasket",
  tool: "editorComponents.FarmingSystem.methods.consumeBasket",
  source:
    basket +
    "const entry=basket.contents[0];return await system.consumeBasket({farmId,basketId:basket.id,cropId:entry.cropId,itemId:entry.itemId,quantity:1});"
});
harvestTail.push({
  id: "farm.unloadBasket",
  tool: "editorComponents.FarmingSystem.methods.unloadBasket",
  source:
    basket +
    "if(!basket.carried)await system.pickupItem({farmId,itemId:basket.id,dropPosition:basket.position});return await system.unloadBasket({farmId,basketId:basket.id});"
});
harvestTail.push({
  id: "farm.withdrawInventory",
  tool: "editorComponents.FarmingSystem.methods.withdrawInventory",
  source:
    area +
    'const inventory=await system.getInventory({farmId});const itemId=Object.keys(inventory.value).find(x=>inventory.value[x]>0);if(!itemId)throw Error("No harvested inventory");const before=inventory.value[itemId];const r=await system.withdrawInventory({farmId,itemId,quantity:1});const after=await system.getInventory({farmId});if((after.value[itemId]??0)!==before-1)throw Error("Wrong inventory decrease");return r;'
});
module.exports = { cases, harvestTail };
if (require.main === module) process.stdout.write(JSON.stringify([...cases, ...harvestTail], null, 2));
