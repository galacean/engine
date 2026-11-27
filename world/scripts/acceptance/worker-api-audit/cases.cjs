// Each case runs through the real Worker and retains the production boundary checks.
// Fixtures are discovered through exposed APIs; private runtime handles only identify a root for inspection.
const cases = [];
const add = (tool, body, id = tool) => cases.push({ id, tool, source: body });
const scene = "Scene/SeedWorld.scene";
const prefix = `const scene=${JSON.stringify(scene)};`;
const farm =
  'const {items:systems}=await editor.component.query({type:"FarmingSystem"});if(!systems.length)throw Error("No FarmingSystem");const system=systems[0];';
const area =
  farm +
  'const areas=await system.list();const area=areas.value.find(x=>x.initialized&&x.active);if(!area)throw Error("No active farm");const farmId=area.farmId;';
const plot =
  area +
  'const plots=await system.queryPlots({farmId});const plot=plots.value[0];if(!plot)throw Error("No plot");const plotId=plot.id;';
add(
  "time.get",
  'const r=await tools.time.get();if(!Number.isFinite(r.timeHours))throw Error("Missing time");return r;'
);
add(
  "atmosphere.get",
  'const r=await tools.atmosphere.get();if(!Number.isFinite(r.environment.windSpeed))throw Error("Missing wind");return r;'
);
add(
  "vegetation.query",
  'const r=await tools.vegetation.query({kinds:["tree"],limit:5});if(!r.items.length)throw Error("Empty vegetation");return r;'
);
add(
  "vegetation.inspect",
  'const q=await tools.vegetation.query({kinds:["tree"],limit:1});const a=q.items[0];if(a.type!=="tree")throw Error("No tree");return await tools.vegetation.inspect({ref:a.ref});'
);
add(
  "terrain.query",
  'const r=await tools.terrain.query({limit:5});if(!r.items.length)throw Error("Empty terrain");return r;'
);
add(
  "terrain.inspect",
  'const q=await tools.terrain.query({limit:1});const a=q.items[0];return await tools.terrain.inspect({ref:a.ref});'
);
add(
  "runtime.entity.inspect",
  'const roots=await tools.runtime.entity.children({limit:10});const root=roots.items.find(x=>x.entity);if(!root?.entity)throw Error("No root");const r=await tools.runtime.entity.inspect({entityId:root.entity.entityId});if(r.status!=="found")throw Error("Missing root");return r;'
);
add("runtime.entity.children", "const r=await tools.runtime.entity.children({limit:5});return r;");
add(
  "runtime.component.query",
  'const roots=await tools.runtime.entity.children({limit:100});const root=roots.items.find(x=>x.entity?.components.length);if(!root?.entity)throw Error("No root component");const r=await tools.runtime.component.query({entityId:root.entity.entityId});if(!r.items.length)throw Error("Missing components");return r;'
);
add(
  "runtime.component.read",
  'const roots=await tools.runtime.entity.children({limit:100});const root=roots.items.find(x=>x.entity?.components.length);if(!root?.entity)throw Error("No root component");const q=await tools.runtime.component.query({entityId:root.entity.entityId});const c=q.items[0];const r=await tools.runtime.component.read({componentId:c.componentId,fields:c.properties.slice(0,2)});if(r.status!=="found")throw Error("Missing component");return r;'
);
add("spatial.viewer", "const r=await tools.spatial.viewer();return r;");
add("spatial.resolve", 'const r=await tools.spatial.resolve({anchor:{kind:"viewer"},relation:{kind:"at"}});return r;');
add(
  "spatial.check",
  'const r=await tools.spatial.check({positions:[{x:500,z:500}]});if(r.items.length!==1||!r.items[0].surface)throw Error("No surface");return r;'
);
add(
  "spatial.search",
  'const r=await tools.spatial.search({sort:"flattest",limit:3});if(!r.items.length)throw Error("No terrain matches");return r;'
);
add(
  "animals.query",
  'const r=await tools.animals.query({limit:100});if(r.matchedCount<1)throw Error("No animals");return r;'
);
add(
  "animals.describe",
  'const q=await tools.animals.query({visible:true});const animal=q.items.find(x=>x.loaded);if(!animal)throw Error("No loaded visible animal");const r=await tools.animals.describe({id:animal.id});if(!r.available||!r.skills.length)throw Error("Animal unavailable");return r;'
);
add(
  "animals.catalog",
  'const r=await tools.animals.catalog({view:"resources",limit:5});if(!r.items.length)throw Error("No animal resources");return r;'
);
add(
  "animals.config.get",
  'const r=await tools.animals.config.get({fields:["enabled","activationDistance"]});if(!r.versionToken)throw Error("No animal config");return r;'
);
add(
  "spatial.config.get",
  'const r=await tools.spatial.config.get({queryEntities:true,limit:5});if(!r.entities?.length)throw Error("No parameter entities");return r;'
);
add(
  "environment.config.get",
  'const r=await tools.environment.config.get({component:"weather",fields:["cloudCoverage"]});if(!r.versionToken)throw Error("No environment config");return r;'
);
add(
  "vegetation.materials.inspect",
  'const r=await tools.vegetation.materials.inspect({});if(!r.versionToken)throw Error("No material revision");return r;'
);
add(
  "asset.list",
  'const r=await editor.asset.list({});if(!r.items.length)throw Error("No project assets");return r.items.map(x=>({path:x.path,type:x.type}));'
);
add("asset.info", prefix + "return await editor.asset.info({path:scene});");
add(
  "asset.read",
  prefix +
    "const r=await editor.asset.read({path:scene});return {path:r.path,kind:r.kind,bytes:JSON.stringify(r).length};"
);
add("asset.references", prefix + "return await editor.asset.references({path:scene});");
add(
  "entity.list",
  prefix + 'const r=await editor.entity.list({scene,limit:5});if(!r.items.length)throw Error("No entities");return r;'
);
add(
  "entity.read",
  prefix +
    "const q=await editor.entity.list({scene,limit:1});return await editor.entity.read({scene,id:q.items[0].id});"
);
add(
  "component.query",
  prefix +
    'const r=await editor.component.query({scene,type:"PlanningProjectAuthoring"});if(!r.items.length)throw Error("No authoring owner");return r;'
);
add(
  "component.read",
  prefix +
    'const q=await editor.component.query({scene,type:"PlanningProjectAuthoring"});const r=await editor.component.read({scene,id:q.items[0].id});return {id:r.id,type:r.type,bytes:JSON.stringify(r).length};'
);
add("history.query", "return await editor.history.query({limit:5});");
for (const name of ["capabilities", "diagnostics"])
  add("water." + name, `return await tools.water.${name}({});`);
add("water.verify", prefix + 'const {items:waters}=await editor.component.query({scene,type:"WaterBodyComponent"});if(!waters.length)throw Error("No Water fixture");return await tools.water.verify({target:{scene,id:waters[0].id}});');
add("water.sample", 'return await tools.water.sample({x:0,z:0});');
add("water.sampleDrops", 'return await tools.water.sampleDrops({x:0,y:0,z:0});');
add(
  "editorComponents.FarmingSystem.query",
  farm + "return systems.map(({scene,entityId,id,type})=>({scene,entityId,id,type}));"
);
for (const method of ["getDiagnostics", "list", "capabilities"])
  add("editorComponents.FarmingSystem.methods." + method, farm + `return await system.${method}({});`);
for (const method of [
  "get",
  "getCatalog",
  "getTarget",
  "queryPlots",
  "getEnvironment",
  "getContainers",
  "getInventory",
  "queryItems",
  "getCarry",
  "getItemTotals",
  "verify"
])
  add("editorComponents.FarmingSystem.methods." + method, area + `return await system.${method}({farmId});`);
module.exports = { cases, add, prefix, farm, area, plot };
if (require.main === module) process.stdout.write(JSON.stringify(cases, null, 2));
