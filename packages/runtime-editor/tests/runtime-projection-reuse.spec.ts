import { afterEach, expect, it, vi } from "vitest";
vi.hoisted(() => {
  (globalThis as any).window ??= {};
});
vi.mock("../src/runtime-editor/scene/runtime-scene-settings", () => ({
  applyRuntimeSceneSettings: vi.fn(async () => {})
}));
import { Component, Entity, Loader, Scene, type Engine } from "@galacean/engine";
import { RuntimeSceneProjection } from "../src/runtime-editor/scene/runtime-scene-projection";
import { applyRuntimeSceneSettings } from "../src/runtime-editor/scene/runtime-scene-settings";
import {
  RUNTIME_PROJECT_SAVE_VERSION,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";

afterEach(() => vi.clearAllMocks());
function fixture() {
  class Probe extends Component {
    value = 1;
  }
  Loader.registerClass("ReuseProbe", Probe);
  const engine = { resourceManager: { _deleteAsset() {}, _deleteContentRestorer() {} } } as unknown as Engine;
  const scene = Object.assign(Object.create(Scene.prototype), {
    _engine: engine,
    _rootEntities: [],
    _isActiveInEngine: false,
    _componentsManager: { getActiveChangedTempList: () => [], putActiveChangedTempList() {} }
  }) as Scene;
  const root = new Entity(engine, "Root");
  scene.addRootEntity(root);
  root.addComponent(Probe);
  const source = {
    asset: { version: "2.0" },
    scene: { name: "Initial", rootEntities: ["root"], background: { mode: 0, color: { r: 0, g: 0, b: 0, a: 1 } } },
    entities: [{ id: "root", name: "Root", components: ["probe"] }],
    components: [{ id: "probe", type: "ReuseProbe", props: { value: 1 } }]
  };
  const pack: RuntimeProjectPackage = {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {
      scene: "main",
      files: [
        { virtualPath: "main", path: "main", type: "Scene", dependencies: [] },
        { virtualPath: "host", path: "host", type: "Host", dependencies: [] }
      ]
    },
    contents: { main: JSON.stringify(source), host: "time:1" }
  };
  return { pack, source, scene, root, engine, projection: new RuntimeSceneProjection(scene, "main", pack) };
}

it("reuses unchanged Scene inputs but still restores runtime parent changes", async () => {
  const f = fixture();
  f.pack.contents.host = "time:2";
  await f.projection.apply(f.pack);
  expect(applyRuntimeSceneSettings).not.toHaveBeenCalled();
  const parent = new Entity(f.engine, "Runtime parent");
  f.scene.addRootEntity(parent);
  parent.addChild(f.root);
  await f.projection.apply(f.pack);
  expect(applyRuntimeSceneSettings).toHaveBeenCalledOnce();
  expect(f.root.parent).toBeNull();
  expect(f.root.scene).toBe(f.scene);
});

it("does not reuse stale component classes or accept a failed activation as applied", async () => {
  const f = fixture();
  class Replacement extends Component {
    value = 0;
  }
  Loader.registerClass("ReuseProbe", Replacement);
  await f.projection.apply(f.pack);
  expect(f.projection.component("probe")).toBeInstanceOf(Replacement);
  expect((f.projection.component("probe") as Replacement).value).toBe(1);
  f.source.scene.name = "Changed";
  f.pack.contents.main = JSON.stringify(f.source);
  vi.mocked(applyRuntimeSceneSettings).mockRejectedValueOnce(Error("projection failed"));
  await expect(f.projection.apply(f.pack)).rejects.toThrow("projection failed");
  await f.projection.apply(f.pack);
  expect(f.scene.name).toBe("Changed");
  expect(applyRuntimeSceneSettings).toHaveBeenCalledTimes(3);
  await f.projection.apply(f.pack);
  expect(applyRuntimeSceneSettings).toHaveBeenCalledTimes(3);
});

it("does not accept newer project inputs that arrive while an earlier projection is awaiting", async () => {
  const f = fixture();
  f.source.scene.name = "First";
  f.pack.contents.main = JSON.stringify(f.source);
  vi.mocked(applyRuntimeSceneSettings).mockImplementationOnce(async () => {
    f.source.scene.name = "Second";
    f.pack.contents.main = JSON.stringify(f.source);
  });
  await f.projection.apply(f.pack);
  expect(f.scene.name).toBe("First");
  await f.projection.apply(f.pack);
  expect(f.scene.name).toBe("Second");
});
