import { BuildingPartDraft } from "@galacean/engine-building/tiny-glade/parts/BuildingParts";
import { buildingAlgorithmContext } from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingInstanceRender";
import { RuntimeEditor } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import { designBuilding, implementBuilding } from "@galacean/engine-building/tiny-glade/parts/architecture/index";
import {
  AssetType,
  Camera,
  Color,
  DirectLight,
  Vector3,
  WebGLEngine,
  type PrefabResource,
  type Scene
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  Building,
  BuildingManager,
  BuildingPartComponent,
  buildingDraftSource,
  type BuildingDraft,
  type EuropeanHouseParameters
} from "@galacean/engine-building/tiny-glade/parts/architecture/index";
import {
  registerBuildingAssetComponents,
  buildingAssets
} from "@galacean/engine-building/tiny-glade/resources/BuildingAssetKit";
import {
  builtinBuildingAssetFiles,
  BUILTIN_BUILDING_ASSETS
} from "@galacean/engine-building/tiny-glade/resources/BuiltinBuildingAssets";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import {
  RuntimeProjectStorage,
  RUNTIME_PROJECT_SAVE_VERSION,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
registerBuildingAssetComponents();
const parameters: EuropeanHouseParameters = {
  id: "house",
  seed: 17,
  height: 4,
  rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
  roof: {
    tip: [0, 0],
    profile: 0,
    height: 0.5,
    ridge_length: 0.5,
    eave: 0.2,
    ridge_direction: 0,
    flat_rim: 0,
    color: 0
  }
};
const id = "building-stages-v2";
const source = (draft: BuildingDraft) => {
  const fragment = buildingDraftSource(draft, {
    id: "building",
    name: "欧式建筑",
    assetLibrary: BUILTIN_BUILDING_ASSETS
  });
  return {
    asset: { version: "2.0" },
    scene: { rootEntities: fragment.rootEntities, background: { mode: 0, color: { r: 0.12, g: 0.17, b: 0.21, a: 1 } } },
    entities: fragment.entities,
    components: fragment.components
  };
};
const initial: RuntimeProjectPackage = {
  version: RUNTIME_PROJECT_SAVE_VERSION,
  project: {
    scene: "Building.scene",
    files: [
      { virtualPath: "Building.scene", path: "Building.scene", type: "Scene", dependencies: [] },
      ...builtinBuildingAssetFiles
    ]
  },
  contents: { "Building.scene": JSON.stringify(source(Building.European.buildHouses(parameters))) }
};
let engine: WebGLEngine,
  scene: Scene,
  manager: BuildingManager,
  camera: Camera,
  assets: PrefabResource,
  project: RuntimeProjectSession;
let editor: RuntimeEditor;
let unregisterActivation: (() => void) | undefined;
let busy = false;
const status = document.querySelector<HTMLElement>("#status")!;
function refresh() {
  status.textContent = `当前：新构件流程\n基础构件：${manager.list().length}\n铺设单元：${manager.metrics().profileUnits + manager.metrics().flatUnits}\n独立 Unit 对象：${manager.metrics().entityInstances}\n${[...manager.errors(), ...manager.diagnostics().map((d) => d.part + ": " + d.reason)].join("\n")}`;
  document.querySelector("#recipe-data")!.textContent = JSON.stringify(
    manager.snapshot(manager.list()[0].frame!),
    null,
    2
  );
}
function frameDraft() {
  const parts = manager.snapshot(manager.list()[0].frame!).parts;
  const steps = parts.length === 1 && parts[0].type === "steps";
  const wall = parts.length === 1 && parts[0].support.generator === "wallStrip";
  const boxes = manager.visualBounds;
  const bounds = boxes.length
    ? {
        min: [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]))),
        max: [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i])))
      }
    : undefined;
  const target =
    bounds && [...bounds.min, ...bounds.max].every(Number.isFinite)
      ? new Vector3(...(bounds.min.map((v, i) => (v + bounds.max[i]) / 2) as [number, number, number]))
      : new Vector3(0, steps ? 1 : 4, steps ? 1.5 : 0);
  camera.entity.transform.setPosition(
    target.x + (steps ? 6 : 11),
    target.y + (steps ? 5 : 11),
    target.z + (steps ? -9 : 26)
  );
  camera.entity.transform.lookAt(target);
  camera.orthographicSize = steps ? 3 : wall ? 4 : 8.5;
  if (bounds) {
    const extent = bounds.max.map((v, i) => (v - bounds.min[i]) / 2);
    const projected = (axis: Vector3) =>
      Math.abs(axis.x) * extent[0] + Math.abs(axis.y) * extent[1] + Math.abs(axis.z) * extent[2];
    const fit = Math.max(
      projected(camera.entity.transform.worldUp),
      projected(camera.entity.transform.worldRight) / camera.aspectRatio
    );
    if (Number.isFinite(fit)) camera.orthographicSize = Math.max(camera.orthographicSize, fit * 1.12);
  }
}
async function frames(n = 5) {
  for (let i = 0; i < n; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
async function replace(draft: BuildingDraft) {
  const design = designBuilding(draft, manager.terrain, buildingAssets(assets).compilation);
  if (design.diagnostics.length) throw Error(design.diagnostics.map((d) => d.part + ": " + d.reason).join("\n"));
  const validationResources = new BuildingPartDraft(manager.entity, "Building validation");
  try {
    await implementBuilding(design, { context: buildingAlgorithmContext(manager.entity, validationResources) });
  } finally {
    validationResources.dispose();
  }
  const signal = new AbortController().signal,
    tx = editor.beginEdit(crypto.randomUUID(), signal);
  try {
    await tx.run(({ draft: files, edited }) => {
      files.update("Building.scene", JSON.stringify(source(draft)));
      edited();
    }, false);
    await tx.prepare(signal);
    await tx.commit();
    await tx.activate!(signal);
  } catch (error) {
    tx.discard();
    throw error;
  }
  frameDraft();
  await frames(10);
  refresh();
}
async function save() {
  await project.flush();
}
async function undo() {
  const signal = new AbortController().signal,
    tx = editor.beginEdit(crypto.randomUUID(), signal),
    latest = tx.history().undo[0];
  if (!latest) {
    tx.discard();
    return;
  }
  try {
    await tx.moveHistory({ direction: "undo", transactionIds: [latest.transactionId] });
    await tx.prepare(signal);
    await tx.commit();
    await tx.activate!(signal);
  } catch (error) {
    tx.discard();
    throw error;
  }
  frameDraft();
  await frames(10);
  refresh();
}
async function load() {
  const storage = await RuntimeProjectStorage.open();
  try {
    if (new URL(location.href).searchParams.has("reset") || !(await storage.load(id))) await storage.save(id, initial);
  } finally {
    storage.close();
  }
  project = await RuntimeProjectSession.open(id, initial.project, location.href);
  await project.initializeDependencies();
  engine = await WebGLEngine.create({
    canvas: document.querySelector<HTMLCanvasElement>("canvas")!,
    shaderCompiler: new ShaderCompiler()
  });
  const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
  engine.canvas.setResolution(canvas.clientWidth, canvas.clientHeight);
  engine.resourceManager.registerVirtualResources(await project.resources());
  scene = await engine.resourceManager.load<Scene>({ url: "Building.scene", type: AssetType.Scene });
  engine.sceneManager.activeScene = scene;
  editor = new RuntimeEditor(project, scene);
  assets = await engine.resourceManager.load<PrefabResource>({ url: BUILTIN_BUILDING_ASSETS, type: AssetType.Prefab });
  camera = scene.createRootEntity("Camera").addComponent(Camera);
  camera.isOrthographic = true;
  camera.orthographicSize = 7.4;
  camera.entity.transform.setPosition(11, 14, 26);
  camera.entity.transform.lookAt(new Vector3(0, 3, 0));
  scene.createRootEntity("Sun").addComponent(DirectLight).entity.transform.setRotation(-40, -25, 0);
  scene.ambientLight.diffuseSolidColor = new Color(0.5, 0.5, 0.5, 1);
  manager = BuildingManager.forScene(scene);
  manager.camera = camera;
  manager.assets = assets;
  unregisterActivation = project.registerRuntimeActivation({
    before: async () => {
      manager.enabled = false;
    },
    after: async () => {
      manager.invalidate();
      await manager.flushAsync();
    },
    finish: () => {
      manager.enabled = true;
    }
  });
  await manager.flushAsync();
  frameDraft();
  engine.run();
  await frames(10);
  refresh();
  Object.assign(window, {
    buildingReady: true,
    buildingState: () => ({
      parts: manager.snapshot(manager.list()[0].frame!),
      metrics: manager.metrics(),
      errors: manager.errors()
    }),
    buildingReplace: replace,
    buildingSave: save,
    buildingUndo: undo,
    buildingAPI: Building,
    buildingManager: manager,
    buildingEngine: engine,
    buildingCamera: camera,
    buildingVerify: async () => {
      const checks: string[] = [];
      const check = (v: unknown, m: string) => {
        if (!v) throw Error(m);
        checks.push(m);
      };
      const original = manager.snapshot(manager.list()[0].frame!);
      check(
        manager.list().every((p) => p instanceof BuildingPartComponent),
        "基础构件均为 BuildingPartComponent"
      );
      check(!JSON.stringify(original).includes('"children"'), "基础构件无递归配方");
      const old = manager.generation;
      const editedPart = manager.list().find((p) => p.definition)!;
      const editedDefinition = editedPart.definition!;
      editedPart.definition = {
        ...editedDefinition,
        params: { ...editedDefinition.params, seed: 23 }
      };
      await manager.flushAsync();
      check(manager.generation !== old, "修改构件重建设计及铺设");
      editedPart.definition = editedDefinition;
      await manager.flushAsync();
      await replace(original);
      check(manager.errors().length === 0, "恢复原始构件成功");
      return { ok: true, checks };
    }
  });
}
const run = (fn: () => Promise<void>) => {
  if (busy) return;
  busy = true;
  void fn()
    .catch((e) => {
      status.textContent = String(e);
      console.error(e);
    })
    .finally(() => {
      busy = false;
    });
};
document.querySelector("#undo")!.addEventListener("click", () => run(undo));
document.querySelector("#window")!.addEventListener("click", () =>
  run(async () => {
    const has = manager.snapshot(manager.list()[0].frame!).parts.some((p) => p.type === "window");
    await replace(
      Building.European.buildHouses({
        ...parameters,
        attachments: has
          ? []
          : [
              {
                id: "window",
                kind: "window",
                type: "window-cottage",
                host: "wall",
                u: 0.35,
                bottom: 1.2,
                width: 1.2,
                height: 1.5,
                rank: 1,
                seed: 17
              }
            ]
      })
    );
  })
);
document.querySelector("#tower")!.addEventListener("click", () =>
  run(() =>
    replace(
      Building.European.buildTower({
        ...parameters,
        circle: { center: [0, 0], radius: 2.5, phase: 0 },
        rectangle: undefined,
        height: 9
      })
    )
  )
);
document
  .querySelector("#wall")!
  .addEventListener("click", () =>
    run(() => replace(Building.European.buildWall({ id: "wall", length: 8, height: 2 })))
  );
document
  .querySelector("#fence")!
  .addEventListener("click", () =>
    run(() => replace(Building.European.buildFence({ id: "fence", length: 8, height: 1.5 })))
  );
document
  .querySelector("#steps")!
  .addEventListener("click", () =>
    run(() => replace(Building.European.buildSteps({ id: "steps", width: 3, rise: 0.3, run: 0.5, count: 6 })))
  );
document
  .querySelector("#connected")!
  .addEventListener("click", () =>
    run(() =>
      replace(
        Building.European.buildHouses([
          parameters,
          { ...parameters, id: "wing", rectangle: { center: [5, 0], size: [8, 6], rotation: Math.PI / 2 } }
        ])
      )
    )
  );
document
  .querySelector("#house")!
  .addEventListener("click", () => run(() => replace(Building.European.buildHouses(parameters))));
document.querySelector("#reload")!.addEventListener("click", () =>
  run(async () => {
    await save();
    location.href = location.pathname;
  })
);
document.querySelector("#verify")!.addEventListener("click", () =>
  run(async () => {
    status.textContent = JSON.stringify(await (window as any).buildingVerify());
  })
);
window.addEventListener(
  "pagehide",
  () => {
    unregisterActivation?.();
    editor?.dispose();
    project?.dispose();
    engine?.destroy();
  },
  { once: true }
);
void load().catch((e) => {
  status.textContent = String(e);
  console.error(e);
});
