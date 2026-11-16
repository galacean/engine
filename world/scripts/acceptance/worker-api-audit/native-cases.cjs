const cases = [];
const scene = "Scene/SeedWorld.scene";
const prefix = `const scene=${JSON.stringify(scene)};`;
function add(tool, body, verify, id = tool) {
  cases.push({ id, tool, source: prefix + body, ...(verify ? { verify: prefix + verify } : {}) });
}
const find =
  'const q=await editor.entity.list({scene,name:"Audit Native",limit:100});const e=q.items.find(x=>x.name==="Audit Native");if(!e)throw Error("No audit entity");';
const prefab = {
  asset: { version: "2.0" },
  root: "root",
  entities: [{ id: "root", name: "Audit Template", components: ["light"], children: [] }],
  components: [{ id: "light", type: "PointLight", props: { intensity: 0, enabled: false } }]
};
add(
  "asset.create",
  `return await editor.asset.create({path:"Audit/Template.prefab",type:"Prefab",content:${JSON.stringify(JSON.stringify(prefab))}});`,
  'const r=await editor.asset.read({path:"Audit/Template.prefab"});return {path:r.path,kind:r.kind};'
);
const modified = { ...prefab, entities: [{ ...prefab.entities[0], name: "Audit Template Updated" }] };
add(
  "asset.update",
  `return await editor.asset.update({path:"Audit/Template.prefab",content:${JSON.stringify(JSON.stringify(modified))}});`,
  'const r=await editor.asset.read({path:"Audit/Template.prefab"});if(!JSON.stringify(r).includes("Audit Template Updated"))throw Error("Update missing");return {path:r.path};'
);
add(
  "entity.create",
  'return await editor.entity.create({scene,name:"Audit Native",prefab:"Audit/Template.prefab",position:[500,100,500]});',
  find + "return await editor.entity.read({scene,id:e.id});"
);
add(
  "entity.update",
  find + "return await editor.entity.update({scene,id:e.id,patch:{position:[501,100,500]}});",
  find +
    'const r=await editor.entity.read({scene,id:e.id});if(r.position?.[0]!==501)throw Error("Position not updated");return r;'
);
add(
  "entity.revert",
  find + 'return await editor.entity.revert({scene,id:e.id,keys:["position"]});',
  find +
    'const r=await editor.entity.read({scene,id:e.id});if(r.position?.[0]===501)throw Error("Position still overridden");return r;'
);
add(
  "component.update",
  find +
    'const c=(await editor.component.query({scene,entityId:e.id,type:"PointLight"}))[0];return await editor.component.update({scene,id:c.id,props:{intensity:0.25}});',
  find +
    'const c=(await editor.component.query({scene,entityId:e.id,type:"PointLight"}))[0];const r=await editor.component.read({scene,id:c.id});if(r.props?.intensity!==0.25)throw Error("Component update missing");return r;'
);
add(
  "component.revert",
  find +
    'const c=(await editor.component.query({scene,entityId:e.id,type:"PointLight"}))[0];return await editor.component.revert({scene,id:c.id,keys:["intensity"]});',
  find +
    'const c=(await editor.component.query({scene,entityId:e.id,type:"PointLight"}))[0];const r=await editor.component.read({scene,id:c.id});if(r.props?.intensity!==0)throw Error("Component revert missing");return r;'
);
add(
  "entity.reparent",
  find +
    'const parent=await editor.entity.create({scene,name:"Audit Parent",position:[2,0,0]});return await editor.entity.reparent({scene,id:e.id,parentEntityId:parent.id});',
  find +
    'const r=(await editor.entity.list({scene,name:"Audit Parent"})).items[0];const children=await editor.entity.list({scene,parentId:r.id});if(!children.items.some(x=>x.id===e.id))throw Error("Wrong parent");return children;'
);
add(
  "component.add",
  find + 'return await editor.component.add({scene,entityId:e.id,type:"SpotLight",props:{enabled:false,intensity:0}});',
  find +
    'const r=await editor.component.query({scene,entityId:e.id,type:"SpotLight"});if(r.length!==1)throw Error("Missing added component");return r;'
);
add(
  "component.remove",
  find +
    'const c=(await editor.component.query({scene,entityId:e.id,type:"SpotLight"}))[0];return await editor.component.remove({scene,id:c.id});',
  find +
    'const r=await editor.component.query({scene,entityId:e.id,type:"SpotLight"});if(r.length)throw Error("Component survived removal");return r;'
);
add(
  "history.read",
  'const q=await editor.history.query({limit:1});if(!q.items.length)throw Error("No history");return await editor.history.read({transactionId:q.items[0].transactionId});'
);
add(
  "history.undo",
  'const q=await editor.history.query({limit:1});if(!q.items.length)throw Error("No history");return await editor.history.undo({transactionIds:[q.items[0].transactionId]});',
  find +
    'const r=await editor.component.query({scene,entityId:e.id,type:"SpotLight"});if(r.length!==1)throw Error("Undo did not restore");return r;'
);
add(
  "history.redo",
  'const q=await editor.history.query({direction:"redo",limit:1});if(!q.items.length)throw Error("No redo");return await editor.history.redo({transactionIds:[q.items[0].transactionId]});',
  find +
    'const r=await editor.component.query({scene,entityId:e.id,type:"SpotLight"});if(r.length)throw Error("Redo did not remove");return r;'
);
add(
  "entity.delete",
  find + "return await editor.entity.delete({scene,id:e.id});",
  'const r=await editor.entity.list({scene,name:"Audit Native"});if(r.items.length)throw Error("Entity not deleted");return r;'
);
add(
  "asset.delete",
  'return await editor.asset.delete({path:"Audit/Template.prefab"});',
  'const r=await editor.asset.list({});if(r.some(x=>x.path==="Audit/Template.prefab"))throw Error("Asset survived");return {deleted:true};'
);
cases.push({
  id: "asset.import",
  tool: "asset.import",
  source:
    'return await editor.asset.import({source:"/oss/assets/model/prop/furniture-desk/desk.glb",path:"Audit/Desk.glb"});',
  verify:
    'const r=await editor.asset.read({path:"Audit/Desk.glb"});if(r.kind!=="model"||!r.nodes.length)throw Error("Imported model missing");return {kind:r.kind,nodes:r.nodes.length};'
});
module.exports = cases;
if (require.main === module) process.stdout.write(JSON.stringify(cases, null, 2));
