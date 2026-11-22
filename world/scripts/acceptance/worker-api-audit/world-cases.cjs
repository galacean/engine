const cases = [];
const add = (tool, source, verify, id = tool) => cases.push({ id, tool, source, ...(verify ? { verify } : {}) });
const target = {
  anchor: { kind: "viewer" },
  relation: { kind: "offset", forwardMetres: 20, rightMetres: -8 },
  placement: { snapTo: "terrain" }
};
const targetText = JSON.stringify(target);
add(
  "time.update",
  "const r=await tools.time.update({timeHours:13,transitionDuration:0,waitForIbl:false});return r;",
  'const r=await tools.time.get();if(Math.abs(r.timeHours-13)>0.01)throw Error("Time not applied");return r;'
);
add(
  "atmosphere.update",
  "return await tools.atmosphere.update({wind:{speedMetresPerSecond:2.5},transitionDuration:0,waitForIbl:false});",
  'const r=await tools.atmosphere.get();if(Math.abs(r.environment.windSpeed-2.5)>0.01)throw Error("Wind not applied");return r;'
);
add(
  "environment.config.update",
  'const r=await tools.environment.config.update({component:"weather",values:{cloudCoverage:0.5}});if(r.status!=="accepted")throw Error("Parameter edit rejected");return r;',
  'const r=await tools.environment.config.get({component:"weather",fields:["cloudCoverage"]});if(r.components?.[0]?.values?.cloudCoverage!==0.5)throw Error("Parameter not applied");return r;',
  "parameters.set"
);
add(
  "environment.config.reset",
  'const r=await tools.environment.config.reset({component:"weather",fields:["cloudCoverage"]});if(r.status!=="accepted")throw Error("Reset rejected");return r;',
  undefined,
  "parameters.reset"
);
add(
  "vegetation.materials.apply",
  'const r=await tools.vegetation.materials.apply({changes:[{filter:{parts:["bark"],layers:["trees"]},baseColor:[0.5,0.4,0.3]}]});if(r.status!=="accepted"||!r.matchedSlotCount)throw Error("Color edit failed");return r;',
  undefined,
  "materials.color"
);
add(
  "vegetation.materials.apply",
  'const r=await tools.vegetation.materials.apply({changes:[{filter:{parts:["bark"],layers:["trees"]},baseColor:null}]});if(r.status!=="accepted")throw Error("Color reset failed");return r;',
  undefined,
  "materials.reset"
);
for (const [name, parameters] of [
  ["buildHouses", [{ id: "audit-house" }]],
  ["buildTower", { id: "audit-tower", height: 9 }],
  ["buildWall", { id: "audit-wall", length: 5 }],
  ["buildFence", { id: "audit-fence", height: 2 }],
  ["buildSteps", { id: "audit-steps", width: 2, rise: 0.2, run: 0.4, count: 5 }]
]) {
  add(
    "building.generate",
    `const {items:groups}=await editor.component.query({scene:"Scene/SeedWorld.scene",type:"BuildingGroupComponent"});if(!groups.length)throw Error("No building groups");const group=await editor.component.read({scene:"Scene/SeedWorld.scene",id:groups[0].id});const library=group.props?.assetLibrary;if(!library||typeof library!=="object"||!("$ref" in library)||typeof library.$ref!=="string")throw Error("No library");const r=await tools.building.generate({generator:${JSON.stringify("European." + name)},parameters:${JSON.stringify(parameters)},source:{id:"audit-generated",assetLibrary:library.$ref}});const source=JSON.parse(r.content);if(!source.components.length)throw Error("Empty generator output");return {bytes:r.content.length,entities:source.entities.length,components:source.components.length};`,
    undefined,
    "building." + name
  );
}
const animal =
  'const q=await tools.animals.query({visible:true});const a=q.items.find(x=>x.loaded);if(!a)throw Error("No loaded animal");const d=await tools.animals.describe({id:a.id});const skill=d.skills.find(x=>!x.requiresTarget&&!x.background);if(!skill)throw Error("No direct skill");';
add(
  "animals.command",
  animal +
    'const r=await tools.animals.command({id:a.id,requestId:"audit-animal-command",skillId:skill.skillId});if(!["accepted","running","completed"].includes(r.status))throw Error("Animal rejected: "+r.reason);return r;'
);
add(
  "animals.receipt",
  animal +
    'await tools.animals.command({id:a.id,requestId:"audit-animal-receipt",skillId:skill.skillId});const r=await tools.animals.receipt({id:a.id,requestId:"audit-animal-receipt"});if(r.status==="not_found"||r.status==="rejected")throw Error("No command receipt");return r;'
);
add(
  "animals.spawn",
  'const q=await tools.animals.query({visible:true});const a=q.items.find(x=>x.loaded);if(!a)throw Error("No animal fixture");const r=await tools.animals.spawn({requestId:"audit-spawn",typeId:a.typeId});if(r.status!=="accepted")throw Error("Spawn rejected: "+r.reason);return r;',
  'const q=await tools.animals.query({limit:100});if(q.matchedCount!==40)throw Error("Spawn not retained");return {count:q.matchedCount};'
);
add(
  "vegetation.create",
  `const r=await tools.vegetation.create({plant:"tree",distribution:{kind:"single"},target:${targetText},seed:120});if(r.status!=="applied"||r.createdCount!==1)throw Error("Tree not created");return r;`,
  'const q=await tools.vegetation.query({kinds:["tree"],sources:["authored"],limit:10});if(!q.items.length)throw Error("Authored tree missing");return q;'
);
const tree =
  'const q=await tools.vegetation.query({kinds:["tree"],sources:["authored"],limit:1});const a=q.items[0];if(a.type!=="tree"||a.ref.source!=="authored")throw Error("No authored tree");';
add(
  "vegetation.update",
  tree +
    'const r=await tools.vegetation.update({ref:a.ref,patch:{seed:121}});if(r.status!=="applied"||!r.updatedCount)throw Error("Tree not updated");return r;'
);
add(
  "vegetation.delete",
  tree +
    'const r=await tools.vegetation.delete({refs:[a.ref]});if(r.status!=="applied"||!r.deletedCount)throw Error("Delete failed");return r;',
  'const q=await tools.vegetation.query({kinds:["tree"],sources:["authored"],limit:10});if(q.items.length)throw Error("Authored tree survived");return q;'
);
for (const operation of ["raise", "lower"])
  add(
    "terrain.patch",
    `const r=await tools.terrain.patch({operation:${JSON.stringify(operation)},target:${targetText},radiusMetres:20,amount:{heightDeltaMetres:1}});if(r.status!=="applied")throw Error("Patch rejected");return r;`,
    undefined,
    "terrain." + operation
  );
add(
  "terrain.create",
  `const r=await tools.terrain.create({kind:"hill",target:${targetText},pedestalLiftMetres:0.2,peakReliefMetres:30,bodyMajorRadiusMetres:100,influenceMajorRadiusMetres:300});if(r.status!=="applied")throw Error("Terrain create rejected");return r;`,
  undefined,
  "terrain.create-hill"
);
add(
  "terrain.update",
  'const q=await tools.terrain.query({kinds:["hill"],sources:["authored"],limit:1});const a=q.items[0];if(a.type!=="hill"||a.ref.source!=="authored")throw Error("No authored hill");const r=await tools.terrain.update({ref:a.ref,patch:{peakReliefMetres:31}});if(r.status!=="applied")throw Error("Terrain update rejected");return r;',
  undefined,
  "terrain.update-hill"
);
add(
  "spatial.teleport",
  'return await tools.spatial.teleport({target:{anchor:{kind:"viewer"},relation:{kind:"offset",forwardMetres:1,rightMetres:1},placement:{snapTo:"terrain"}},heightOffset:1.8});',
  "return await tools.spatial.viewer();"
);
module.exports = cases;
if (require.main === module) process.stdout.write(JSON.stringify(cases, null, 2));
