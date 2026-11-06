import { RUNTIME_PROJECT_SAVE_VERSION } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { describe, expect, it } from "vitest";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";
import { RuntimeSceneEdit } from "../src/runtime-editor/scene/runtime-scene-edit";
import { compileProjectResource } from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler.ts";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";

function project(): RuntimeProjectPackage {
  return { version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: "main.scene", files: [{  virtualPath: "main.scene", path: "main.scene", type: "Scene" }] }, contents: {
    "main.scene": JSON.stringify({ asset: { version: "2.0" }, scene: { rootEntities: [], background: { mode: 0, color: { r: 0, g: 0, b: 0, a: 1 } } }, entities: [], components: [] })
  } };
}
const formats = new Map([["Scene", { validate: (content: string | Uint8Array) => { JSON.parse(content as string); }, references: () => [] as string[] }]]);

describe("native scene draft", () => {
  it("creates a hierarchy and Light in the actual Editor source format", () => {
    const original = project();
    const draft = new RuntimeProjectEdit(original, formats);
    const scene = new RuntimeSceneEdit(draft, "main.scene");
    const parent = scene.create({ name: "Parent", position: [1, 2, 3] });
    const child = scene.create({ name: "Light", parentEntityId: parent.id });
    const light = scene.addComponent(child.id, { type: "DirectLight", props: { shadowStrength: 1 } });
    scene.updateComponent(light.id, { shadowStrength: 2 });
    scene.update(child.id, { rotation: [0, 90, 0] });
    const candidate = draft.finish();
    const runtime = JSON.parse(compileProjectResource(candidate, "main.scene") as string);
    expect(runtime.scene.rootEntities).toEqual([0]);
    expect(runtime.entities[0].children).toEqual([1]);
    expect(runtime.entities[1].components).toEqual([0]);
    expect(runtime.components[0]).toEqual({ type: "DirectLight", props: { shadowStrength: 2 } });
    expect(JSON.parse(original.contents["main.scene"] as string).entities).toEqual([]);
  });
  it("removes owned descendants and components while retaining unrelated entities", () => {
    const draft = new RuntimeProjectEdit(project(), formats);
    const scene = new RuntimeSceneEdit(draft, "main.scene");
    const parent = scene.create({ name: "Parent" });
    const child = scene.create({ name: "Child", parentEntityId: parent.id });
    const retained = scene.create({ name: "Retained" });
    scene.addComponent(child.id, { type: "DirectLight" });
    scene.delete(parent.id);
    const candidate = draft.finish();
    const source = JSON.parse(candidate.contents["main.scene"] as string);
    expect(source.entities.map((entity: any) => entity.id)).toEqual([retained.id]);
    expect(source.components).toEqual([]);
    expect(() => compileProjectResource(candidate, "main.scene")).not.toThrow();
  });
  it("rejects missing identities without changing the draft", () => {
    const draft = new RuntimeProjectEdit(project(), formats);
    const scene = new RuntimeSceneEdit(draft, "main.scene");
    expect(() => scene.create({ name: "Invalid", parentEntityId: "missing" })).toThrow("Unknown entity");
    expect(scene.list()).toEqual([]);
  });
});


it("queries stable component identities and reads the current draft after edits", () => {
  const draft = new RuntimeProjectEdit(project(), formats);
  const scene = new RuntimeSceneEdit(draft, "main.scene");
  const a = scene.create({name: "same name"}), b = scene.create({name: "same name"});
  const first = scene.addComponent(a.id, {type: "DirectLight", props: {intensity: 1}});
  const second = scene.addComponent(b.id, {type: "DirectLight", props: {intensity: 2}});
  const identity = {scene: "main.scene", entityId: a.id, id: first.id, type: "DirectLight"};
  expect(scene.queryComponents({entityId: a.id, type: "DirectLight"})).toEqual([identity]);
  expect(scene.queryComponents({id: second.id, entityId: a.id})).toEqual([]);
  expect(scene.queryComponents({type: "Camera"})).toEqual([]);
  scene.updateComponent(first.id, {intensity: 3});
  expect(scene.readComponent(first.id)).toEqual({...identity, props: {intensity: 3}});
  const detached = scene.readComponent(first.id);
  detached.props!.intensity = 100;
  expect(scene.readComponent(first.id).props!.intensity).toBe(3);
  scene.delete(a.id);
  expect(scene.queryComponents().map(ref => ref.id)).toEqual([second.id]);
  expect(() => scene.readComponent(first.id)).toThrow("Unknown component");
});

function hierarchyDraft() {
  const draft = new RuntimeProjectEdit(project(), formats);
  return {draft, scene:new RuntimeSceneEdit(draft,"main.scene")};
}

describe("ordinary hierarchy reparent", () => {
  it("keeps identity, references and world position while changing parent", () => {
    const {draft,scene}=hierarchyDraft();
    const a=scene.create({name:"A",position:[10,0,0]}),b=scene.create({name:"B",position:[20,0,0]});
    const child=scene.create({name:"Child",parentEntityId:a.id,position:[2,0,0]});
    const component=scene.addComponent(child.id,{type:"PointLight",props:{peer:{$entity:child.id}}});
    scene.reparent(child.id,b.id);
    expect(scene.list().find(e=>e.id===child.id)!.position).toEqual([-8,0,0]);
    expect(scene.list().find(e=>e.id===a.id)!.children).toEqual([]);
    expect(scene.list().find(e=>e.id===b.id)!.children).toEqual([child.id]);
    expect(scene.readComponent(component.id).props!.peer).toEqual({$entity:child.id});
    scene.reparent(child.id,null);
    expect(scene.list().find(e=>e.id===child.id)!.position).toEqual([12,0,0]);
    expect(()=>compileProjectResource(draft.preview(),"main.scene")).not.toThrow();
  });
  it("preserves world pose under rotated and uniformly scaled parents", () => {
    const {scene}=hierarchyDraft();
    const parent=scene.create({name:"Parent",position:[10,0,0],rotation:[0,90,0],scale:[2,2,2]});
    const child=scene.create({name:"Child",parentEntityId:parent.id,position:[1,0,0]});
    scene.reparent(child.id,null);
    const record=scene.list().find(e=>e.id===child.id)!;
    expect(record.position![0]).toBeCloseTo(10);expect(record.position![2]).toBeCloseTo(-2);
    expect(record.scale).toEqual([2,2,2]);expect(record.rotation![1]).toBeCloseTo(90);
  });
  it("can explicitly preserve local pose instead", () => {
    const {scene}=hierarchyDraft();
    const parent=scene.create({name:"Parent",position:[5,0,0]}),child=scene.create({name:"Child",position:[2,0,0]});
    scene.reparent(child.id,parent.id,false);
    expect(scene.list().find(e=>e.id===child.id)!.position).toEqual([2,0,0]);
  });
  it("rejects cycles, unknown parents, singular matrices and shear atomically", () => {
    const {scene,draft}=hierarchyDraft();
    const a=scene.create({name:"A"}),child=scene.create({name:"Child",parentEntityId:a.id});
    const zero=scene.create({name:"Zero",scale:[0,1,1]});
    const skew=scene.create({name:"Skew",rotation:[0,0,45],scale:[2,1,1]});
    const before=draft.preview();
    expect(()=>scene.reparent(a.id,child.id)).toThrow("descendant");
    expect(()=>scene.reparent(a.id,a.id)).toThrow("descendant");
    expect(()=>scene.reparent(a.id,"missing")).toThrow("Unknown");
    expect(()=>scene.reparent(a.id,zero.id)).toThrow("singular");
    expect(()=>scene.reparent(a.id,skew.id)).toThrow("shear");
    expect(draft.preview()).toEqual(before);
  });
});
