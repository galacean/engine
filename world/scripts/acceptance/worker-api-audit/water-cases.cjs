// Water authors use the same public Editor APIs as the native panel.
// Query declarations are generated from the executable Water contracts.
const scene = 'const scene="Scene/SeedWorld.scene";';
const fixture =
  scene +
  'const {items:waters}=await editor.component.query({scene,type:"WaterBodyComponent"});if(!waters.length)throw Error("No Water fixture");const target={scene,id:waters[0].id};const record=await editor.component.read(target);const input=record.props?.authoring;if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Missing authoring");';
const cases = [];
function add(id, tool, source, verify) {
  cases.push({ id: "water." + id, tool, source, ...(verify ? { verify } : {}) });
}
add("list", "component.query", scene + 'return await editor.component.query({scene,type:"WaterBodyComponent"});');
add("get", "component.read", fixture + "return record;");
add(
  "update",
  "component.update",
  fixture + "return await editor.component.update({...target,props:{authoring:{...input,visible:false}}});",
  fixture + "return record;"
);
add(
  "updateMany",
  "component.update",
  fixture +
    'for(const water of waters){const value=await editor.component.read({scene,id:water.id});const authoring=value.props?.authoring;if(!authoring||typeof authoring!=="object"||Array.isArray(authoring))throw Error("Missing authoring");await editor.component.update({scene,id:water.id,props:{authoring:{...authoring,priority:0}}});}return {updated:waters.length};'
);
for (const enabled of [false, true])
  add(
    "setEnabled-" + enabled,
    "component.update",
    fixture + `return await editor.component.update({...target,props:{enabled:${enabled}}});`,
    fixture + `if(record.props?.enabled!==${enabled})throw Error("Enable state mismatch");return target;`
  );
for (const scope of ["instance", "shared"])
  add(
    "material-" + scope,
    scope === "shared" ? "asset.update" : "asset.create",
    fixture +
      'const ref=input.material;if(!ref||typeof ref!=="object"||Array.isArray(ref)||!("$ref" in ref)||typeof ref.$ref!=="string")throw Error("Missing Material");const path=ref.$ref;const file=await editor.asset.read({path});if(file.kind!=="structured")throw Error("Expected Material JSON");const content=JSON.stringify(file.data);' +
      (scope === "shared"
        ? "return await editor.asset.update({path,content});"
        : 'const cloned=await editor.asset.create({path:"Water/Materials/audit-copy.mat",type:"Material",content});return await editor.component.update({...target,props:{authoring:{...input,material:{$ref:cloned.path}}}});')
  );
add(
  "create",
  "component.add",
  fixture +
    'const entity=await editor.entity.create({scene,name:"Audit Water"});return await editor.component.add({scene,entityId:entity.id,type:"WaterBodyComponent",props:{authoring:input}});'
);
add(
  "remove",
  "component.remove",
  scene +
    'const entities=await editor.entity.list({scene,name:"Audit Water"});if(!entities.items.length)throw Error("Missing Audit Water");const {items:components}=await editor.component.query({scene,entityId:entities.items[0].id,type:"WaterBodyComponent"});return await editor.component.remove({scene,id:components[0].id});'
);
for (const name of ["capabilities", "diagnostics", "verify"])
  add(name, "water." + name, fixture + `return await tools.water.${name}({target});`);
add("sample", "water.sample", "return await tools.water.sample({x:0,z:0});");
add("sampleDrops", "water.sampleDrops", "return await tools.water.sampleDrops({x:0,y:0,z:0});");
module.exports = cases;
if (require.main === module) process.stdout.write(JSON.stringify(cases, null, 2));
