import {afterEach, expect, it, vi} from "vitest";
import {historyFixture} from "./runtime-history-fixture";
vi.hoisted(() => { (globalThis as any).window ??= {}; });
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); });
async function setup() { const f = await historyFixture(); cleanups.push(f.dispose); return f; }

it("keeps independent IDs, atomically navigates an ordered batch, and clears redo on a new edit", async () => {
  const f = await setup();
  for (let i = 1; i <= 3; i++) {
    const edit = f.editor.beginEdit(`T${i}`, f.signal);
    await edit.documents!.write("note.txt", String(i)); await f.commit(edit);
  }
  expect(f.project.history.query().undo.map(e => e.transactionId)).toEqual(["T3", "T2", "T1"]);
  const revision = f.project.publicationRevision;
  const undo = f.editor.beginEdit("undo", f.signal);
  await f.invoke(undo, "history.undo", {transactionIds: ["T3", "T2"]});
  expect(f.project.projectPackage.documents?.["note.txt"]).toBe("3");
  await f.commit(undo);
  expect(f.project.publicationRevision).toBe(revision + 1);
  expect(f.project.projectPackage.documents?.["note.txt"]).toBe("1");
  expect(f.project.history.query().redo.map(e => e.transactionId)).toEqual(["T2", "T3"]);
  const redo = f.editor.beginEdit("redo", f.signal);
  await f.invoke(redo, "history.redo", {transactionIds: ["T2", "T3"]}); await f.commit(redo);
  expect(f.project.projectPackage.documents?.["note.txt"]).toBe("3");
  const again = f.editor.beginEdit("undo2", f.signal);
  await again.moveHistory({direction: "undo", transactionIds: ["T3"]}); await f.commit(again);
  const next = f.editor.beginEdit("T4", f.signal); await next.documents!.write("note.txt", "4"); await f.commit(next);
  expect(f.project.history.query().redo).toEqual([]);
});

it("rejects skipped IDs, duplicate IDs, stale drafts and mixed edits without moving stacks", async () => {
  const f = await setup();
  for (const id of ["A", "B"]) {const tx = f.editor.beginEdit(id, f.signal); await tx.documents!.write("note.txt", id); await f.commit(tx);}
  const before = f.project.history.query();
  for (const ids of [["A"], ["B", "B"], []]) {
    const tx = f.editor.beginEdit(crypto.randomUUID(), f.signal);
    await expect(tx.moveHistory({direction: "undo", transactionIds: ids})).rejects.toThrow("contiguous"); tx.discard();
  }
  const mixed = f.editor.beginEdit("mixed", f.signal);
  await mixed.documents!.write("note.txt", "mix");
  await expect(mixed.moveHistory({direction: "undo", transactionIds: ["B"]})).rejects.toThrow("only edit"); mixed.discard();
  const stale = f.editor.beginEdit("stale", f.signal); await stale.moveHistory({direction: "undo", transactionIds: ["B"]});
  const newer = f.editor.beginEdit("C", f.signal); await newer.documents!.write("note.txt", "C"); await f.commit(newer);
  await expect(stale.prepare(f.signal)).rejects.toThrow("Stale"); stale.discard();
  expect(f.project.history.query().undo.slice(1)).toEqual(before.undo);
});

it("cancellation before commit leaves authoring/history unchanged; activation failure retains accepted history", async () => {
  const f = await setup();
  const initial = f.editor.beginEdit("A", f.signal); await initial.documents!.write("a.txt", "A"); await f.commit(initial);
  const control = new AbortController(), tx = f.editor.beginEdit("undo", control.signal);
  await tx.moveHistory({direction: "undo", transactionIds: ["A"]}); control.abort();
  await expect(tx.prepare(control.signal)).rejects.toThrow(); tx.discard();
  expect(f.project.history.query().undo[0].transactionId).toBe("A");
  const stop = f.project.registerRuntimeActivation({before: async () => {}, after: async () => { throw Error("consumer failed"); }});
  const undo = f.editor.beginEdit("undo2", f.signal); await undo.moveHistory({direction: "undo", transactionIds: ["A"]});
  await undo.prepare(f.signal); await undo.commit(); await expect(undo.activate(f.signal)).rejects.toThrow("consumer failed");
  expect(f.project.projectPackage.documents?.["a.txt"]).toBeUndefined();
  expect(f.project.history.query().redo[0]).toMatchObject({transactionId: "A", runtime: "failed", runtimeErrors: ["consumer failed"]}); stop();
  await undo.activate(f.signal); expect(f.project.history.query().redo[0].runtime).toBe("applied");
});

it("restores binary bytes, metadata and empty directories while preserving live runtime-owned state", async () => {
  const f = await setup();
  const owner = f.project.ownRuntimeAsset({virtualPath: "state.json", path: "state", type: "JSON", dependencies: []}, "project");
  await owner.update(() => ({content: '{"value":0}', value: undefined}));
  const next = structuredClone(f.project.projectPackage);
  next.project.files.push({virtualPath: "unit.bin", path: "unit", type: "Buffer", dependencies: []});
  next.project.directories = ["empty"]; next.contents["unit.bin"] = new Uint8Array([1, 2]);
  await f.project.publish(next, f.project.publicationRevision, [], {transactionId: "bytes"});
  await owner.update(() => ({content: '{"value":9}', value: undefined}));
  const undo = f.editor.beginEdit("undo", f.signal); await undo.moveHistory({direction: "undo", transactionIds: ["bytes"]}); await f.commit(undo);
  expect(f.project.projectPackage.contents["state.json"]).toBe('{"value":9}'); expect(f.project.projectPackage.contents["unit.bin"]).toBeUndefined();
  const redo = f.editor.beginEdit("redo", f.signal); await redo.moveHistory({direction: "redo", transactionIds: ["bytes"]}); await f.commit(redo);
  expect(f.project.projectPackage.contents["unit.bin"]).toEqual(new Uint8Array([1, 2]));
  expect(f.project.projectPackage.project.directories).toEqual(["empty"]); owner.dispose();
});


it("captures the old bytes for direct replacement of an unloaded source; reading alone is not history", async () => {
  const f = await setup();
  const file = {virtualPath: "late.bin", path: "https://example.test/late.bin", type: "Buffer", dependencies: []};
  await f.project.update(pack => ({...pack, project: {...pack.project, files: [...pack.project.files, file]}}));
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1])));
  const baseline = f.project.history.query().undo.length;
  await f.project.publishAsset(file, new Uint8Array([2]));
  const entry = f.project.history.query().undo[0];
  expect(f.project.history.query().undo).toHaveLength(baseline + 1);
  const undo = f.editor.beginEdit("undo-late", f.signal);
  await undo.moveHistory({direction: "undo", transactionIds: [entry.transactionId]}); await f.commit(undo);
  expect(f.project.projectPackage.contents["late.bin"]).toEqual(new Uint8Array([1]));
  const size = f.project.history.query().undo.length;
  await f.project.fileProvider().prepare!("late.bin");
  expect(f.project.history.query().undo).toHaveLength(size);
});
