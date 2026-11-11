import {runtimeSourceReferenceIds} from "@galacean/engine-project/runtime-editor/generated/editor-source-compiler.js";
import { describe, expect, it, vi } from "vitest";
import { RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";
import { RuntimeSceneEdit } from "../src/runtime-editor/scene/runtime-scene-edit";
import { RuntimeInstanceSource } from "../src/runtime-editor/scene/runtime-instance-source";
import { compileProjectResource } from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler.ts";
import { nativeToolSchemas } from "../src/runtime-editor-agent/runtime-native-tools";

function fixture() {
  const prefab = {asset:{version:"2.0"},root:"root",entities:[
    {id:"root",components:["lamp"],children:["child","nested"]},
    {id:"child",components:["child-light"]},
    {id:"nested",instance:{asset:{$ref:"Nested.prefab"}}}
  ],components:[
    {id:"lamp",type:"PointLight",props:{intensity:1,color:{r:1,g:1,b:1,a:1}}},
    {id:"child-light",type:"PointLight",props:{intensity:2}}
  ]};
  const source = {asset:{version:"2.0"},scene:{rootEntities:[],background:{mode:0,color:{r:0,g:0,b:0,a:1}}},entities:[],components:[]};
  const contents = {"Main.scene":JSON.stringify(source),"Lamp.prefab":JSON.stringify(prefab),"Nested.prefab":JSON.stringify({
    asset:{version:"2.0"},root:"inner",entities:[{id:"inner",components:["inner-light"]}],components:[{id:"inner-light",type:"PointLight",props:{intensity:8}}]
  })};
  const pack: RuntimeProjectPackage = {version:RUNTIME_PROJECT_SAVE_VERSION,project:{scene:"Main.scene",files:Object.keys(contents).map(virtualPath=>({virtualPath,path:virtualPath,type:virtualPath.endsWith('.scene')?'Scene':'Prefab'}))},contents};
  const format = {validate:(text:string|Uint8Array)=>{JSON.parse(text as string);},references:()=>[]};
  const draft = new RuntimeProjectEdit(pack,new Map([["Scene",format],["Prefab",format],["script",{validate:()=>{},references:()=>[]}]]));
  const scene = new RuntimeSceneEdit(draft,"Main.scene");
  const create = (name:string) => scene.create({name,prefab:"Lamp.prefab"});
  return {draft,scene,create,pack,source:()=>JSON.parse(draft.read("Main.scene") as string),prefab};
}

describe("Prefab edits through ordinary scene tools",()=>{
  it("creates linked records without copying template members into the Scene",()=>{
    const f=fixture(),a=f.create("A"),b=f.create("B");
    expect(f.source().entities.map((e:any)=>e.instance.asset.$ref)).toEqual(["Lamp.prefab","Lamp.prefab"]);
    expect(f.source().components).toEqual([]);
    expect(f.scene.queryComponents()).toHaveLength(6);
    const query=f.scene.queryComponents({entityId:a.id,type:"PointLight"});
    expect(query).toHaveLength(1);
    expect(f.scene.queryComponents({entityId:b.id})[0].id).not.toBe(query[0].id);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
    expect(nativeToolSchemas['entity.create'].parse({scene:"Main.scene",name:"A",prefab:"Lamp.prefab"})).toMatchObject({prefab:"Lamp.prefab"});
  });
  it("reads current nested Prefab text without copying the project for each scene lookup", () => {
    const { draft, scene, create } = fixture();
    const instance = create("A");
    const nested = scene.queryComponents().find(({ id }) => id.includes(instance.id) && id.includes("inner-light"))!;
    const snapshot = draft.preview();
    const preview = vi.spyOn(draft, "preview");

    const updated = JSON.parse(snapshot.contents["Nested.prefab"] as string);
    updated.components[0].props.intensity = 21;
    draft.update("Nested.prefab", JSON.stringify(updated));

    expect(scene.queryComponents({ id: nested.id })).toEqual([nested]);
    expect(scene.readComponent(nested.id).props!.intensity).toBe(21);
    expect(JSON.parse(snapshot.contents["Nested.prefab"] as string).components[0].props.intensity).toBe(8);
    expect(preview).not.toHaveBeenCalled();
  });
  it("keeps root placement and state through native ownership serialization",()=>{
    const f=fixture(),a=f.create("A"),b=f.create("B");
    const child=f.scene.create({name:"Local",parentEntityId:a.id});
    const parent=f.scene.create({name:"Container",position:[10,0,0]});
    f.scene.update(b.id,{name:"Moved",isActive:false,layer:2});
    f.scene.reparent(b.id,parent.id);
    f.scene.reparent(child.id,null);
    const root=f.scene.list().find(entity=>entity.id===b.id)!;
    expect(root).toMatchObject({name:"Moved",position:[-10,0,0],isActive:false,layer:2});
    expect(f.source().entities.find((entity:any)=>entity.id===b.id).position).toBeUndefined();
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
  });
  it("writes only changed properties as overrides and follows fresh template values",()=>{
    const f=fixture(),a=f.create("A"),b=f.create("B"),id=f.scene.queryComponents({entityId:a.id})[0].id;
    f.scene.updateComponent(id,{intensity:5});
    expect(f.source().entities[0].instance.overrides.componentProps).toEqual([{target:"lamp",props:{intensity:5}}]);
    expect(f.draft.read("Lamp.prefab")).toBe(f.pack.contents["Lamp.prefab"]);
    f.prefab.components[0].props.intensity=3;f.draft.update("Lamp.prefab",JSON.stringify(f.prefab));
    expect(f.scene.readComponent(id).props!.intensity).toBe(5);
    expect(f.scene.readComponent(f.scene.queryComponents({entityId:b.id})[0].id).props!.intensity).toBe(3);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
  });
  it("removes overrides when edited back to template values regardless of object key order",()=>{
    const f=fixture(),a=f.create("A"),id=f.scene.queryComponents({entityId:a.id})[0].id;
    f.scene.updateComponent(id,{intensity:5,color:{r:0,g:0,b:0,a:1}});
    f.scene.updateComponent(id,{intensity:1,color:{a:1,b:1,g:1,r:1}});
    expect(f.source().entities[0].instance.overrides).toEqual({entityProps:[{target:"root",name:"A"}]});
    f.prefab.components[0].props.intensity=6;f.draft.update("Lamp.prefab",JSON.stringify(f.prefab));
    expect(f.scene.readComponent(id).props!.intensity).toBe(6);
  });
  it("reverts selected properties or all mutations without guessing Engine defaults",()=>{
    const f=fixture(),a=f.create("A"),id=f.scene.queryComponents({entityId:a.id})[0].id;
    f.scene.updateComponent(id,{intensity:5,enabled:false});
    f.scene.revertComponent(id,["enabled"]);
    expect(f.scene.readComponent(id).props).toEqual({intensity:5,color:{r:1,g:1,b:1,a:1}});
    f.scene.revertComponent(id);
    expect(f.source().entities[0].instance.overrides).toEqual({entityProps:[{target:"root",name:"A"}]});
    expect(f.scene.readComponent(id).props!.intensity).toBe(1);
  });
  it("edits and removes direct child components using their stable queried IDs",()=>{
    const f=fixture(),a=f.create("A");
    const child=f.scene.queryComponents().find(c=>c.id.includes('child-light'))!;
    f.scene.updateComponent(child.id,{intensity:4});
    f.scene.removeComponent(child.id);
    expect(f.scene.queryComponents({id:child.id})).toEqual([]);
    expect(()=>f.scene.updateComponent(child.id,{intensity:6})).toThrow("Unknown component");
    const overrides=f.source().entities.find((e:any)=>e.id===a.id).instance.overrides;
    expect(overrides.removedComponents).toEqual(["child-light"]);
    expect(overrides.componentProps).toEqual([]);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
  });
  it("adds, edits and removes Scene-owned components without modifying the Prefab",()=>{
    const f=fixture(),a=f.create("A"),added=f.scene.addComponent(a.id,{type:"PointLight",props:{intensity:4}});
    expect(f.scene.readComponent(added.id).props!.intensity).toBe(4);
    f.scene.updateComponent(added.id,{intensity:9});
    expect(f.scene.readComponent(added.id).props!.intensity).toBe(9);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
    f.scene.removeComponent(added.id);
    expect(f.scene.queryComponents({id:added.id})).toEqual([]);
    expect(f.draft.read("Lamp.prefab")).toBe(f.pack.contents["Lamp.prefab"]);
  });
  it("saves isolated nested overrides with the current Editor sidecar and supports revert/delete",()=>{
    const f=fixture();const a=f.create("A"),b=f.create("B");
    const nested=f.scene.queryComponents().find(c=>c.id.includes(a.id)&&c.id.includes('inner-light'))!;
    const other=f.scene.queryComponents().find(c=>c.id.includes(b.id)&&c.id.includes('inner-light'))!;
    f.scene.updateComponent(nested.id,{intensity:19});
    expect(f.scene.readComponent(nested.id).props!.intensity).toBe(19);
    expect(f.scene.readComponent(other.id).props!.intensity).toBe(8);
    expect(f.source().prefab.nestedOverrides).toHaveLength(1);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
    expect(new RuntimeSceneEdit(f.draft,"Main.scene").readComponent(nested.id).props!.intensity).toBe(19);
    f.scene.revertComponent(nested.id,["intensity"]);
    expect(f.scene.readComponent(nested.id).props!.intensity).toBe(8);
    f.scene.removeComponent(nested.id);
    expect(f.scene.queryComponents({id:nested.id})).toEqual([]);
    expect(f.scene.readComponent(other.id).props!.intensity).toBe(8);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
    expect(f.draft.read("Nested.prefab")).toBe(f.pack.contents["Nested.prefab"]);
  });
  it("keeps added inline component identities and resolves read-your-writes",()=>{
    const f=fixture(),a=f.create("A"),source=f.source();
    source.entities[0].instance.overrides={addedEntities:[{id:"local",parent:"root",entity:{components:[{id:"extra",type:"PointLight",props:{intensity:5}}]}}]};
    f.draft.update("Main.scene",JSON.stringify(source));
    const id=f.scene.queryComponents().find(c=>c.id.includes('extra'))!.id;
    f.scene.updateComponent(id,{intensity:7});
    expect(f.scene.readComponent(id).props!.intensity).toBe(7);
    const members=new RuntimeInstanceSource(f.source(),f.draft.preview());
    expect(members.entities.get(f.scene.readComponent(id).entityId)!.root).toBe(a.id);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
    f.scene.removeComponent(id);
    expect(f.scene.queryComponents({id})).toEqual([]);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
  });
  it("keeps native cross-instance references in overrides and compiles them",()=>{
    const f=fixture(),a=f.create("A"),b=f.create("B"),id=f.scene.queryComponents({entityId:a.id})[0].id;
    f.scene.updateComponent(id,{peer:{$component:{instance:b.id,target:"lamp"}}});
    const runtime=JSON.parse(compileProjectResource(f.draft.preview(),"Main.scene") as string);
    expect(runtime.entities[0].instance.overrides.componentProps[0].props.peer.$component).toBeDefined();
  });
  it("rejects anonymous inline components under the current Source ID contract",()=>{
    const f=fixture();f.create("A");const source=f.source();
    source.entities[0].instance.overrides={addedEntities:[{id:"local",parent:"root",entity:{id:"local",components:[{type:"PointLight"}]}}]};
    f.draft.update("Main.scene",JSON.stringify(source));
    expect(()=>f.scene.queryComponents()).toThrow(/non-empty string id/);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).toThrow(/non-empty string id/);
  });
  it("reads repeated native property blocks and preserves explicit method calls",()=>{
    const f=fixture(),a=f.create("A"),source=f.source();
    source.entities[0].instance.overrides={componentProps:[
      {target:"lamp",props:{intensity:2}},{target:"lamp",props:{intensity:4},calls:[{method:"existingCall",args:[]}]}
    ]};
    f.draft.update("Main.scene",JSON.stringify(source));
    const id=f.scene.queryComponents({entityId:a.id})[0].id;
    expect(f.scene.readComponent(id).props!.intensity).toBe(4);
    f.scene.updateComponent(id,{intensity:5});
    expect(f.source().entities[0].instance.overrides.componentProps).toEqual([
      {target:"lamp",calls:[{method:"existingCall",args:[]}]},{target:"lamp",props:{intensity:5}}
    ]);
    f.scene.revertComponent(id);
    expect(f.source().entities[0].instance.overrides).toBeUndefined();
  });
  it("rejects non-Prefab creation without touching the Scene and clears members on deleting an instance",()=>{
    const f=fixture();
    expect(()=>f.scene.create({name:"Bad",prefab:"Main.scene"})).toThrow("Prefab");
    expect(f.scene.list()).toEqual([]);
    const a=f.create("A");f.scene.delete(a.id);
    expect(f.scene.queryComponents()).toEqual([]);
  });
});

describe("Editor-style instance entity overrides", () => {
  it("lists expanded members with usable entity and component identities", () => {
    const f=fixture(),a=f.create("A");
    const entities=f.scene.list(),root=entities.find(entity=>entity.id===a.id)!;
    expect(root.name).toBe("A");
    expect(root.children).toHaveLength(2);
    for(const id of root.children!) expect(entities.some(entity=>entity.id===id)).toBe(true);
    for(const entity of entities) for(const id of entity.components??[]) expect(f.scene.readComponent(id).entityId).toBe(entity.id);
  });
  it("adds local child hierarchies and components without copying the template", () => {
    const f=fixture(),a=f.create("A");
    const local=f.scene.create({name:"Local",parentEntityId:a.id});
    const child=f.scene.create({name:"Grandchild",parentEntityId:local.id});
    const component=f.scene.addComponent(child.id,{type:"PointLight",props:{intensity:12}});
    f.scene.update(local.id,{position:[1,2,3],name:"Changed"});
    expect(f.scene.list().find(entity=>entity.id===local.id)).toMatchObject({name:"Changed",position:[1,2,3],children:[child.id]});
    expect(f.scene.readComponent(component.id).props!.intensity).toBe(12);
    expect(f.source().entities).toHaveLength(1);
    expect(f.draft.read("Lamp.prefab")).toBe(f.pack.contents["Lamp.prefab"]);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
    f.scene.delete(local.id);
    expect(f.scene.queryComponents({id:component.id})).toEqual([]);
    expect(f.scene.list().some(entity=>entity.id===child.id)).toBe(false);
  });
  it("adds and edits a scene-owned nested Prefab using its own override record", () => {
    const f=fixture(),a=f.create("A");
    const local=f.scene.create({name:"Local Prefab",parentEntityId:a.id,prefab:"Nested.prefab"});
    const id=f.scene.queryComponents({entityId:local.id})[0].id;
    f.scene.updateComponent(id,{intensity:19});
    const extra=f.scene.addComponent(local.id,{type:"PointLight",props:{intensity:20}});
    const child=f.scene.create({name:"Local child",parentEntityId:local.id});
    expect(f.scene.readComponent(id).props!.intensity).toBe(19);
    expect(f.scene.readComponent(extra.id).props!.intensity).toBe(20);
    expect(f.scene.list().find(entity=>entity.id===local.id)!.children).toContain(child.id);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
    expect(f.draft.read("Nested.prefab")).toBe(f.pack.contents["Nested.prefab"]);
  });
  it("overrides a template child and removes its subtree only in A", () => {
    const f=fixture(),a=f.create("A"),b=f.create("B");
    const child=f.scene.list().find(entity=>entity.id===f.scene.list().find(entity=>entity.id===a.id)!.children![0])!;
    f.scene.update(child.id,{position:[2,0,0],name:"Only A"});
    f.scene.addComponent(child.id,{type:"PointLight",props:{intensity:7}});
    f.scene.create({name:"Local under child",parentEntityId:child.id});
    expect(f.scene.list().find(entity=>entity.id===child.id)).toMatchObject({name:"Only A",position:[2,0,0]});
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
    f.scene.removeComponent(child.components![0]);
    f.scene.delete(child.id);
    const overrides=f.source().entities[0].instance.overrides;
    expect(overrides.removedEntities).toEqual(["child"]);
    expect(overrides.entityProps).toEqual([{target:"root",name:"A"}]);
    expect(overrides.addedComponents).toEqual([]);
    expect(overrides.addedEntities).toEqual([]);
    expect(f.scene.list().find(entity=>entity.id===b.id)!.children).toHaveLength(2);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
  });
  it("keeps overrides when the template adds another child", () => {
    const f=fixture(),a=f.create("A");
    const child=f.scene.list().find(entity=>entity.id===a.id)!.children![0];
    f.scene.delete(child);
    const local=f.scene.create({name:"Local",parentEntityId:a.id});
    f.prefab.entities.push({id:"new-template-child",components:[]});
    f.prefab.entities[0].children!.push("new-template-child");
    f.draft.update("Lamp.prefab",JSON.stringify(f.prefab));
    const root=f.scene.list().find(entity=>entity.id===a.id)!;
    expect(root.children).toHaveLength(3);
    expect(root.children).toContain(local.id);
    expect(root.children).not.toContain(child);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
  });
  it("rejects unknown parents and nested inherited member edits without changing source", () => {
    const f=fixture();f.create("A");
    const before=f.draft.preview();
    expect(()=>f.scene.create({name:"Bad",parentEntityId:"missing"})).toThrow("Unknown entity");
    expect(()=>f.scene.addComponent("missing",{type:"PointLight"})).toThrow("Unknown entity");
    expect(nativeToolSchemas['entity.update'].safeParse({scene:"Main.scene",id:"x",patch:{parentEntityId:"y"}}).success).toBe(false);
    expect(f.draft.preview()).toEqual(before);
  });
});


it("rejects flattened inner-component targets instead of native nested addresses", () => {
  const f=fixture();f.create("A");
  const source=f.source();
  source.entities[0].instance.overrides={componentProps:[{target:"inner-light",props:{intensity:19}}]};
  f.draft.update("Main.scene",JSON.stringify(source));
  expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).toThrow(/inner-light/);
});

describe("instance-local hierarchy ownership", () => {
  it("moves local subtrees within their instance without changing descendant or component IDs", () => {
    const f=fixture(),a=f.create("A");
    const left=f.scene.create({name:"Left",parentEntityId:a.id,position:[5,0,0]});
    const right=f.scene.create({name:"Right",parentEntityId:a.id,position:[10,0,0]});
    const child=f.scene.create({name:"Child",parentEntityId:left.id,position:[2,0,0]});
    const grandchild=f.scene.create({name:"Grandchild",parentEntityId:child.id});
    const component=f.scene.addComponent(grandchild.id,{type:"PointLight",props:{intensity:7}});
    f.scene.reparent(child.id,right.id);
    expect(f.scene.list().find(e=>e.id===child.id)!.position).toEqual([-3,0,0]);
    expect(f.scene.list().find(e=>e.id===right.id)!.children).toEqual([child.id]);
    expect(f.scene.readComponent(component.id).entityId).toBe(grandchild.id);
    f.scene.reparent(child.id,a.id);
    expect(f.scene.list().find(e=>e.id===child.id)!.position).toEqual([7,0,0]);
    expect(f.scene.readComponent(component.id).props!.intensity).toBe(7);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
  });
  it("moves a locally added Prefab as a whole and preserves its overrides", () => {
    const f=fixture(),a=f.create("A"),parent=f.scene.create({name:"Local",parentEntityId:a.id,position:[10,0,0]});
    const nested=f.scene.create({name:"Nested",parentEntityId:a.id,prefab:"Nested.prefab",position:[3,0,0]});
    const component=f.scene.queryComponents({entityId:nested.id})[0].id;
    f.scene.updateComponent(component,{intensity:11});
    f.scene.reparent(nested.id,parent.id);
    expect(f.scene.list().find(e=>e.id===nested.id)!.position).toEqual([-7,0,0]);
    expect(f.scene.readComponent(component).props!.intensity).toBe(11);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
  });
  it("keeps template nodes fixed while allowing local additions to move across/outside instances", () => {
    const f=fixture(),a=f.create("A"),b=f.create("B");
    const local=f.scene.create({name:"Local",parentEntityId:a.id});
    const plain=f.scene.create({name:"Plain"});
    const inherited=f.scene.list().find(e=>e.id===a.id)!.children![0];
    const before=f.draft.preview();
    expect(()=>f.scene.reparent(inherited,local.id)).toThrow("template-owned");
    expect(f.draft.preview()).toEqual(before);
    f.scene.reparent(local.id,b.id);
    expect(f.scene.list().find(e=>e.id===b.id)!.children).toContain(local.id);
    f.scene.reparent(local.id,null);
    expect(f.source().scene.rootEntities).toContain(local.id);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
  });
  it("reverts selected entity properties and follows later template changes", () => {
    const f=fixture(),a=f.create("A");
    const child=f.scene.list().find(e=>e.id===a.id)!.children![0];
    f.scene.update(child,{name:"Local",position:[4,0,0]});
    f.scene.revert(child,["name"]);
    f.prefab.entities[1]={...f.prefab.entities[1],name:"Template renamed"} as any;
    f.draft.update("Lamp.prefab",JSON.stringify(f.prefab));
    expect(f.scene.list().find(e=>e.id===child)).toMatchObject({name:"Template renamed",position:[4,0,0]});
    f.scene.revert(child);
    expect(f.source().entities[0].instance.overrides).toEqual({entityProps:[{target:"root",name:"A"}]});
    f.scene.revert(a.id,["name"]);
    expect(f.source().entities[0].name).toBeUndefined();
    expect(f.source().entities[0].instance.overrides).toBeUndefined();
    const local=f.scene.create({name:"Local",parentEntityId:a.id});
    expect(()=>f.scene.revert(local.id)).toThrow("no template");
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
  });
});


describe("Scene subtree transfer to Prefab ownership", () => {
  it("preserves source IDs, references and world pose while lowering forward inline references", () => {
    const f=fixture(), a=f.create("A");
    f.scene.update(a.id,{position:[10,0,0]});
    const parent=f.scene.create({name:"Transfer",position:[3,0,0]});
    const child=f.scene.create({parentEntityId:parent.id,name:"Child"});
    const lamp=f.scene.addComponent(child.id,{type:"PointLight",props:{intensity:9}});
    const observer=f.scene.create({name:"Observer"});
    const refs=f.scene.addComponent(observer.id,{type:"ReferenceProbe",props:{target:{$entity:child.id},light:{$component:lamp.id}}});
    f.scene.addComponent(parent.id,{type:"ReferenceProbe",props:{target:{$entity:child.id},light:{$component:lamp.id},external:{$entity:observer.id}}});
    f.scene.reparent(parent.id,a.id);
    expect(f.source().entities.some((e:any)=>e.id===parent.id||e.id===child.id)).toBe(false);
    expect(f.scene.list().find(e=>e.id===parent.id)!.position).toEqual([-7,0,0]);
    expect(f.scene.readComponent(lamp.id).entityId).toBe(child.id);
    const runtime=JSON.parse(compileProjectResource(f.draft.preview(),"Main.scene") as string);
    const probe=runtime.components[f.source().components.findIndex((c:any)=>c.id===refs.id)];
    const index=probe.props.target.$entity[0];
    expect(index).toBeGreaterThanOrEqual(f.source().entities.length);
    expect(runtime.entities[index].name).toBe("Child");
    expect(probe.props.light.$component.entity).toEqual([index]);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
  });
  it("preserves a moved linked instance anchor and its component identities", () => {
    const f=fixture(),a=f.create("A"), b=f.create("B");
    const lamp=f.scene.queryComponents({entityId:b.id})[0].id;
    f.scene.updateComponent(lamp,{intensity:12});
    const observer=f.scene.create({name:"Observer"});
    f.scene.addComponent(observer.id,{type:"ReferenceProbe",props:{light:{$component:{instance:b.id,target:"lamp"}}}});
    f.scene.reparent(b.id,a.id);
    expect(f.scene.readComponent(lamp).props!.intensity).toBe(12);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
  });
  it("indexes inline references in Prefab compilation and rejects duplicate IDs", () => {
    const f=fixture(),a=f.create("A"), plain=f.scene.create({name:"Added"});
    f.scene.addComponent(plain.id,{type:"ReferenceProbe",props:{target:{$entity:plain.id}}});
    f.scene.reparent(plain.id,a.id);
    const scene=f.source();
    const prefab={asset:scene.asset,root:a.id,entities:scene.entities,components:scene.components};
    f.draft.create({virtualPath:"Outer.prefab",path:"Outer.prefab",type:"Prefab"},JSON.stringify(prefab));
    expect(()=>compileProjectResource(f.draft.preview(),"Outer.prefab")).not.toThrow();
    const added=scene.entities[0].instance.overrides.addedEntities;
    added.push({...structuredClone(added[0]),id:"duplicate-entry"});
    f.draft.update("Main.scene",JSON.stringify(scene));
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).toThrow(/must match override id|duplicate/);
  });
});


describe("inline Script lowering", () => {
  it("lowers inline scripts and keeps the component selector after an explicitly identified sibling", () => {
    const f=fixture();f.create("A");
    const source=f.source();
    source.entities[0].instance.overrides={addedEntities:[{id:"script-node",parent:"root",entity:{id:"script-node",components:[
      {id:"spin-first",type:"Script",script:{$ref:"Spin.ts"}},
      {id:"spin",type:"Script",script:{$ref:"Spin.ts"},props:{peer:{$component:"spin"}}}
    ]}}]};
    f.draft.update("Main.scene",JSON.stringify(source));
    const pack=f.draft.preview();
    pack.project.files.push({virtualPath:"Spin.ts",path:"Spin.ts",type:"Script"});
    pack.contents["Spin.ts"]="export default class Spin {}";
    const runtime=JSON.parse(compileProjectResource(pack,"Main.scene") as string);
    expect(runtime.refs.some((ref:any)=>ref.url==="Spin.ts")).toBe(false);
    const spin=runtime.components.find((c:any)=>c.props?.peer);
    expect(spin.type).toBe("Spin.ts");
    expect(spin.props.peer.$component).toMatchObject({type:"Spin.ts",index:1});
  });
});


it("allows finite Scene-local nesting but rejects recursive template dependencies", () => {
  const f=fixture();f.create("A");
  (f.prefab.entities[2].instance as any).overrides={addedEntities:[{id:"cycle",parent:"inner",entity:{id:"cycle",instance:{asset:{$ref:"Lamp.prefab"}}}}]};
  f.draft.update("Lamp.prefab",JSON.stringify(f.prefab));
  expect(()=>f.scene.list()).toThrow(/cycle detected|Recursive Prefab instance/);
});

describe("current Editor nested scopes",()=>{
  function nestedFixture() {
    const f=fixture();
    const asset=JSON.parse(f.draft.read("Nested.prefab") as string);
    asset.entities[0].children=["inner-child"];
    asset.entities.push({id:"inner-child",name:"Original",components:[]});
    f.draft.update("Nested.prefab",JSON.stringify(asset));
    const a=f.create("A"),b=f.create("B");
    const child=f.scene.list().find(e=>e.id.includes(a.id)&&e.id.includes('inner-child'))!;
    return {...f,a,b,child};
  }
  it("edits nested entity properties, adds local children/components, then deletes without changing the template",()=>{
    const f=nestedFixture(),before=f.draft.read("Nested.prefab");
    f.scene.update(f.child.id,{name:"Edited",position:[2,0,0]});
    expect(f.scene.list().find(e=>e.id===f.child.id)!.name).toBe("Edited");
    f.scene.revert(f.child.id,["name"]);
    expect(f.scene.list().find(e=>e.id===f.child.id)!.name).toBe("Original");
    expect(f.scene.list().find(e=>e.id===f.child.id)!.position).toEqual([2,0,0]);
    const added=f.scene.addComponent(f.child.id,{type:"PointLight",props:{intensity:4}});
    f.scene.updateComponent(added.id,{intensity:6});
    expect(f.scene.readComponent(added.id).props!.intensity).toBe(6);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
    f.scene.removeComponent(added.id);
    const child=f.scene.create({name:"Added",parentEntityId:f.child.id,position:[1,0,0]});
    expect(f.scene.list().find(e=>e.id===f.child.id)!.children).toContain(child.id);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
    f.scene.delete(child.id);f.scene.delete(f.child.id);
    expect(f.scene.list().some(e=>e.id===f.child.id)).toBe(false);
    expect(f.draft.read("Nested.prefab")).toBe(before);
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
  });
  it("keeps inherited template changes separate from outer instance overrides",()=>{
    const f=nestedFixture();
    const lamp=f.scene.queryComponents().find(c=>c.id.includes(f.a.id)&&c.id.includes('inner-light'))!;
    const asset=JSON.parse(f.draft.read("Lamp.prefab") as string);
    asset.entities.find((e:any)=>e.id==='nested').instance.overrides={componentProps:[{target:'inner-light',props:{intensity:10,distance:2}}]};
    f.draft.update("Lamp.prefab",JSON.stringify(asset));
    f.scene.updateComponent(lamp.id,{distance:5});
    asset.entities.find((e:any)=>e.id==='nested').instance.overrides.componentProps[0].props.intensity=12;
    f.draft.update("Lamp.prefab",JSON.stringify(asset));
    expect(f.scene.readComponent(lamp.id).props).toMatchObject({intensity:12,distance:5});
    f.scene.revertComponent(lamp.id);
    expect(f.scene.readComponent(lamp.id).props).toMatchObject({intensity:12,distance:2});
    expect(()=>compileProjectResource(f.draft.preview(),"Main.scene")).not.toThrow();
  });
});

it("compiles a Script added inside an inherited nested scope without a runtime Script asset ref",()=>{
  const f=fixture(),a=f.create("A"),asset=JSON.parse(f.draft.read("Nested.prefab") as string);
  asset.entities[0].children=['slot'];asset.entities.push({id:'slot',components:[]});f.draft.update("Nested.prefab",JSON.stringify(asset));
  f.draft.create({virtualPath:'Spin.ts',path:'Spin.ts',type:'script'},'export default class Spin {}');
  const node=f.scene.list().find(e=>e.id.includes(a.id)&&e.id.includes('slot'))!;
  const added=f.scene.addComponent(node.id,{type:'Script',script:{$ref:'Spin.ts'},props:{speed:2}});
  expect(f.scene.readComponent(added.id).script?.$ref).toBe('Spin.ts');
  const runtime=JSON.parse(compileProjectResource(f.draft.preview(),"Main.scene") as string);
  expect(runtime.components.some((c:any)=>c.type==='Spin.ts')).toBe(true);
  expect(runtime.refs.some((r:any)=>r.url==='Spin.ts')).toBe(false);
});

it("indexes existing nested additions with the native allocation order for later reference-only Apply",()=>{
  const f=fixture(),a=f.create("A"),b=f.create("B");
  const asset=JSON.parse(f.draft.read("Nested.prefab") as string);asset.entities[0].children=['leaf'];asset.entities.push({id:'leaf',components:[]});
  f.draft.update("Nested.prefab",JSON.stringify(asset));
  const targets=[a,b].map(root=>f.scene.list().find(e=>e.id.includes(root.id)&&e.id.includes('leaf'))!.id);
  const local=targets.map(parentEntityId=>f.scene.create({name:'Local',parentEntityId}).id);
  const observer=f.scene.create({name:'Observer'});
  f.scene.addComponent(observer.id,{type:'ReferenceProbe',props:{first:{$entity:local[0]},second:{$entity:local[1]}}});
  const source=f.source();source.prefab.nestedOverrides.reverse();f.draft.update("Main.scene",JSON.stringify(source));
  const runtime=JSON.parse(compileProjectResource(f.draft.preview(),"Main.scene") as string);
  const index=runtimeSourceReferenceIds(source,{resolveInstanceSourceFile:path=>JSON.parse(f.draft.read(path) as string),resolveInstanceAssetKind:()=> 'Prefab'});
  const props=runtime.components.find((c:any)=>c.props?.first).props;
  expect(index.entities[props.first.$entity[0]]).toBe(local[0]);
  expect(index.entities[props.second.$entity[0]]).toBe(local[1]);
});

it("resolves nested additions anchored in a Scene-local Prefab instance",()=>{
  const f=fixture(),a=f.create("A");
  f.draft.create({virtualPath:'Host.prefab',path:'Host.prefab',type:'Prefab'},f.draft.read('Lamp.prefab'));
  const host=f.scene.create({name:'Host',parentEntityId:a.id,prefab:'Host.prefab'});
  const nested=f.scene.list().find(e=>e.id.includes(host.id)&&e.id.includes('nested'))!;
  const local=f.scene.create({name:'Local',parentEntityId:nested.id});
  const observer=f.scene.create({name:'Observer'});
  f.scene.addComponent(observer.id,{type:'ReferenceProbe',props:{target:{$entity:local.id}}});
  const source=f.source(),runtime=JSON.parse(compileProjectResource(f.draft.preview(),"Main.scene") as string);
  const index=runtimeSourceReferenceIds(source,{resolveInstanceSourceFile:path=>JSON.parse(f.draft.read(path) as string),resolveInstanceAssetKind:()=> 'Prefab'});
  const props=runtime.components.find((c:any)=>c.props?.target).props;
  expect(index.entities[props.target.$entity[0]]).toBe(local.id);
});
