import { afterEach, expect, it, vi } from "vitest";
vi.hoisted(() => { (globalThis as any).window ??= {}; });
import { historyFixture } from "./runtime-history-fixture";
const disposals: (()=>void)[]=[];
afterEach(()=>{disposals.splice(0).reverse().forEach(fn=>fn());vi.restoreAllMocks();});
it("prepares contributed authoring in the outer draft and replays its history without regenerating",async()=>{
  const f=await historyFixture();disposals.push(f.dispose);
  let calls=0;
  f.editor.editor.registerPreparation(async edit=>{
    calls++;
    await edit.run(({draft,edited})=>{
      expect(JSON.parse(draft.read("input.json") as string)).toEqual({value:7});
      draft.create({virtualPath:"derived.json",path:"derived.json",type:"JSON"},'{"initialized":true}');edited();
    });
  });
  const tx=f.editor.beginEdit("outer",f.signal,()=>[{file:{virtualPath:"input.json",path:"input.json",type:"JSON"},content:'{"value":7}'}]);
  await tx.prepare(f.signal);
  expect(f.project.projectPackage.contents["derived.json"]).toBeUndefined();
  await tx.commit();await tx.activate(f.signal);
  expect(f.project.projectPackage.contents["derived.json"]).toBe('{"initialized":true}');
  for(const direction of ["undo","redo"] as const){
    const move=f.editor.beginEdit(direction,f.signal);await move.moveHistory({direction,transactionIds:["outer"]});await f.commit(move);
    expect(f.project.projectPackage.contents["derived.json"]).toBe(direction==="undo"?undefined:'{"initialized":true}');
  }
  expect(calls).toBe(1);
});
it("failed or aborted preparation does not publish partial contributions",async()=>{
  const f=await historyFixture();disposals.push(f.dispose);
  const revision=f.project.publicationRevision;
  const controller=new AbortController();
  const unregister=f.editor.editor.registerPreparation(async edit=>{
    await edit.run(({draft,edited})=>{draft.create({virtualPath:"partial.json",path:"partial.json",type:"JSON"},'{}');edited();});
    controller.abort();
  });
  const tx=f.editor.beginEdit("cancel",controller.signal);
  await f.invoke(tx,"asset.create",{path:"input.json",type:"JSON",content:"{}"});
  await expect(tx.prepare(controller.signal)).rejects.toBeDefined();tx.discard();unregister();
  expect(f.project.publicationRevision).toBe(revision);expect(f.project.projectPackage.contents["partial.json"]).toBeUndefined();
  const retry=f.editor.beginEdit("retry",f.signal);await f.invoke(retry,"asset.create",{path:"input.json",type:"JSON",content:"{}"});await f.commit(retry);
  expect(f.project.projectPackage.contents["input.json"]).toBe("{}");
});
it("validates all preparation output before commit",async()=>{
  const f=await historyFixture();disposals.push(f.dispose);
  f.editor.editor.registerPreparation(async edit=>{
    await edit.run(({draft,edited})=>{const source=JSON.parse(draft.read("main.scene") as string);source.scene.rootEntities.push("missing");draft.update("main.scene",JSON.stringify(source));edited();});
  });
  const tx=f.editor.beginEdit("invalid",f.signal);await f.invoke(tx,"asset.create",{path:"input.json",type:"JSON",content:"{}"});
  await expect(tx.prepare(f.signal)).rejects.toThrow();tx.discard();expect(f.project.projectPackage.contents["input.json"]).toBeUndefined();
});

it("scopes preparation to project inputs without bypassing final validation or combined edits", async () => {
  const f = await historyFixture(new Map([["HostState", { validate(content) { JSON.parse(content as string); }, references: () => [], referenceTypes: [] }]]));
  disposals.push(f.dispose);
  // Establish the host namespace before registration, as initialization does in Seed World.
  const init = f.editor.beginEdit("init", f.signal, () => [{ file: { virtualPath: "host.json", path: "host.json", type: "HostState" }, content: '{"time":1}' }]);
  await f.commit(init);
  const prepare = vi.fn(async () => {});
  f.editor.editor.registerPreparation(prepare, { rootTypes: ["Scene"] });
  const contribute = () => [{ file: { virtualPath: "host.json", path: "host.json", type: "HostState" }, content: '{"time":2}' }];
  const time = f.editor.beginEdit("time", f.signal, contribute);
  await f.commit(time);
  expect(prepare).not.toHaveBeenCalled();
  const combined = f.editor.beginEdit("combined", f.signal, contribute);
  await combined.run(({ draft, edited }) => {
    const scene = JSON.parse(draft.read("main.scene") as string);
    scene.scene.name = "Changed"; draft.update("main.scene", JSON.stringify(scene)); edited();
  });
  await f.commit(combined);
  expect(prepare).toHaveBeenCalledTimes(1);
  const invalid = f.editor.beginEdit("invalid", f.signal, () => [{ ...contribute()[0], content: "{" }]);
  await expect(invalid.prepare(f.signal)).rejects.toThrow();
  invalid.discard();
});

it("checks scoped inputs after preceding preparations, and retries after cancellation", async () => {
  const f = await historyFixture(); disposals.push(f.dispose);
  const controller = new AbortController();
  let cancel = true;
  f.editor.editor.registerPreparation(async edit => {
    await edit.run(({ draft, edited }) => {
      const scene = JSON.parse(draft.read("main.scene") as string);
      scene.scene.name = "Prepared"; draft.update("main.scene", JSON.stringify(scene)); edited();
    });
  });
  const scoped = vi.fn(async () => { if (cancel) controller.abort(); });
  f.editor.editor.registerPreparation(scoped, { contentTypes: ["Scene", "Prefab"] });
  const tx = f.editor.beginEdit("cancel", controller.signal);
  await f.invoke(tx, "asset.create", { path: "input.json", type: "JSON", content: "{}" });
  await expect(tx.prepare(controller.signal)).rejects.toBeDefined(); tx.discard();
  expect(f.project.projectPackage.contents["input.json"]).toBeUndefined();
  cancel = false;
  const retry = f.editor.beginEdit("retry", f.signal);
  await f.invoke(retry, "asset.create", { path: "input.json", type: "JSON", content: "{}" });
  await f.commit(retry);
  expect(scoped).toHaveBeenCalledTimes(2);
});
