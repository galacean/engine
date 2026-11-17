import { afterEach, expect, it, vi } from "vitest";
vi.hoisted(() => {
  (globalThis as any).window ??= {};
});
vi.mock("../src/runtime-editor/scene/runtime-scene-settings", () => ({
  applyRuntimeSceneSettings: vi.fn(async () => {})
}));
import { Component, Loader } from "@galacean/engine";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import {
  RUNTIME_PROJECT_SAVE_VERSION,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { nativeAssetFormats } from "../src/project/runtime-native-formats";
import { RuntimeSceneEdit } from "../src/runtime-editor/scene/runtime-scene-edit";
import {
  RuntimePreparationViews,
  type RuntimePreparationContext,
  type RuntimePreparationDependencies
} from "../src/runtime-editor/runtime-preparation-context";
import { historyFixture } from "./runtime-history-fixture";

const dependency: RuntimePreparationDependencies = {
  scene: { componentTypes: ["ContextAlpha"], hierarchy: true },
  assets: "referenced",
  namespace: true,
  documents: "all",
  ignoreAssetDescriptions: true
};
function fixture() {
  const pack: RuntimeProjectPackage = {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {
      scene: "main.scene",
      files: [
        { virtualPath: "main.scene", path: "main.scene", type: "Scene", dependencies: ["a.json"] },
        { virtualPath: "a.json", path: "a.json", type: "JSON", dependencies: ["b.json"] },
        { virtualPath: "b.json", path: "b.json", type: "JSON", dependencies: [] },
        { virtualPath: "other.json", path: "other.json", type: "JSON", dependencies: [] }
      ]
    },
    contents: {
      "main.scene": JSON.stringify({
        asset: { version: "2.0" },
        scene: { rootEntities: ["root", "other"], background: { mode: 0, color: { r: 0, g: 0, b: 0, a: 1 } } },
        entities: [
          { id: "root", children: ["child"], components: [] },
          { id: "child", components: ["a"] },
          { id: "other", components: ["b"] }
        ],
        components: [
          { id: "a", type: "ContextAlpha", props: { value: 1, payload: { $ref: "a.json" } } },
          { id: "b", type: "ContextBeta", props: { value: 1 } }
        ]
      }),
      "a.json": '{"value":{"$ref":"b.json"}}',
      "b.json": "{}",
      "other.json": "{}"
    },
    documents: { "policy.json": "{}" }
  };
  const draft = new RuntimeProjectEdit(
    pack,
    nativeAssetFormats(() => ({}))
  );
  const views = new RuntimePreparationViews(pack);
  const scene = new RuntimeSceneEdit(draft, "main.scene");
  return { pack, draft, views, scene, context: () => views.current(draft) };
}

it("shares immutable Scene views, exposes guarded journals, and ignores an unrelated component", () => {
  const f = fixture();
  f.scene.addComponent("child", { type: "ContextBeta", props: { value: 3 } });
  const context = f.context();
  expect(context.affected(dependency)).toBe(false);
  expect(f.context()).toBe(context);
  expect(context.changes.scenes["main.scene"].components).toHaveLength(1);
  expect(() => ((context.after.scene().component("a")!.props as any).value = 9)).toThrow();
  expect(() => (context.after.project.files as any).pop()).toThrow();
  expect(() => (context.changes.assets as any).push("bad")).toThrow();
  f.draft.writeDocument("policy.json", '{"changed":true}');
  const next = f.context();
  expect(next).not.toBe(context);
  expect(next.after.scene()).toBe(context.after.scene());
  expect(next.affected(dependency)).toBe(true);
  expect(context.after.documents["policy.json"]).toBe("{}");
});

it.each(["component", "remove", "ancestor", "reparent"])(
  "invalidates %s dependencies using both versions",
  (operation) => {
    const f = fixture();
    if (operation === "component") f.scene.updateComponent("a", { value: 2 });
    if (operation === "remove") f.scene.removeComponent("a");
    if (operation === "ancestor") f.scene.update("root", { position: [2, 0, 0] });
    if (operation === "reparent") f.scene.reparent("child", "other", false);
    expect(f.context().affected(dependency)).toBe(true);
  }
);

it("matches type prefixes without embedding domain types and ignores unrelated entity transforms", () => {
  const f = fixture();
  f.scene.update("other", { position: [1, 0, 0] });
  expect(f.context().affected(dependency)).toBe(false);
  f.scene.updateComponent("a", { value: 2 });
  expect(f.context().affected({ scene: { componentTypes: [], componentTypePrefixes: ["Context"] } })).toBe(true);
});

it("tracks transitive asset inputs, namespace changes and unknown dependency edges conservatively", () => {
  const f = fixture();
  f.draft.update("other.json", '{"value":1}');
  expect(f.context().affected(dependency)).toBe(false);
  f.draft.update("b.json", '{"value":1}');
  expect(f.context().affected(dependency)).toBe(true);
  const g = fixture();
  g.draft.create({ virtualPath: "new.json", path: "new.json", type: "JSON" }, "{}");
  expect(g.context().affected(dependency)).toBe(true);
  const h = fixture();
  const patch = { ...h.pack.project.files[1], dependencies: undefined };
  h.draft.restore([{ path: "a.json", file: patch, content: h.pack.contents["a.json"] }]);
  h.draft.update("other.json", '{"value":2}');
  expect(h.context().affected(dependency)).toBe(true);
});

it("falls back for untracked writes and instance topology", () => {
  const f = fixture();
  const source = JSON.parse(f.draft.read("main.scene") as string);
  source.entities[2].name = "Raw";
  f.draft.update("main.scene", JSON.stringify(source));
  expect(f.context().affected(dependency)).toBe(true);
  const g = fixture();
  const prefab = JSON.parse(g.draft.read("main.scene") as string);
  prefab.entities[2].instance = { asset: { $ref: "prefab" } };
  g.draft.update("main.scene", JSON.stringify(prefab));
  expect(g.context().affected(dependency)).toBe(true);
});

it("refreshes views after bundle creation, document removal and lazy hydration; binary reads are detached", () => {
  const f = fixture();
  f.draft.createBundle(
    [
      {
        file: { virtualPath: "binary", path: "binary", type: "Buffer" },
        content: new Uint8Array([1, 2]),
        metadata: { summary: "" }
      }
    ],
    {}
  );
  const first = f.context();
  const bytes = first.after.content("binary") as Uint8Array;
  bytes[0] = 9;
  expect((first.after.content("binary") as Uint8Array)[0]).toBe(1);
  f.draft.deleteDocument("policy.json");
  expect(f.context().changes.documents).toContain("policy.json");
  f.draft.restore([{ path: "b.json", file: f.pack.project.files[2] }]);
  const cold = f.context();
  // restore marks this path authored, so hydration cannot overwrite it.
  f.draft.provideContents({ "b.json": "{}" });
  expect(f.context()).toBe(cold);
});

class Alpha extends Component {
  value = 1;
}
class Beta extends Component {
  value = 1;
}
const disposals: (() => void)[] = [];
afterEach(() => {
  disposals
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
  vi.restoreAllMocks();
});
async function integrated() {
  Loader.registerClass("ContextAlpha", Alpha);
  Loader.registerClass("ContextBeta", Beta);
  const f = await historyFixture();
  disposals.push(f.dispose);
  const seed = f.editor.beginEdit("seed", f.signal);
  let entity = "",
    component = "";
  await seed.run(({ draft, edited }) => {
    const scene = new RuntimeSceneEdit(draft, "main.scene");
    entity = scene.create({ name: "root" }).id;
    component = scene.addComponent(entity, { type: "ContextAlpha" }).id;
    edited();
  });
  await f.commit(seed);
  return { ...f, entity, component };
}

it("skips unrelated extensions, shares a context between readers and sees preceding extension writes", async () => {
  const f = await integrated();
  const seen: RuntimePreparationContext[] = [];
  f.editor.editor.registerPreparation(async (_edit, _signal, context) => {
    seen.push(context!);
  });
  f.editor.editor.registerPreparation(async (_edit, _signal, context) => {
    seen.push(context!);
  });
  const skipped = vi.fn(async () => {});
  f.editor.editor.registerPreparation(skipped, { name: "alpha-only", dependencies: dependency });
  f.editor.editor.registerPreparation(async (edit) => {
    await edit.run(({ draft, edited }) => {
      new RuntimeSceneEdit(draft, "main.scene").updateComponent(f.component, { value: 8 });
      edited();
    });
  });
  const relevant = vi.fn(async (_edit, _signal, context) => {
    seen.push(context);
  });
  f.editor.editor.registerPreparation(relevant, { name: "alpha-after-writer", dependencies: dependency });
  const tx = f.editor.beginEdit("derived", f.signal);
  await tx.run(({ draft, edited }) => {
    new RuntimeSceneEdit(draft, "main.scene").addComponent(f.entity, { type: "ContextBeta" });
    edited();
  });
  await f.commit(tx);
  expect(skipped).not.toHaveBeenCalled();
  expect(relevant).toHaveBeenCalledOnce();
  expect(seen[0]).toBe(seen[1]);
  expect(seen[2]).not.toBe(seen[0]);
  expect(seen[2].after.scene().component(f.component)?.props?.value).toBe(8);
  expect(seen[0].after.scene().component(f.component)?.props?.value).toBeUndefined();
  for (const direction of ["undo", "redo"] as const) {
    const move = f.editor.beginEdit(direction, f.signal);
    await move.moveHistory({ direction, transactionIds: ["derived"] });
    await f.commit(move);
  }
  expect(relevant).toHaveBeenCalledOnce();
});

it("does not cache failed extension success, and final validation still runs when extensions skip", async () => {
  const f = await integrated();
  let fail = true;
  const hook = vi.fn(async () => {
    if (fail) throw Error("extension failed");
  });
  const stop = f.editor.editor.registerPreparation(hook, { name: "reject", dependencies: dependency });
  async function edit(id: string) {
    const tx = f.editor.beginEdit(id, f.signal);
    await tx.run(({ draft, edited }) => {
      new RuntimeSceneEdit(draft, "main.scene").updateComponent(f.component, { value: 2 });
      edited();
    });
    return tx;
  }
  const first = await edit("failed");
  await expect(first.prepare(f.signal)).rejects.toThrow("extension failed");
  first.discard();
  fail = false;
  const retry = await edit("retry");
  await f.commit(retry);
  expect(hook).toHaveBeenCalledTimes(2);
  stop();
  const silent = vi.fn(async () => {});
  f.editor.editor.registerPreparation(silent, { name: "not-relevant", dependencies: dependency });
  const bad = f.editor.beginEdit("invalid", f.signal);
  await bad.run(({ draft, edited }) => {
    new RuntimeSceneEdit(draft, "main.scene").addComponent(f.entity, {
      type: "ContextBeta",
      props: { target: { $component: "missing" } }
    });
    edited();
  });
  await expect(bad.prepare(f.signal)).rejects.toThrow();
  bad.discard();
  expect(silent).not.toHaveBeenCalled();
});

it("invalidates a cold shared view on hydration without overwriting a prior snapshot", () => {
  const f = fixture();
  delete f.pack.contents["b.json"];
  const draft = new RuntimeProjectEdit(
    f.pack,
    nativeAssetFormats(() => ({}))
  );
  const views = new RuntimePreparationViews(f.pack);
  const cold = views.current(draft);
  draft.provideContents({ "b.json": "{}" });
  const warm = views.current(draft);
  expect(warm).not.toBe(cold);
  expect(cold.after.content("b.json")).toBeUndefined();
  expect(warm.after.content("b.json")).toBe("{}");
  expect(warm.after.scene()).toBe(cold.after.scene());
});

it("keeps cancellation and retry isolated with declarative dependencies", async () => {
  const f = await integrated();
  const controller = new AbortController();
  let cancel = true;
  const hook = vi.fn(async () => {
    if (cancel) controller.abort();
  });
  f.editor.editor.registerPreparation(hook, { name: "cancel", dependencies: dependency });
  const tx = f.editor.beginEdit("cancel", controller.signal);
  await tx.run(({ draft, edited }) => {
    new RuntimeSceneEdit(draft, "main.scene").updateComponent(f.component, { value: 3 });
    edited();
  });
  await expect(tx.prepare(controller.signal)).rejects.toBeDefined();
  tx.discard();
  cancel = false;
  const retry = f.editor.beginEdit("cancel-retry", f.signal);
  await retry.run(({ draft, edited }) => {
    new RuntimeSceneEdit(draft, "main.scene").updateComponent(f.component, { value: 3 });
    edited();
  });
  await f.commit(retry);
  expect(hook).toHaveBeenCalledTimes(2);
});
