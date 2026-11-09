import { afterEach, expect, it, vi } from "vitest";
vi.hoisted(() => { (globalThis as any).window ??= {}; });
import { historyFixture } from "./runtime-history-fixture";
afterEach(() => vi.restoreAllMocks());

it("captures all accepted contributions and preparations, and restores them without replaying preparation", async () => {
  const f = await historyFixture();
  try {
    for (const path of ["changed.json", "deleted.json"])
      await f.project.publishAsset({virtualPath:path,path,type:"JSON"},'{"value":0}');
    const before = structuredClone(f.project.projectPackage);
    let calls = 0;
    f.editor.editor.registerPreparation(async edit => {
      calls++;
      await edit.run(({draft,edited}) => {
        draft.create({virtualPath:"prepared.json",path:"prepared.json",type:"JSON"},"{}");
        draft.update("changed.json",'{"value":1}');
        draft.delete("deleted.json");
        draft.writeDocument("notes/initialization.txt", "initialized");
        edited();
      });
    });
    const tx = f.editor.beginEdit("outer",f.signal,()=>[{file:{virtualPath:"host.json",path:"host.json",type:"JSON"},content:"{}"}]);
    await f.invoke(tx,"asset.create",{path:"authored.json",type:"JSON",content:"{}"});
    expect(() => tx.captureUndo()).toThrow("committed");
    await tx.prepare(f.signal);
    expect(() => tx.captureUndo()).toThrow("committed");
    await tx.commit();
    const patch = tx.captureUndo();
    const after = structuredClone(f.project.projectPackage);
    // A caller cannot mutate the cached patch, or the project's history entry.
    tx.captureUndo().splice(0);
    expect(tx.captureUndo()).toEqual(patch);
    const undo = f.editor.beginEdit("undo",f.signal);
    await undo.restoreUndo(patch);await f.commit(undo);
    expect(f.project.projectPackage).toEqual({...before,documents:before.documents ?? {}});
    const redo = f.editor.beginEdit("redo",f.signal);
    await redo.restoreUndo(undo.captureUndo());await f.commit(redo);
    expect(f.project.projectPackage).toEqual(after);
    expect(calls).toBe(1);
  } finally { f.dispose(); }
});

it("retains the accepted undo after activation fails or its signal is aborted", async () => {
  const f = await historyFixture(), controller = new AbortController();
  try {
    const tx = f.editor.beginEdit("outer",controller.signal);
    await f.invoke(tx,"asset.create",{path:"authored.json",type:"JSON",content:"{}"});
    await tx.prepare(controller.signal);await tx.commit();
    const unregister = f.project.registerRuntimeActivation({before:async()=>{throw Error("consumer failed");},after:async()=>{}});
    await expect(tx.activate(controller.signal)).rejects.toThrow("consumer failed");
    unregister();controller.abort();tx.discard();
    const back = f.editor.beginEdit("restore",f.signal);
    await back.restoreUndo(tx.captureUndo());await f.commit(back);
    expect(f.project.projectPackage.contents["authored.json"]).toBeUndefined();
  } finally {f.dispose();}
});

it("does not expose an undo receipt for failed preparation or stale publication", async () => {
  const f=await historyFixture();
  try {
    const unregister=f.editor.editor.registerPreparation(async()=>{throw Error("prepare failed");});
    const failed=f.editor.beginEdit("failed",f.signal);
    await f.invoke(failed,"asset.create",{path:"failed.json",type:"JSON",content:"{}"});
    await expect(failed.prepare(f.signal)).rejects.toThrow("prepare failed");
    expect(()=>failed.captureUndo()).toThrow("committed");failed.discard();unregister();
    const stale=f.editor.beginEdit("stale",f.signal);
    await f.invoke(stale,"asset.create",{path:"stale.json",type:"JSON",content:"{}"});
    await stale.prepare(f.signal);
    await f.project.publishAsset({virtualPath:"newer.json",path:"newer.json",type:"JSON"},"{}");
    await expect(stale.commit()).rejects.toThrow("Stale");
    expect(()=>stale.captureUndo()).toThrow("committed");stale.discard();
    expect(f.project.projectPackage.contents["stale.json"]).toBeUndefined();
  } finally {f.dispose();}
});

it("returns an empty patch for an accepted no-op", async()=>{
  const f=await historyFixture();
  try {const tx=f.editor.beginEdit("noop",f.signal);await f.commit(tx);expect(tx.captureUndo()).toEqual([]);}
  finally {f.dispose();}
});
