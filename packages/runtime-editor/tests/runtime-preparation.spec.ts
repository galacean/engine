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
