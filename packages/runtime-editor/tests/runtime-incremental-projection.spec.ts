import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.hoisted(() => {
  (globalThis as any).window ??= {};
});
// The fixture uses real Entity/Component lifecycles but has no graphics device.
vi.mock("../src/runtime-editor/scene/runtime-scene-settings", () => ({
  applyRuntimeSceneSettings: vi.fn(async () => {})
}));
import { Component, Entity, Loader, ReflectionParser, Script, Signal } from "@galacean/engine";
import { historyFixture } from "./runtime-history-fixture";
import { NativeWaterHost } from "../../world-planning/src/spatial/runtime/NativeWaterHost";
import type { WaterSystem } from "../../water/src/water/native/WaterSystem";
import { applyRuntimeSceneSettings } from "../src/runtime-editor/scene/runtime-scene-settings";
import { RuntimeSceneEdit } from "../src/runtime-editor/scene/runtime-scene-edit";

const scenePath = "main.scene";
const events: string[] = [];
class Probe extends Component {
  value = 1;
  target: Probe | null = null;
  other: Entity | null = null;
  signal = new Signal();
  received = 0;
  receive() {
    this.received++;
  }
  get fail() {
    return false;
  }
  set fail(value: boolean) {
    if (value) throw Error("probe failure");
  }
  override _onAwake() {
    events.push(`awake:${this.entity.name}`);
  }
  override _onEnable() {
    events.push(`enable:${this.entity.name}`);
  }
  override _onDisable() {
    events.push(`disable:${this.entity.name}`);
  }
}
const cleanups: (() => void)[] = [];
beforeEach(() => {
  Loader.registerClass("IncrementalProbe", Probe);
  events.length = 0;
});
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
  vi.restoreAllMocks();
});

async function setup() {
  const f = await historyFixture();
  cleanups.push(f.dispose);
  async function edit(id: string, change: (scene: RuntimeSceneEdit) => void) {
    const tx = f.editor.beginEdit(id, f.signal);
    await tx.run(({ draft, edited }) => {
      change(new RuntimeSceneEdit(draft, scenePath));
      edited();
    });
    await tx.prepare(f.signal);
    return tx;
  }
  let root = "",
    child = "",
    unrelated = "",
    a = "",
    b = "",
    c = "";
  const seed = await edit("seed", (s) => {
    root = s.create({ name: "Root" }).id;
    child = s.create({ name: "Child", parentEntityId: root }).id;
    unrelated = s.create({ name: "Unrelated" }).id;
    a = s.addComponent(root, { type: "IncrementalProbe" }).id;
    b = s.addComponent(child, { type: "IncrementalProbe" }).id;
    c = s.addComponent(unrelated, { type: "IncrementalProbe" }).id;
  });
  await seed.commit();
  await seed.activate(f.signal);
  events.length = 0;
  return {
    ...f,
    edit,
    root,
    child,
    unrelated,
    a,
    b,
    c,
    projection: f.editor.projection,
    component: (id: string) => f.editor.projection.component(id) as Probe
  };
}

it("uses the prepared delta for a component addition and preserves existing subtree lifecycle", async () => {
  const f = await setup();
  const a = f.component(f.a),
    b = f.component(f.b),
    c = f.component(f.c);
  let added = "";
  const tx = await f.edit("add", (s) => {
    added = s.addComponent(f.root, { type: "IncrementalProbe", props: { value: 7 } }).id;
  });
  const validation = vi.spyOn(f.projection, "validate");
  const props = vi.spyOn(ReflectionParser.prototype, "parseProps");
  await tx.commit();
  await tx.activate(f.signal);
  expect(validation).not.toHaveBeenCalled();
  expect(props.mock.calls).toHaveLength(1);
  expect(props.mock.calls[0][0]).toBe(f.component(added));
  expect(f.component(added).value).toBe(7);
  expect(f.component(f.a)).toBe(a);
  expect(f.component(f.b)).toBe(b);
  expect(f.component(f.c)).toBe(c);
  expect(events).toContain("disable:Root");
  expect(events).toContain("disable:Child");
  expect(events).toContain("enable:Root");
  expect(events).toContain("enable:Child");
  expect(events).not.toContain("disable:Unrelated");
  expect(f.projection.sourceIdentity(f.component(added))?.componentId).toBe(added);
});

it("allocates forward/cyclic references and rebinds unchanged consumers after component replacement", async () => {
  const f = await setup();
  let x = "",
    y = "";
  const tx = await f.edit("references", (s) => {
    x = s.addComponent(f.root, { type: "IncrementalProbe", props: { value: 9 } }).id;
    y = s.addComponent(f.unrelated, {
      type: "IncrementalProbe",
      props: { target: { $component: x }, other: { $entity: f.child } }
    }).id;
    s.updateComponent(x, { target: { $component: y } });
  });
  await tx.commit();
  await tx.activate(f.signal);
  const old = f.component(x),
    consumer = f.component(y);
  expect(old.target).toBe(consumer);
  expect(consumer.target).toBe(old);
  expect(consumer.other).toBe(f.projection.entity(f.child));
  const replace = await f.edit("replace", (s) => s.reconcileComponent(x, {}, ["value"]));
  const validate = vi.spyOn(f.projection, "validate");
  await replace.commit();
  await replace.activate(f.signal);
  expect(validate).not.toHaveBeenCalled();
  expect(old.destroyed).toBe(true);
  expect(f.component(x)).not.toBe(old);
  expect(f.component(y)).toBe(consumer);
  expect(consumer.target).toBe(f.component(x));
  expect(f.component(x).target).toBe(consumer);
  expect(f.component(x).value).toBe(1);
  expect(f.projection.sourceIdentity(old)).toBeUndefined();
});

it("resolves component IDs after same-type deletion changes compiled selector indices", async () => {
  const f = await setup();
  let second = "";
  const add = await f.edit("second", (s) => {
    second = s.addComponent(f.root, { type: "IncrementalProbe", props: { value: 8 } }).id;
    s.updateComponent(f.c, { target: { $component: second } });
  });
  await add.commit();
  await add.activate(f.signal);
  const retained = f.component(second);
  const remove = await f.edit("remove-first", (s) => {
    s.removeComponent(f.a);
    s.updateComponent(f.b, { target: { $component: second } });
  });
  await remove.commit();
  await remove.activate(f.signal);
  expect(f.component(f.a)).toBeUndefined();
  expect(f.component(second)).toBe(retained);
  expect(f.component(f.b).target).toBe(retained);
  expect(f.component(f.c).target).toBe(retained);
});

it("updates moved hierarchy edges and deletes subtrees without replacing unrelated objects", async () => {
  const f = await setup();
  const child = f.projection.entity(f.child),
    unrelated = f.projection.entity(f.unrelated);
  const move = await f.edit("move", (s) => s.reparent(f.child, f.unrelated));
  await move.commit();
  await move.activate(f.signal);
  expect(child?.parent).toBe(unrelated);
  const remove = await f.edit("remove-tree", (s) => s.delete(f.root));
  await remove.commit();
  await remove.activate(f.signal);
  expect(f.projection.entity(f.root)).toBeUndefined();
  expect(f.component(f.a)).toBeUndefined();
  expect(child?.destroyed).toBe(false);
  expect(f.projection.entity(f.child)).toBe(child);
});

it("derives undo/redo deltas from restored Source and preserves reference identity", async () => {
  const f = await setup();
  const change = await f.edit("link", (s) => {
    s.updateComponent(f.a, { value: 5 });
    s.updateComponent(f.c, { target: { $component: f.a } });
  });
  await change.commit();
  await change.activate(f.signal);
  const identity = f.projection.queryComponents({ id: f.a })[0];
  const undo = f.editor.beginEdit("undo", f.signal);
  await undo.moveHistory({ direction: "undo", transactionIds: ["link"] });
  await undo.prepare(f.signal);
  const validate = vi.spyOn(f.projection, "validate");
  await undo.commit();
  await undo.activate(f.signal);
  expect(validate).not.toHaveBeenCalled();
  expect(f.component(f.a).value).toBe(1);
  expect(f.component(f.c).target).toBeNull();
  const redo = f.editor.beginEdit("redo", f.signal);
  await redo.moveHistory({ direction: "redo", transactionIds: ["link"] });
  await redo.prepare(f.signal);
  validate.mockClear();
  await redo.commit();
  await redo.activate(f.signal);
  expect(validate).not.toHaveBeenCalled();
  expect(f.component(f.a).value).toBe(5);
  expect(f.component(f.c).target).toBe(f.component(f.a));
  expect(f.projection.resolveComponent(identity)).toBe(f.component(f.a));
});

it("retains accepted authoring after activation failure and recovers through a full apply", async () => {
  const f = await setup();
  const untouched = f.component(f.c);
  untouched.value = 123; // Host-owned runtime state must survive another component's failure.
  vi.mocked(applyRuntimeSceneSettings).mockClear();
  const failing = await f.edit("fail", (s) => s.updateComponent(f.a, { fail: true }));
  await failing.commit();
  await expect(failing.activate(f.signal)).rejects.toThrow("probe failure");
  expect(f.project.history.read("fail").runtime).toBe("failed");
  expect(f.project.projectPackage.contents[scenePath]).toContain('"fail":true');
  expect(() => f.projection.queryComponents()).toThrow("recovery");
  const undo = f.editor.beginEdit("recover", f.signal);
  await undo.moveHistory({ direction: "undo", transactionIds: ["fail"] });
  await undo.prepare(f.signal);
  const validate = vi.spyOn(f.projection, "validate");
  await undo.commit();
  await undo.activate(f.signal);
  expect(validate).toHaveBeenCalledOnce();
  expect(f.component(f.a).value).toBe(1);
  expect(f.projection.queryComponents()).toHaveLength(3);
  expect(f.component(f.c)).toBe(untouched);
  expect(untouched.value).toBe(123);
  expect(vi.mocked(applyRuntimeSceneSettings).mock.calls.every((call) => call[2].size === 0)).toBe(true);
});

it("includes an earlier committed edit whose activation was cancelled", async () => {
  const f = await setup();
  const first = await f.edit("first", (s) => s.updateComponent(f.a, { value: 3 }));
  await first.commit();
  const controller = new AbortController();
  controller.abort();
  await expect(first.activate(controller.signal)).rejects.toThrow();
  const next = await f.edit("next", (s) => s.updateComponent(f.b, { value: 4 }));
  await next.commit();
  await next.activate(f.signal);
  expect(f.component(f.a).value).toBe(3);
  expect(f.component(f.b).value).toBe(4);
});

it("rejects a stale prepared target when a later publication wins before activation", async () => {
  const f = await setup();
  const first = await f.edit("first", (s) => s.updateComponent(f.a, { value: 3 }));
  await first.commit();
  const next = await f.edit("next", (s) => s.updateComponent(f.a, { value: 4 }));
  await next.commit();
  const validate = vi.spyOn(f.projection, "validate");
  await first.activate(f.signal);
  expect(validate).toHaveBeenCalled();
  expect(f.component(f.a).value).toBe(4);
  await next.activate(f.signal);
  expect(f.component(f.a).value).toBe(4);
});

it("falls back after runtime parent or registered class changes", async () => {
  const f = await setup();
  const tx = await f.edit("change", (s) => s.updateComponent(f.a, { value: 6 }));
  await tx.commit();
  f.projection.entity(f.unrelated)!.addChild(f.projection.entity(f.root)!);
  const validate = vi.spyOn(f.projection, "validate");
  await tx.activate(f.signal);
  expect(validate).toHaveBeenCalled();
  expect(f.projection.entity(f.root)?.parent).toBeNull();
  const next = await f.edit("class-change", (s) => s.updateComponent(f.a, { value: 7 }));
  await next.commit();
  class Replacement extends Probe {}
  abstract class ProjectLoader extends Loader<unknown> {}
  ProjectLoader.registerClass("IncrementalProbe", Replacement);
  validate.mockClear();
  await next.activate(f.signal);
  expect(validate).toHaveBeenCalled();
  expect(f.component(f.a)).toBeInstanceOf(Replacement);
});

it("falls back for whole-Scene writes without a structured journal", async () => {
  const f = await setup();
  const tx = f.editor.beginEdit("raw", f.signal);
  await tx.run(({ draft, edited }) => {
    const source = JSON.parse(draft.read(scenePath) as string);
    source.components.find((c: { id: string }) => c.id === f.a).props = { value: 12 };
    draft.update(scenePath, JSON.stringify(source));
    expect(draft.changedAssetPaths()).toContain(scenePath);
    edited();
  });
  await tx.prepare(f.signal);
  const validate = vi.spyOn(f.projection, "validate");
  await tx.commit();
  await tx.activate(f.signal);
  expect(validate).toHaveBeenCalledOnce();
  expect(f.component(f.a).value).toBe(12);
});

it("does not replay unchanged signal bindings, and rebinds a replaced signal target", async () => {
  const f = await setup();
  const link = await f.edit("signal", (s) => {
    s.updateComponent(f.a, { value: 8 });
    s.updateComponent(f.c, { signal: { $signal: [{ target: { $component: f.a }, methodName: "receive" }] } });
  });
  await link.commit();
  await link.activate(f.signal);
  const publisher = f.component(f.c),
    old = f.component(f.a);
  const update = await f.edit("value", (s) => s.updateComponent(f.a, { value: 9 }));
  await update.commit();
  await update.activate(f.signal);
  publisher.signal.invoke();
  expect(old.received).toBe(1);
  const replace = await f.edit("replace", (s) => s.reconcileComponent(f.a, {}, ["value"]));
  await replace.commit();
  await replace.activate(f.signal);
  publisher.signal.invoke();
  expect(f.component(f.a).received).toBe(1);
  expect(old.received).toBe(1);
});

it("keeps a rejected dangling-reference transaction out of authoring and runtime", async () => {
  const f = await setup();
  const link = await f.edit("link", (s) => s.updateComponent(f.c, { target: { $component: f.a } }));
  await link.commit();
  await link.activate(f.signal);
  const before = f.project.projectPackage.contents[scenePath],
    old = f.component(f.a);
  await expect(f.edit("invalid", (s) => s.removeComponent(f.a))).rejects.toThrow();
  expect(f.project.projectPackage.contents[scenePath]).toBe(before);
  expect(f.component(f.a)).toBe(old);
  expect(f.component(f.c).target).toBe(old);
});

it("does no component work for a net-zero edit", async () => {
  const f = await setup();
  const tx = await f.edit("net-zero", (s) => {
    const id = s.addComponent(f.root, { type: "IncrementalProbe" }).id;
    s.removeComponent(id);
    s.updateComponent(f.a, { value: 2 });
    s.reconcileComponent(f.a, {}, ["value"]);
  });
  const props = vi.spyOn(ReflectionParser.prototype, "parseProps");
  await tx.commit();
  await tx.activate(f.signal);
  expect(props).not.toHaveBeenCalled();
  expect(events).toEqual([]);
});

it("retries a failed consumer without replaying a successfully applied component addition", async () => {
  const f = await setup();
  let added = "";
  const tx = await f.edit("add", (s) => {
    added = s.addComponent(f.root, { type: "IncrementalProbe" }).id;
  });
  const unregister = f.project.registerRuntimeActivation({
    before: async () => {},
    after: async () => {
      throw Error("consumer failed");
    }
  });
  await tx.commit();
  await expect(tx.activate(f.signal)).rejects.toThrow("consumer failed");
  const instance = f.component(added);
  events.length = 0;
  unregister();
  await tx.activate(f.signal);
  expect(f.component(added)).toBe(instance);
  expect(events).toEqual([]);
});

it("includes scene changes produced by a preparation extension", async () => {
  const f = await setup();
  const stop = f.editor.editor.registerPreparation(async (edit) => {
    await edit.run(({ draft, edited }) => {
      new RuntimeSceneEdit(draft, scenePath).updateComponent(f.b, { value: 23 });
      edited();
    });
  });
  cleanups.push(stop);
  const tx = await f.edit("extension", (s) => s.updateComponent(f.a, { value: 11 }));
  const validate = vi.spyOn(f.projection, "validate");
  await tx.commit();
  await tx.activate(f.signal);
  expect(validate).not.toHaveBeenCalled();
  expect(f.component(f.a).value).toBe(11);
  expect(f.component(f.b).value).toBe(23);
});

it("uses full projection when a dependency changes after the scene plan was prepared", async () => {
  const f = await setup();
  const tx = f.editor.beginEdit("resource", f.signal);
  await tx.run(({ draft, edited }) => {
    draft.create({ virtualPath: "data.json", path: "data.json", type: "JSON" }, '{"value":1}');
    new RuntimeSceneEdit(draft, scenePath).updateComponent(f.a, { target: { $ref: "data.json" } });
    edited();
  });
  await tx.prepare(f.signal);
  await tx.commit();
  await tx.activate(f.signal);
  const next = await f.edit("next", (s) => s.updateComponent(f.b, { value: 4 }));
  await next.commit();
  await f.project.publishAsset({ virtualPath: "data.json", path: "data.json", type: "JSON" }, '{"value":2}');
  const validate = vi.spyOn(f.projection, "validate");
  await next.activate(f.signal);
  expect(validate).toHaveBeenCalled();
  expect(f.component(f.b).value).toBe(4);
});

it("recovers runtime-destroyed authored objects and rebinds their consumers", async () => {
  const f = await setup();
  const link = await f.edit("link", (s) => {
    s.update(f.root, { position: [2, 3, 4] });
    s.updateComponent(f.c, { target: { $component: f.a }, other: { $entity: f.root } });
  });
  await link.commit();
  await link.activate(f.signal);
  const old = f.projection.entity(f.root)!;
  const tx = await f.edit("change", (s) => s.updateComponent(f.c, { value: 5 }));
  await tx.commit();
  old.destroy();
  await tx.activate(f.signal);
  const restored = f.projection.entity(f.root)!;
  expect(restored).not.toBe(old);
  expect(restored.destroyed).toBe(false);
  expect(restored.name).toBe("Root");
  expect(restored.transform.position.x).toBe(2);
  expect(f.projection.entity(f.child)?.parent).toBe(restored);
  expect(f.component(f.c).target).toBe(f.component(f.a));
  expect(f.component(f.c).other).toBe(restored);
});

it("merges structured mutation IDs across batches and discards an aborted batch", async () => {
  const f = await setup();
  const tx = f.editor.beginEdit("journal", f.signal);
  await tx.run(({ draft, edited }) => {
    const scene = new RuntimeSceneEdit(draft, scenePath);
    const before = draft.read(scenePath);
    expect(() =>
      scene.batch(() => {
        scene.updateComponent(f.a, { value: 100 });
        scene.create({ name: "aborted" });
        throw Error("abort batch");
      })
    ).toThrow("abort batch");
    expect(draft.read(scenePath)).toBe(before);
    expect(draft.sceneChangeSets()).toEqual({});
    scene.batch(() => {
      scene.updateComponent(f.a, { value: 7 });
      scene.updateComponent(f.a, { value: 8 });
      scene.reparent(f.child, f.unrelated, false);
    });
    const changes = draft.sceneChangeSets()[scenePath];
    expect(changes.before).toBe(before);
    expect(changes.after).toBe(draft.read(scenePath));
    expect(new Set(changes.entities)).toEqual(new Set([f.child, f.root, f.unrelated]));
    expect(changes.components).toEqual([f.a]);
    expect(changes.roots).toBe(false);
    // Invalid writes must not poison a previously complete journal.
    expect(() => draft.update(scenePath, "invalid source")).toThrow();
    expect(draft.sceneChangeSets()[scenePath]).toEqual(changes);
    edited();
  });
  await tx.prepare(f.signal);
  const validate = vi.spyOn(f.projection, "validate");
  await tx.commit();
  await tx.activate(f.signal);
  expect(validate).not.toHaveBeenCalled();
  expect(f.component(f.a).value).toBe(8);
  expect(f.projection.entity(f.child)?.parent).toBe(f.projection.entity(f.unrelated));
});

it("merges all touched identities when undoing and redoing several transactions", async () => {
  const f = await setup();
  const first = await f.edit("first", (s) => {
    s.updateComponent(f.a, { value: 5 });
    s.updateComponent(f.c, { target: { $component: f.a } });
  });
  await first.commit();
  await first.activate(f.signal);
  const second = await f.edit("second", (s) => {
    s.updateComponent(f.b, { value: 7 });
    s.updateComponent(f.c, { target: { $component: f.b } });
  });
  await second.commit();
  await second.activate(f.signal);
  const validate = vi.spyOn(f.projection, "validate");
  for (const [direction, transactionIds] of [
    ["undo", ["second", "first"]],
    ["redo", ["first", "second"]]
  ] as const) {
    const tx = f.editor.beginEdit(direction, f.signal);
    await tx.moveHistory({ direction, transactionIds });
    await tx.prepare(f.signal);
    validate.mockClear();
    await tx.commit();
    await tx.activate(f.signal);
    expect(validate).not.toHaveBeenCalled();
    expect(f.component(f.a).value).toBe(direction === "undo" ? 1 : 5);
    expect(f.component(f.b).value).toBe(direction === "undo" ? 1 : 7);
    expect(f.component(f.c).target).toBe(direction === "undo" ? null : f.component(f.b));
  }
});

it("keeps explicit undo journals and rejects hints against a different source version", async () => {
  const f = await setup();
  const change = await f.edit("explicit", (s) => s.updateComponent(f.a, { value: 9 }));
  await change.commit();
  await change.activate(f.signal);
  const patch = change.captureUndo();
  expect(patch.find((entry) => "path" in entry && entry.path === scenePath)).toMatchObject({
    sceneChanges: { components: [f.a] }
  });
  const restore = f.editor.beginEdit("restore", f.signal);
  await restore.restoreUndo(patch);
  await restore.prepare(f.signal);
  const validate = vi.spyOn(f.projection, "validate");
  await restore.commit();
  await restore.activate(f.signal);
  expect(validate).not.toHaveBeenCalled();
  expect(f.component(f.a).value).toBe(1);
  const later = await f.edit("later", (s) => s.updateComponent(f.b, { value: 8 }));
  await later.commit();
  await later.activate(f.signal);
  const stale = f.editor.beginEdit("stale-restore", f.signal);
  await stale.restoreUndo(patch);
  await stale.prepare(f.signal);
  validate.mockClear();
  await stale.commit();
  await stale.activate(f.signal);
  expect(validate).toHaveBeenCalledOnce();
  expect(f.component(f.b).value).toBe(1);
});

it("does not regain an incremental journal after a raw scene replacement", async () => {
  const f = await setup();
  const tx = f.editor.beginEdit("mixed", f.signal);
  await tx.run(({ draft, edited }) => {
    const scene = new RuntimeSceneEdit(draft, scenePath);
    scene.updateComponent(f.a, { value: 2 });
    const source = JSON.parse(draft.read(scenePath) as string);
    source.components.find((record: { id: string }) => record.id === f.b).props = { value: 6 };
    draft.update(scenePath, JSON.stringify(source));
    scene.updateComponent(f.c, { value: 3 });
    expect(draft.sceneChangeSets()).toEqual({});
    edited();
  });
  await tx.prepare(f.signal);
  const validate = vi.spyOn(f.projection, "validate");
  await tx.commit();
  await tx.activate(f.signal);
  expect(validate).toHaveBeenCalledOnce();
  expect([f.component(f.a).value, f.component(f.b).value, f.component(f.c).value]).toEqual([2, 6, 3]);
});

it("recovers a failed projection through the real Water host without querying partial identities", async () => {
  const f = await setup();
  let depth = 0;
  const begin = vi.fn(() => {
    depth++;
  });
  const end = vi.fn(() => {
    expect(depth).toBe(1);
    depth--;
  });
  const system = {
    bodies: [],
    runtimeState: { effectiveEnabled: false },
    observeRuntimeState: () => () => {},
    beginInputUpdate: begin,
    endInputUpdate: end,
    flushAuthoring: async () => {}
  } as unknown as WaterSystem;
  const host = new NativeWaterHost(f.project, f.editor.editor, system, {
    consumeHostInputs: async () => {
      f.projection.queryComponents();
    }
  });
  cleanups.push(() => host.dispose());
  const failing = await f.edit("host-failure", (s) => s.updateComponent(f.a, { fail: true }));
  await failing.commit();
  await expect(failing.activate(f.signal)).rejects.toThrow("probe failure");
  expect(f.projection.requiresRecovery).toBe(true);
  expect(() => f.projection.queryComponents()).toThrow("recovery");
  expect(depth).toBe(0);
  const recovery = f.editor.beginEdit("host-recovery", f.signal);
  await recovery.moveHistory({ direction: "undo", transactionIds: ["host-failure"] });
  await recovery.prepare(f.signal);
  await recovery.commit();
  await recovery.activate(f.signal);
  expect(f.projection.requiresRecovery).toBe(false);
  expect(f.component(f.a).value).toBe(1);
  expect(begin).toHaveBeenCalledTimes(2);
  expect(end).toHaveBeenCalledTimes(2);
  expect(depth).toBe(0);
  const edit = await f.edit("before-failure", (s) => s.updateComponent(f.a, { value: 6 }));
  await edit.commit();
  vi.spyOn(f.projection, "queryComponents").mockImplementationOnce(() => {
    throw Error("identity read failed");
  });
  await expect(edit.activate(f.signal)).rejects.toThrow("identity read failed");
  expect(end).toHaveBeenCalledTimes(2);
  await edit.activate(f.signal);
  expect(end).toHaveBeenCalledTimes(3);
  expect(f.component(f.a).value).toBe(6);
});

it("restores earlier partial writes and reference consumers after a later setter fails", async () => {
  const f = await setup();
  const references = await f.edit("reference", (s) => s.updateComponent(f.c, { target: { $component: f.a } }));
  await references.commit();
  await references.activate(f.signal);
  const oldA = f.component(f.a);
  const oldC = f.component(f.c);
  const failing = await f.edit("partial", (s) => {
    s.updateComponent(f.a, { value: 8 });
    s.updateComponent(f.b, { fail: true });
  });
  await failing.commit();
  await expect(failing.activate(f.signal)).rejects.toThrow("probe failure");
  expect(oldA.value).toBe(8);
  const undo = f.editor.beginEdit("partial-recovery", f.signal);
  await undo.moveHistory({ direction: "undo", transactionIds: ["partial"] });
  await undo.prepare(f.signal);
  await undo.commit();
  await undo.activate(f.signal);
  expect(f.component(f.a).value).toBe(1);
  expect(oldA.destroyed).toBe(true);
  expect(f.component(f.c)).toBe(oldC);
  expect(oldC.target).toBe(f.component(f.a));
  expect(f.projection.requiresRecovery).toBe(false);
});

it("reapplies only attempted Scene settings after partial settings activation fails", async () => {
  const f = await setup();
  const before = f.component(f.c);
  const tx = f.editor.beginEdit("settings-failure", f.signal);
  await tx.run(({ draft, edited }) => {
    const source = JSON.parse(draft.read(scenePath) as string);
    source.scene.background.color.r = 1;
    draft.update(scenePath, JSON.stringify(source));
    edited();
  });
  await tx.prepare(f.signal);
  await tx.commit();
  vi.mocked(applyRuntimeSceneSettings).mockRejectedValueOnce(Error("settings failure"));
  await expect(tx.activate(f.signal)).rejects.toThrow("settings failure");
  const undo = f.editor.beginEdit("settings-recovery", f.signal);
  await undo.moveHistory({ direction: "undo", transactionIds: ["settings-failure"] });
  await undo.prepare(f.signal);
  await undo.commit();
  vi.mocked(applyRuntimeSceneSettings).mockClear();
  await undo.activate(f.signal);
  expect([...vi.mocked(applyRuntimeSceneSettings).mock.calls[0][2]]).toEqual(["background"]);
  expect(f.component(f.c)).toBe(before);
  expect(f.projection.requiresRecovery).toBe(false);
});

it("preserves authored setter order and reference identity through incremental edit, undo and redo", async () => {
  class Reader extends Probe {
    seen = 0;
    get capture() {
      return 0;
    }
    set capture(_value: number) {
      this.seen = this.target!.value;
    }
  }
  Loader.registerClass("IncrementalReader", Reader);
  const f = await setup();
  let readerId = "";
  const link = await f.edit("link-reader", (s) => {
    s.updateComponent(f.a, { value: 1 });
    readerId = s.addComponent(f.unrelated, {
      type: "IncrementalReader",
      props: { target: { $component: f.a }, capture: 1 }
    }).id;
  });
  await link.commit();
  await link.activate(f.signal);
  const edit = f.editor.beginEdit("reverse-order", f.signal);
  await f.invoke(edit, "component.update", { scene: scenePath, id: readerId, props: { capture: 9 } });
  await f.invoke(edit, "component.update", { scene: scenePath, id: f.a, props: { value: 9 } });
  const target = f.component(f.a);
  const reader = f.component(readerId) as Reader;
  for (const [name, tx, value] of [
    ["edit", edit, 9],
    ["undo", f.editor.beginEdit("reader-undo", f.signal), 1],
    ["redo", f.editor.beginEdit("reader-redo", f.signal), 9]
  ] as const) {
    if (name !== "edit") await f.invoke(tx, "history." + name, { transactionIds: ["reverse-order"] });
    await tx.prepare(f.signal);
    const validation = vi.spyOn(f.projection, "validate");
    await tx.commit();
    await tx.activate(f.signal);
    expect(validation).not.toHaveBeenCalled();
    validation.mockRestore();
    expect(f.component(readerId)).toBe(reader);
    expect(reader.target).toBe(target);
    expect(reader.seen).toBe(value);
  }
});

it.each(["disable", "enable"] as const)(
  "restores the whole subtree around a Script on%s failure and preserves truthful history",
  async (hook) => {
    let shouldThrow = false;
    const lifecycle: string[] = [];
    class FaultScript extends Script {
      override onEnable() {
        lifecycle.push("enable");
        if (shouldThrow && hook === "enable") throw Error("onEnable failed");
      }
      override onDisable() {
        lifecycle.push("disable");
        if (shouldThrow && hook === "disable") throw Error("onDisable failed");
      }
    }
    Loader.registerClass("IncrementalFaultScript", FaultScript);
    const f = await setup();
    Object.assign(f.scene._componentsManager, { addOnStartScript() {}, removeOnStartScript() {} });
    const seed = await f.edit("fault-script", (s) => void s.addComponent(f.child, { type: "IncrementalFaultScript" }));
    await seed.commit();
    await seed.activate(f.signal);
    const before = f.project.projectPackage.contents[scenePath];
    const owner = f.projection.entity(f.root)!;
    const child = f.projection.entity(f.child)!;
    const edit = f.editor.beginEdit("add-with-life-failure", f.signal);
    await f.invoke(edit, "component.add", { scene: scenePath, entityId: f.root, type: "IncrementalProbe" });
    await edit.prepare(f.signal);
    await edit.commit();
    shouldThrow = true;
    lifecycle.length = 0;
    events.length = 0;
    await expect(edit.activate(f.signal)).rejects.toThrow(hook === "disable" ? "onDisable failed" : "onEnable failed");
    expect(events).toEqual(expect.arrayContaining(["disable:Root", "enable:Root"]));
    expect(lifecycle).toEqual(["disable", "enable"]);
    expect(owner.isActiveInHierarchy).toBe(true);
    expect(child.isActiveInHierarchy).toBe(true);
    expect(f.project.history.read("add-with-life-failure").runtime).toBe("failed");
    expect(() => f.projection.queryComponents()).toThrow("recovery");

    const undo = f.editor.beginEdit("undo-life-failure", f.signal);
    await f.invoke(undo, "history.undo", { transactionIds: ["add-with-life-failure"] });
    await undo.prepare(f.signal);
    await undo.commit();
    await expect(undo.activate(f.signal)).rejects.toThrow(hook === "disable" ? "onDisable failed" : "onEnable failed");
    expect(f.project.projectPackage.contents[scenePath]).toBe(before);
    expect(f.project.history.read("add-with-life-failure").runtime).toBe("failed");
    expect(f.projection.requiresRecovery).toBe(true);

    shouldThrow = false;
    await undo.activate(f.signal);
    expect(f.project.history.read("add-with-life-failure").runtime).toBe("applied");
    expect(f.projection.requiresRecovery).toBe(false);
    expect(f.projection.entity(f.root)).toBe(owner);
    expect(f.projection.entity(f.child)).toBe(child);
    expect(owner.isActive).toBe(true);
    expect(owner.isActiveInHierarchy).toBe(true);
    expect(child.isActiveInHierarchy).toBe(true);
    expect(owner.getComponents(Probe, [])).toEqual([f.component(f.a)]);
    expect(() => f.projection.queryComponents()).not.toThrow();
  }
);

it("checks a sparse edit without reading unrelated live bindings", async () => {
  const f = await setup();
  const unrelated = f.projection.entity(f.unrelated)!;
  const edit = await f.edit("incremental-guard", (s) => {
    s.addComponent(f.root, { type: "IncrementalProbe" });
  });
  await edit.commit();
  const parent = vi.spyOn(unrelated, "parent", "get");
  const owner = vi.spyOn(f.component(f.c), "entity", "get");
  const validate = vi.spyOn(f.projection, "validate");
  await edit.activate(f.signal);
  expect(parent).not.toHaveBeenCalled();
  expect(owner).not.toHaveBeenCalled();
  expect(validate).not.toHaveBeenCalled();
});

it("notices deferred destruction of an unrelated binding before a prepared edit", async () => {
  const f = await setup();
  const stale = f.component(f.c);
  const edit = await f.edit("after-pending-destroy", (s) => s.updateComponent(f.a, { value: 10 }));
  await edit.commit();
  const engine = f.scene.engine;
  engine._pendingDestroyObjects = [];
  engine._frameInProcess = true;
  try {
    stale.destroy();
    expect(stale.pendingDestroy).toBe(true);
  } finally {
    engine._frameInProcess = false;
  }
  const validate = vi.spyOn(f.projection, "validate");
  await edit.activate(f.signal);
  expect(validate).toHaveBeenCalledOnce();
  expect(stale.destroyed).toBe(true);
  expect(f.component(f.c)).not.toBe(stale);
  expect(f.component(f.a).value).toBe(10);
});

it("rejects a new binding drift during activation and repairs it on retry", async () => {
  const f = await setup();
  const child = f.projection.entity(f.child)!;
  const unrelated = f.projection.entity(f.unrelated)!;
  const edit = await f.edit("during-apply", (s) => s.updateComponent(f.c, { value: 6 }));
  await edit.commit();
  vi.mocked(applyRuntimeSceneSettings).mockImplementationOnce(async () => unrelated.addChild(child));
  await expect(edit.activate(f.signal)).rejects.toThrow("Scene bindings changed during activation");
  expect(f.projection.requiresRecovery).toBe(true);
  await edit.activate(f.signal);
  expect(child.parent).toBe(f.projection.entity(f.root));
  expect(f.component(f.c).value).toBe(6);
  expect(f.projection.requiresRecovery).toBe(false);
});
