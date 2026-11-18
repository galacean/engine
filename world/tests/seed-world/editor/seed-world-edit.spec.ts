import { describe, expect, it, vi } from "vitest";
import { beginSeedWorldProjectEdit } from "../../../demos/seed-world/agent-adapter/SeedWorldProjectEdit";
import type { RuntimeProjectContribution } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor.ts";
import { setup } from "./seed-world-edit-harness";

describe("Seed World execute transactions", () => {

  it("commits project authoring before activation and can activate after cancellation with a fresh signal", async () => {
    const test = await setup();
    const before = test.application.getEditorDocument();
    const controller = new AbortController();
    const signal = controller.signal;
    const publish = test.native.project.publish.bind(test.native.project);
    vi.spyOn(test.native.project, "publish").mockImplementation(async (...args) => { const undo = await publish(...args); controller.abort(); return undo; });
    const transaction = beginSeedWorldProjectEdit(test.application, test.native.editor, "mixed", signal);
    const time = transaction.tools.find(tool => tool.name === "time.update")!;
    await time.execute(time.parseInput({ timeHours: 18, transitionDuration: 0, waitForIbl: false }), { signal });
    await transaction.prepare(signal);
    expect(test.native.project.projectPackage.contents["World/Editor.json"]).toBeUndefined();
    expect(test.application.getEditorDocument()).toEqual(before);
    await transaction.commit();
    expect(JSON.parse(test.native.project.projectPackage.contents["World/Editor.json"] as string).settings.environment.timeHours).toBe(18);
    expect(signal.aborted).toBe(true);
    await expect(transaction.activate(signal)).rejects.toThrow();
    expect(test.application.getEditorDocument()).toEqual(before);
    await transaction.activate(new AbortController().signal);
    expect(test.application.getEditorDocument().settings.environment?.timeHours).toBe(18);
    expect(test.port.readWorldState()?.lighting.timeHours).toBe(18);
    expect(await test.run('return await tools.time.get();')).toMatchObject({ ok: true });
    expect(test.application.getEditorDocument().settings.environment?.timeHours).toBe(18);
  });

  it.each(["before-commit", "during-failed-publication"] as const)("releases the prepared world after cancellation %s", async phase => {
    const test = await setup();
    const before = test.application.getEditorDocument();
    const controller = new AbortController();
    const begin = test.application.beginEdit.bind(test.application);
    let discard: ReturnType<typeof vi.fn>;
    vi.spyOn(test.application, "beginEdit").mockImplementation((...args) => {
      const world = begin(...args);
      discard = vi.fn(world.discard.bind(world));
      world.discard = discard;
      return world;
    });
    const publish = vi.spyOn(test.native.project, "publish").mockImplementation(async () => {
      controller.abort();
      throw new Error("publication unavailable");
    });
    const tx = beginSeedWorldProjectEdit(test.application, test.native.editor, "cancel-publication", controller.signal);
    const time = tx.tools.find(tool => tool.name === "time.update")!;
    await time.execute(time.parseInput({ timeHours: 18, transitionDuration: 0, waitForIbl: false }), { signal: controller.signal });
    await tx.prepare(controller.signal);
    if (phase === "before-commit") controller.abort();
    await expect(tx.commit()).rejects.toThrow(phase === "before-commit" ? "aborted" : "publication unavailable");
    expect(publish).toHaveBeenCalledTimes(phase === "before-commit" ? 0 : 1);
    expect(discard!).toHaveBeenCalledOnce();
    expect(test.application.getEditorDocument()).toEqual(before);
    expect(test.native.project.projectPackage.contents["World/Editor.json"]).toBeUndefined();
    await tx.discard();
    publish.mockRestore();
    expect(await test.run('return await tools.time.get();')).toMatchObject({ ok: true });
  });

  it("exposes the exact prepared world document before publication without leaking edits", async () => {
    const test = await setup();
    const before = test.application.getEditorDocument();
    const signal = new AbortController().signal;
    const transaction = test.application.beginEdit("persist-world", signal);
    expect(() => transaction.getPreparedDocument()).toThrow("not prepared");
    const time = transaction.tools.find(tool => tool.name === "time.update")!;
    await time.execute(time.parseInput({ timeHours: 18, transitionDuration: 0, waitForIbl: false }), { signal });
    await transaction.prepare(signal);
    const prepared = transaction.getPreparedDocument();
    expect(prepared.settings.environment?.timeHours).toBe(18);
    expect(test.application.getEditorDocument()).toEqual(before);
    Reflect.set(prepared.settings.environment!, "timeHours", 4);
    const stored = transaction.getPreparedDocument();
    expect(stored.settings.environment?.timeHours).toBe(18);
    await transaction.commit();
    expect(test.application.getEditorDocument()).toEqual(stored);
  });

  it("accepts the runtime world origin when validating a committed time edit", async () => {
    const test = await setup([0, 0]);
    const result = await test.run('return await tools.time.update({timeHours: 15, transitionDuration: 0, waitForIbl: false});');
    expect(result).toMatchObject({ok: true, output: {state: {world: {origin: [0, 0]}, lighting: {timeHours: 15}}}, receipt: {status: "committed"}});
    expect(test.port.readWorldState()?.lighting.timeHours).toBe(15);
    expect(test.application.getEditorDocument().settings.environment?.timeHours).toBe(15);
  });

  it("keeps a committed editor target and reports activation failure without inviting a duplicate edit", async () => {
    const test = await setup();
    test.port.updateEnvironment = vi.fn(async () => { throw new Error("IBL publication failed"); });
    const result = await test.run('await tools.time.update({ timeHours: 18, waitForIbl: false }); return null;');
    expect(result).toMatchObject({ ok: true, receipt: { status: "committed", runtimeErrors: [expect.stringContaining("IBL publication failed")] } });
    expect(test.application.getEditorDocument().settings.environment?.timeHours).toBe(18);
  });
});


it("undo restores a prior committed time target even if its activation failed", async () => {
  const test = await setup();
  const activate = test.port.updateEnvironment;
  test.port.updateEnvironment = async () => { throw new Error("activation failed"); };
  expect(await test.run('await tools.time.update({timeHours: 18, waitForIbl: false}); return null;'))
    .toMatchObject({ ok: true, receipt: { status: "committed", runtimeErrors: [expect.any(String)] } });
  expect(test.port.readWorldState()?.lighting.timeHours).toBe(12);
  test.port.updateEnvironment = activate;
  expect(await test.run('await tools.time.update({timeHours: 20, waitForIbl: false}); return null;')).toMatchObject({ ok: true });
  expect(await test.run('const h = await editor.history.query({}); return await editor.history.undo({transactionIds: [h.items[0].transactionId]});')).toMatchObject({ ok: true });
  expect(test.application.getEditorDocument().settings.environment?.timeHours).toBe(18);
  expect(test.port.readWorldState()?.lighting.timeHours).toBe(18);
});

it("rejects a history operation mixed with a new time edit", async () => {
  const test = await setup();
  expect(await test.run('await tools.time.update({timeHours: 18, waitForIbl: false});')).toMatchObject({ok: true});
  expect(await test.run('await tools.time.update({timeHours: 20, waitForIbl: false}); const h = await editor.history.query({}); await editor.history.undo({transactionIds: [h.items[0].transactionId]});')).toMatchObject({ok: false});
  expect(test.port.readWorldState()?.lighting.timeHours).toBe(18);
});

it("restores missing time configuration without replaying the old explicit transition start", async () => {
  const test = await setup();
  expect(await test.run('await tools.time.update({timeHours: 18, fromTimeHours: 6, transitionDuration: 7, waitForIbl: false}); return null;'))
    .toMatchObject({ ok: true });
  expect(test.application.getEditorDocument().settings.environment).toMatchObject({timeHours: 18, fromTimeHours: 6, transitionDuration: 7});
  expect(await test.run('const h = await editor.history.query({}); return await editor.history.undo({transactionIds: [h.items[0].transactionId]});')).toMatchObject({ ok: true });
  expect(test.application.getEditorDocument().settings.environment).toBeUndefined();
  expect(test.port.readWorldState()?.lighting.timeHours).toBe(12);
  expect(test.effects.at(-1)).toEqual({timeHours: 12, transitionDuration: 0, waitForIbl: false});
});

it("keeps ordered time writes and their intermediate draft reads, then undoes the whole execution", async () => {
  const test = await setup();
  expect(await test.run(`
    await tools.time.update({timeHours: 18, transitionDuration: 7, waitForIbl: false});
    const first = (await tools.time.get()).timeHours;
    await tools.time.update({timeHours: 20, transitionDuration: 2, waitForIbl: false});
    return [first, (await tools.time.get()).timeHours];
  `)).toMatchObject({ok: true, output: [18, 20]});
  expect(test.application.getEditorDocument().settings.environment).toMatchObject({timeHours: 20, transitionDuration: 2});
  expect(await test.run('const h = await editor.history.query({}); return await editor.history.undo({transactionIds: [h.items[0].transactionId]});')).toMatchObject({ok: true});
  expect(test.effects.map(effect => (effect as {timeHours: number}).timeHours)).toEqual([18, 20, 12]);
  expect(test.application.getEditorDocument().settings.environment).toBeUndefined();
});

it("redo restores the accepted target and options without replaying intermediate commands", async () => {
  const test = await setup();
  expect(await test.run('await tools.time.update({timeHours: 18, fromTimeHours: 6, transitionDuration: 7, waitForIbl: false});')).toMatchObject({ok: true});
  const original = test.application.getEditorDocument().settings;
  expect(await test.run('await editor.history.undo({transactionIds: ["edit-1"]});')).toMatchObject({ok: true});
  expect(test.port.readWorldState()?.lighting.timeHours).toBe(12);
  expect(await test.run('await editor.history.redo({transactionIds: ["edit-1"]});')).toMatchObject({ok: true});
  expect(test.application.getEditorDocument().settings).toEqual(original);
  expect(test.port.readWorldState()?.lighting.timeHours).toBe(18);
  expect(test.effects.at(-1)).toEqual({timeHours: 18, transitionDuration: 0, waitForIbl: false});
});

it("does not publish ordered time records after a caught editing failure", async () => {
  const test = await setup();
  const original = test.application.getEditorDocument();
  expect(await test.run(`
    await tools.time.update({timeHours: 18, waitForIbl: false});
    try { await editor.history.undo({transactionIds: ["missing"]}); } catch {}
    await tools.time.update({timeHours: 20, waitForIbl: false});
    return null;
  `)).toMatchObject({ok: false, receipt: {status: "aborted"}});
  expect(test.application.getEditorDocument()).toEqual(original);
  expect(test.effects).toEqual([]);
});


it("restores an originally absent camera target then accepts an independent environment edit", async () => {
  const test = await setup();
  const camera = test.port.readWorldState()!.camera;
  expect(await test.run('return await tools.spatial.teleport({target: {anchor: {kind: "position", x: 4, y: 0, z: 5}, relation: {kind: "at"}, placement: {snapTo: "none"}}, heightOffset: 2});'))
    .toMatchObject({ok: true});
  expect(test.application.getEditorDocument().settings.camera?.position).toEqual([4, 2, 5]);
  expect(await test.run('await editor.history.undo({transactionIds: ["edit-1"]});'))
    .toMatchObject({ok: true});
  expect(test.application.getEditorDocument().settings.camera).toBeUndefined();
  expect(test.port.readWorldState()!.camera).toEqual(camera);
  expect(await test.run('await tools.time.update({timeHours: 18, waitForIbl: false});')).toMatchObject({ok: true});
  expect(test.application.getEditorDocument().settings.environment?.timeHours).toBe(18);
});
