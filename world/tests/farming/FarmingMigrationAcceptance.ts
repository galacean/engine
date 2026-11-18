import { RuntimeAssetChanges } from "@galacean/engine-runtime-editor/project/runtime-asset-changes";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import {
  createPlanningFarmingAuthoringValidator,
  validatePlanningFarmingAuthoring
} from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmingAuthoring.ts";
import { planningFarmingAssetsAffected } from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmingAssets.ts";
import * as EngineExports from "@galacean/engine";
import { seedWorldScriptModules } from "../../demos/seed-world/systems/SeedWorldScriptModules.ts";
import {
  AssetType,
  WebGLEngine,
  JSONAsset,
  MeshRenderer,
  Animator,
  type Scene,
  type PrefabResource,
  type GLTFResource
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { RuntimeEditor } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import {
  RuntimeProjectStorage,
  RUNTIME_PROJECT_SAVE_VERSION,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { createFarmingComponentExtension } from "@galacean/engine-runtime-editor/farming/FarmingComponentEditor";
import { createAgentEditorFacade } from "@galacean/engine-ai-chat/ai-chat/agent-editor-facade";
import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values";
import type {
  FarmingCommands,
  FarmingOutputs,
  FarmingWriteOptions
} from "@galacean/engine-farming/farming/native/FarmingAPIContract";
import {
  registerNativeFarming,
  FarmingSystem,
  FarmingAreaComponent,
  FarmingAPI,
  farmingCatalog,
  farmingRules
} from "@galacean/engine-farming/farming/native";
import {
  farmingResourceData,
  encodeFarmingResourceFile
} from "@galacean/engine-farming/farming/native/FarmingResources";
import { FARM_DEFINITIONS } from "@galacean/engine-farming/farming/content/DefaultFarmingDefinitions";
import { ManualFarmClock } from "@galacean/engine-farming/farming/application/FarmClock";
import type { FarmingGroundProvider } from "@galacean/engine-farming/farming/domain/FarmingGround";
import { registerFarmingPropResources } from "@galacean/engine-farming/farming/presentation/props/FarmingPropResources";
import { SeedSackMaterials } from "@galacean/engine-farming/farming/presentation/SeedSackMaterials";
import {
  PlanningFarmRepository,
  PLANNING_FARMING_PROJECT_TYPE
} from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmRepository.ts";
import { seedWorldProjectFormats } from "../../demos/seed-world/SeedWorldProjectFormats.ts";
import { registerPlanningFarmingAssets } from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmingAssets.ts";
import { checkPresentationOwnership, checkStandaloneResourceOwnership } from "./FarmingOwnershipAcceptance.ts";

const results: { name: string; passed: boolean; error?: string }[] = [];
const output = document.querySelector<HTMLPreElement>("#results")!;
const assert: (value: unknown, message: string) => asserts value = (value, message) => {
  if (!value) throw new Error(message);
};
const equal = (a: unknown, b: unknown, message: string) => assert(JSON.stringify(a) === JSON.stringify(b), message);
const near = (a: number, b: number, message: string) => assert(Math.abs(a - b) < 0.0001, message + `: ${a} != ${b}`);
type FarmingComponentProxy = {
  [K in keyof FarmingCommands]: (
    input: FarmingCommands[K],
    options?: FarmingWriteOptions
  ) => Promise<{ ok: true; value: FarmingOutputs[K] }>;
};
function farmingFacade(editor: RuntimeEditor) {
  const extension = createFarmingComponentExtension(editor.projection);
  return createAgentEditorFacade(extension.definition.editorComponents!, async (name, input) => {
    const tool = extension.tools.find((candidate) => candidate.name === name);
    assert(tool, `Missing production component tool: ${name}`);
    return toAgentValue(
      tool.parseOutput(await tool.execute(tool.parseInput(input), { signal: new AbortController().signal }))
    );
  });
}
const check = async (name: string, run: () => Promise<void> | void) => {
  try {
    await run();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: String(error) });
  }
  output.textContent = JSON.stringify(results, null, 2);
};
const data = farmingResourceData(FARM_DEFINITIONS);
const ground: FarmingGroundProvider = {
  capture: () => ({
    revision: 1,
    sample: (_groundId, x, z) => ({ position: [x, 0, z], normal: [0, 1, 0], surface: "soil" }),
    inspectBounds: () => ({
      covered: true,
      maximumSlopeDegrees: 0,
      surfaces: ["soil"],
      blocked: false,
      underwater: false
    }),
    raycast: () => null
  }),
  subscribe: () => () => {}
};
const source = {
  asset: { version: "2.0" },
  scene: { rootEntities: ["system-entity"], background: { mode: 0, color: { r: 0.12, g: 0.18, b: 0.14, a: 1 } } },
  entities: [{ id: "system-entity", name: "Farming", components: ["system"] }],
  components: [
    {
      id: "system",
      type: "FarmingSystem",
      props: {
        catalog: { $ref: "Farm/Catalog.json" },
        rules: { $ref: "Farm/Rules.json" },
        state: { $ref: "Farm/State.json" }
      }
    }
  ]
};
const initial: RuntimeProjectPackage = {
  version: RUNTIME_PROJECT_SAVE_VERSION,
  project: {
    scene: "Farm.scene",
    files: [
      { virtualPath: "Farm.scene", path: "Farm.scene", type: "Scene" },
      { virtualPath: "Farm/Catalog.json", path: "catalog.json", type: "JSON" },
      { virtualPath: "Farm/Rules.json", path: "rules.json", type: "JSON" },
      { virtualPath: "Farm/State.json", path: "state.json", type: PLANNING_FARMING_PROJECT_TYPE }
    ]
  },
  contents: {
    "Farm.scene": JSON.stringify(source),
    "Farm/Catalog.json": JSON.stringify({ version: 1, kind: "catalog", data: data.catalog }),
    "Farm/Rules.json": JSON.stringify({ version: 1, kind: "rules", data: data.rules }),
    "Farm/State.json": JSON.stringify({ version: 1, farms: {} })
  }
};
for (const file of initial.project.files)
  file.dependencies = file.type === "Scene" ? ["Farm/Catalog.json", "Farm/Rules.json", "Farm/State.json"] : [];
const probeSource = `import { FarmingSystem } from "@galacean/seed-world-systems";
export const SystemType = FarmingSystem;
export function read(system: FarmingSystem) { const multiplier: number | null = system.cropGrowthMultiplier; return { multiplier, sameClass: system instanceof FarmingSystem }; }`;
initial.project.files.push({ virtualPath: "Probe.ts", path: "Probe.ts", type: "script", dependencies: [] });
initial.contents["Probe.ts"] = probeSource;
const originals = import.meta.glob<string>("../../../packages/farming/src/farming/assets/**/*.glb", {
  eager: true,
  as: "url"
});
let mainEngine: WebGLEngine;
async function assetParity() {
  registerFarmingPropResources(mainEngine);
  for (const prop of [
    "Storage/cart",
    "Storage/basket",
    "Harvest/basket",
    "Sowing/seed-sack",
    "Tilling/hoe",
    "Tilling/rake"
  ]) {
    await check(`native asset parity: ${prop}`, async () => {
      const path = `../../../packages/farming/src/farming/assets/${prop.toLowerCase()}.glb`;
      const original = await mainEngine.resourceManager.load<GLTFResource>({
        url: originals[path],
        type: AssetType.GLTF,
        params: { keepMeshData: true }
      });
      const prefab = await mainEngine.resourceManager.load<PrefabResource>({
        url: `Farming/Props/${prop}.prefab`,
        type: AssetType.Prefab
      });
      const native = prefab.instantiate();
      const before = original.defaultSceneRoot.getComponentsIncludeChildren(MeshRenderer, []),
        after = native.getComponentsIncludeChildren(MeshRenderer, []);
      equal(after.length, before.length, "Renderer count");
      for (let i = 0; i < before.length; i++) {
        equal(after[i].mesh!.bounds, before[i].mesh!.bounds, "Mesh bounds");
        equal(after[i].mesh!.subMeshes, before[i].mesh!.subMeshes, "Submeshes");
        const a = after[i].getMaterial()!,
          b = before[i].getMaterial()!;
        equal(a.shader.name, b.shader.name, "Shader family");
        for (const property of b.shaderData.getProperties()) {
          const expected = b.shaderData.getPropertyValue(property);
          if (typeof expected === "number" && !Number.isFinite(expected)) continue;
          const actual = a.shaderData.getPropertyValue(property);
          if (property.type === 7)
            equal((actual as { name: string })?.name, (expected as { name: string }).name, "Texture binding");
          else equal(actual, expected, `Material ${property.name}`);
        }
        equal(after[i].entity.transform.localMatrix, before[i].entity.transform.localMatrix, "Local placement");
      }
      if (prop.startsWith("Tilling/")) {
        const oldClip = original.animations![0];
        const animator = native.getComponent(Animator)!;
        const clip = animator.animatorController!.layers[0].stateMachine.states[0].clip!;
        near(clip.length, oldClip.length, "Animation duration");
        const transformTree = (root: import("@galacean/engine").Entity): number[][] => [
          Array.from(root.transform.localMatrix.elements),
          ...root.children.flatMap(transformTree)
        ];
        for (const phase of [0, 0.2, 0.5, 0.8, 1]) {
          oldClip.sampleAnimation(original.defaultSceneRoot, phase * oldClip.length);
          clip.sampleAnimation(native, phase * clip.length);
          const old = transformTree(original.defaultSceneRoot),
            current = transformTree(native);
          equal(current.length, old.length, "Animated topology");
          current.forEach((values, i) => values.forEach((v, j) => near(v, old[i][j], "Animation transform")));
        }
      }
      if (prop === "Sowing/seed-sack") {
        const variants = new SeedSackMaterials();
        const label = after.find((r) => r.getMaterial()!.name === "SeedSackLabel")!;
        const source = label.getMaterial() as EngineExports.PBRMaterial;
        const mesh = label.mesh;
        const texture = source.baseTexture;
        variants.apply(label, "wheat-seed");
        const idle = label.getMaterial()!;
        variants.apply(label, "tomato-seed");
        const live = label.getMaterial()!;
        mainEngine.resourceManager.gc();
        assert(
          !idle.destroyed && !live.destroyed && !source.destroyed,
          "Seed sack variants and their source survive GC"
        );
        variants.dispose();
        variants.dispose();
        assert(
          idle.destroyed && live.destroyed && label.getMaterial() === source,
          "Seed sack destroys both variants after detaching"
        );
        assert(
          !mesh.destroyed && !source.destroyed && texture && !texture.destroyed,
          "Borrowed mesh, material and texture survive"
        );
      }
      native.destroy();
    });
  }
}
async function vertical() {
  const id = `farming-migration-acceptance:${crypto.randomUUID()}`;
  const storage = await RuntimeProjectStorage.open();
  await storage.save(id, initial);
  storage.close();
  let session: RuntimeProjectSession,
    engine: WebGLEngine,
    editor: RuntimeEditor,
    system: FarmingSystem,
    area: FarmingAreaComponent,
    repository: PlanningFarmRepository;
  let releaseDependencies: (() => void) | undefined;
  const clock = new ManualFarmClock(1_000_000);
  const open = async () => {
    session = await RuntimeProjectSession.open(id, initial.project, location.href, {
      scriptModules: seedWorldScriptModules
    });
    session.registerAssetFormats(seedWorldProjectFormats);
    session.registerProjectValidator(createPlanningFarmingAuthoringValidator());
    await session.initializeDependencies();
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 240;
    engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
    engine.resourceManager.registerVirtualResources(await session.resources());
    const scene = await engine.resourceManager.load<Scene>({ url: "Farm.scene", type: AssetType.Scene });
    engine.sceneManager.activeScene = scene;
    editor = new RuntimeEditor(session, scene, seedWorldProjectFormats);
    await bind(true);
  };
  const bind = async (initial = false) => {
    const next = editor.projection.resolveComponent(
      editor.projection.queryComponents({ type: "FarmingSystem" })[0]
    ) as FarmingSystem;
    if (
      !initial &&
      next === system &&
      area.configuration!.catalog === next.catalog &&
      area.configuration!.rules === next.rules
    ) {
      await system.synchronizeAuthoring();
      return;
    }
    if (!initial) {
      await area.dispose();
      releaseDependencies?.();
      area.entity.destroy();
      repository.dispose();
      if (system !== next) await system.dispose();
    }
    system = next;
    repository = new PlanningFarmRepository(session, undefined, "Farm/State.json", () => system.state);
    releaseDependencies = system.configureRuntime(() => ({
      groundProvider: ground,
      repository,
      clock,
      storagePresentation: false,
      autoAdvance: false
    }));
    area = engine.sceneManager.activeScene!.createRootEntity("Runtime area").addComponent(FarmingAreaComponent);
    await area.configure({
      farmId: "acceptance",
      layoutId: "test",
      layoutVersion: 1,
      catalog: system.catalog!,
      rules: system.rules!,
      plots: [{ id: "ground/x0z0", label: "Plot", target: { groundId: "ground", cellX: 0, cellZ: 0 } }]
    });
    await system.synchronizeAuthoring();
  };
  const close = async () => {
    await system.dispose();
    repository.dispose();
    await session.flush();
    editor.dispose();
    engine.destroy();
    session.dispose();
  };
  await open();
  let facade = farmingFacade(editor!);
  const [component] = await facade.component.query({ type: "FarmingSystem" });
  equal(component, editor!.projection.queryComponents({ type: "FarmingSystem" })[0], "Proxy uses Source identity");
  let farm = component as unknown as FarmingComponentProxy;
  equal((await farm.list({})).value[0].farmId, area!.farmId, "Production proxy resolves actual native area");
  const modules = await session!.scriptModules(["Probe.ts"], { "@galacean/engine": EngineExports });
  const probe = modules.get("Probe.ts") as {
    SystemType: unknown;
    read(system: FarmingSystem): { multiplier: number | null; sameClass: boolean };
  };
  assert(
    probe.SystemType === FarmingSystem && probe.read(system!).sameClass,
    "Actual Script import shares native component class identity"
  );
  equal(probe.read(system!).multiplier, null, "Host declarations expose the component tuning contract");
  const plant = await farm.plant(
    { farmId: area!.farmId, plotId: "ground/x0z0", seedId: "tomato-seed" },
    { commandId: "ecs-browser-plant" }
  );
  assert(plant.ok, "Plant through actual domain API");
  const crop = area!.service.getPlot("ground/x0z0")!.crop!.instanceId;
  equal(
    (await farm.getPlot({ farmId: area!.farmId, plotId: "ground/x0z0" })).value!.crop!.instanceId,
    crop,
    "Proxy and actual service observe the same crop"
  );
  equal(
    (await farm.verify({ farmId: area!.farmId, commandId: "ecs-browser-plant" })).value.receipt!.commandId,
    "ecs-browser-plant",
    "Production proxy preserves command receipt"
  );
  system!.cropGrowthMultiplier = 0;
  await area!.service.whenIdle();
  equal(
    area!.service.simulationConfig.cropGrowthMultiplier,
    0,
    "Direct component assignment works without Host synchronization"
  );
  const pausedGrowth = area!.service.getSnapshot().crops[crop].growthUnits;
  const growthPauseObservationMs = 30_000;
  clock.advanceBy(growthPauseObservationMs);
  await area!.service.checkpoint();
  equal(
    area!.service.getSnapshot().crops[crop].growthUnits,
    pausedGrowth,
    "Direct assignment pauses actual crop growth"
  );
  system!.cropGrowthMultiplier = null;
  await area!.service.whenIdle();
  const identity = system!;
  const edit = async (value: number | null) => {
    const signal = new AbortController().signal;
    const tx = editor!.beginEdit(crypto.randomUUID(), signal);
    try {
      await tx.run(({ draft, edited }) => {
        new RuntimeSceneEdit(draft, "Farm.scene").updateComponent("system", { cropGrowthMultiplier: value });
        edited();
      });
      await tx.prepare(signal);
      await tx.commit();
      await tx.activate(signal, { afterProjection: () => bind() });
    } finally {
      await tx.complete?.();
    }
  };
  await edit(0);
  assert(system! === identity, "Property edits retain component identity");
  equal(area!.service.simulationConfig.cropGrowthMultiplier, 0, "Pause growth via Source");
  const move = async (direction: "undo" | "redo") => {
    const signal = new AbortController().signal,
      tx = editor!.beginEdit(crypto.randomUUID(), signal);
    const entries = session!.history.query()[direction];
    try {
      await tx.moveHistory({ direction, transactionIds: [entries[0].transactionId] });
      await tx.prepare(signal);
      await tx.commit();
      await tx.activate(signal, { afterProjection: () => bind() });
    } finally {
      await tx.complete?.();
    }
  };
  const irrigated = await farm.irrigate({ farmId: area!.farmId, plotId: "ground/x0z0" });
  assert(irrigated.ok, "In-flight gameplay accepted after author commit");
  const progress = JSON.stringify(area!.service.getSnapshot().plots);
  await move("undo");
  equal(JSON.stringify(area!.service.getSnapshot().plots), progress, "Undo keeps newer soil progress");
  equal(area!.service.simulationConfig.cropGrowthMultiplier, 1, "Undo restores inherited rate");
  equal(area!.service.getPlot("ground/x0z0")!.crop!.instanceId, crop, "Author undo preserves player crop");
  await move("redo");
  equal(area!.service.simulationConfig.cropGrowthMultiplier, 0, "Redo pauses again");
  let invalid = false;
  try {
    system!.cropGrowthMultiplier = -1;
  } catch {
    invalid = true;
  }
  assert(invalid, "Reject invalid multiplier");
  await close();
  await open();
  facade = farmingFacade(editor!);
  farm = (await facade.component.query({ type: "FarmingSystem" }))[0] as unknown as FarmingComponentProxy;
  equal(system!.cropGrowthMultiplier, 0, "Fresh Engine loads saved property");
  equal(area!.service.getPlot("ground/x0z0")!.crop!.instanceId, crop, "Fresh Engine resumes the same crop");
  assert(system!.catalog instanceof JSONAsset, "Native JSONLoader identity");
  equal(
    farmingCatalog(system!.catalog!).data.version,
    farmingRules(system!.rules!).data.version,
    "Shared resource kinds"
  );
  await edit(2);
  equal(area!.service.simulationConfig.cropGrowthMultiplier, 2, "Continue editing after reopen");
  await move("undo");
  equal(area!.service.simulationConfig.cropGrowthMultiplier, 0, "New session history undo");
  const previousCatalog = system!.catalog;
  const signal = new AbortController().signal,
    replace = editor!.beginEdit(crypto.randomUUID(), signal);
  try {
    await replace.run(({ draft, edited }) => {
      const content = JSON.parse(draft.read("Farm/Catalog.json") as string);
      content.data.seeds[0].name = "Edited seed label";
      draft.update("Farm/Catalog.json", JSON.stringify(content));
      edited();
    });
    await replace.prepare(signal);
    await replace.commit();
    await replace.activate(signal, { afterProjection: () => bind() });
  } finally {
    await replace.complete?.();
  }
  assert(system!.catalog !== previousCatalog, "Resource content edit rebinds the native JSONAsset");
  equal(farmingCatalog(system!.catalog!).data.seeds[0].name, "Edited seed label", "Updated resource consumed");
  equal(area!.service.getPlot("ground/x0z0")!.crop!.instanceId, crop, "Resource rebind keeps crop identity");
  await move("undo");
  equal(
    farmingCatalog(system!.catalog!).data.seeds[0].name,
    data.catalog.seeds[0].name,
    "Undo restores resource content"
  );
  equal(
    (await farm.getCatalog({ farmId: area!.farmId })).value.seeds[0].name,
    data.catalog.seeds[0].name,
    "Reopened identity proxy resolves replacement resources"
  );
  // Removal and undo exercise the real Source projection rather than a fabricated component port.
  await system!.dispose();
  repository!.dispose();
  releaseDependencies?.();
  const removalSignal = new AbortController().signal;
  const removal = editor!.beginEdit(crypto.randomUUID(), removalSignal);
  try {
    await removal.run(({ draft, edited }) => {
      new RuntimeSceneEdit(draft, "Farm.scene").removeComponent("system");
      edited();
    });
    await removal.prepare(removalSignal);
    await removal.commit();
    await removal.activate(removalSignal);
  } finally {
    await removal.discard();
  }
  equal(await facade.component.query({ type: "FarmingSystem" }), [], "Deleted native component is not queryable");
  let staleRejected = false;
  try {
    await farm.list({});
  } catch {
    staleRejected = true;
  }
  assert(staleRejected, "Old proxy cannot call a deleted component");
  await move("undo");
  equal(
    (await farm.getPlot({ farmId: area!.farmId, plotId: "ground/x0z0" })).value!.crop!.instanceId,
    crop,
    "Undo restores component identity and saved progress to the same proxy"
  );
  await close();
}
async function projectOwnershipAndChanges() {
  const formats = new Map([...nativeAssetFormats(() => ({})), ...seedWorldProjectFormats]);
  const statePath = "Farm/State.json",
    propPath = "Farming/Props/Tilling/hoe.prefab";
  const customMaterial = "Custom/X.mat",
    unrelated = "Other/Unrelated.json";
  const pack = structuredClone(initial);
  pack.project.files = pack.project.files.filter((file) => file.type !== "script");
  delete pack.contents["Probe.ts"];
  const material = { name: "Custom material", shader: "PBR", macros: [], shaderData: {} };
  const materialURL = URL.createObjectURL(new Blob([JSON.stringify(material)], { type: "application/json" }));
  pack.project.files.push(
    { virtualPath: propPath, path: propPath, type: "Prefab", dependencies: [customMaterial] },
    { virtualPath: customMaterial, path: materialURL, type: "Material", dependencies: [] },
    { virtualPath: unrelated, path: unrelated, type: "JSON", dependencies: [] }
  );
  pack.contents[propPath] = JSON.stringify({
    asset: { version: "2.0" },
    root: "prop",
    entities: [{ id: "prop", name: "Prop", components: ["renderer"] }],
    components: [{ id: "renderer", type: "MeshRenderer", props: { material: { $ref: customMaterial } } }]
  });
  pack.contents[unrelated] = JSON.stringify({ kind: "rules", domain: "unrelated" });
  const id = `farming-review-boundaries:${crypto.randomUUID()}`;
  const storage = await RuntimeProjectStorage.open();
  await storage.save(id, pack);
  storage.close();
  let session = await RuntimeProjectSession.open(id, pack.project, location.href);
  session.registerAssetFormats(seedWorldProjectFormats);
  session.registerProjectValidator(createPlanningFarmingAuthoringValidator());
  const changes = new RuntimeAssetChanges(session.projectPackage),
    roots = [propPath];
  const stopReads = session.observeAssetReads((file, content) => changes.recordRead(file, content));
  await session.fileProvider().prepare!(customMaterial);
  assert(!planningFarmingAssetsAffected(changes, session.projectPackage, roots), "Lazy read does not retire the farm");
  await session.update((current) => {
    const edit = new RuntimeProjectEdit(current, formats);
    edit.update(
      customMaterial,
      JSON.stringify({ ...material, shaderData: { material_Roughness: { type: "Float", value: 1 } } })
    );
    return edit.finish();
  });
  assert(
    planningFarmingAssetsAffected(changes, session.projectPackage, roots),
    "Custom material edit invalidates consumed Prefab root"
  );
  changes.accept(session.projectPackage);
  await session.update((current) => {
    const edit = new RuntimeProjectEdit(current, formats);
    edit.update(unrelated, JSON.stringify({ kind: "catalog", domain: "unrelated" }));
    return edit.finish();
  });
  assert(
    !planningFarmingAssetsAffected(changes, session.projectPackage, roots),
    "Unrelated JSON edit does not retire the farm"
  );
  const invalid = structuredClone(session.projectPackage);
  invalid.contents["Farm/Catalog.json"] = JSON.stringify({ version: 1, data: data.catalog });
  let missingKindRejected = false;
  try {
    validatePlanningFarmingAuthoring(invalid);
  } catch {
    missingKindRejected = true;
  }
  assert(missingKindRejected, "Referenced catalog missing kind is rejected before commit");
  const rulesPath = "Farm/Rules.json";
  const originalRules = session.projectPackage.contents[rulesPath];
  const beforeMismatch = session.publicationRevision;
  const mismatch = new RuntimeProjectEdit(session.projectPackage, formats);
  mismatch.update(
    rulesPath,
    JSON.stringify({ version: 1, kind: "rules", data: { ...data.rules, version: data.rules.version + 1 } })
  );
  let versionRejected = false;
  try {
    await session.publish(mismatch.finish(), beforeMismatch);
  } catch (error) {
    versionRejected = String(error).includes("catalog and rules data versions must match");
  }
  assert(versionRejected, "Mismatched catalog/rules data versions are rejected before publication");
  equal(session.publicationRevision, beforeMismatch, "Rejected candidate leaves publication revision unchanged");
  equal(session.projectPackage.contents[rulesPath], originalRules, "Rejected candidate leaves rules unchanged");
  const repository = new PlanningFarmRepository(session, undefined, statePath);
  repository.dispose();
  await session.update((current) => {
    const edit = new RuntimeProjectEdit(current, formats);
    new RuntimeSceneEdit(edit, "Farm.scene").removeComponent("system");
    return edit.finish();
  });
  const deletion = new RuntimeProjectEdit(session.projectPackage, formats);
  deletion.delete(statePath);
  let retained = false;
  try {
    await session.publish(deletion.finish(), session.publicationRevision, [statePath]);
  } catch {
    retained = true;
  }
  assert(
    retained && session.projectPackage.project.files.some((file) => file.virtualPath === statePath),
    "Released project-retained state cannot be deleted in the same session"
  );
  stopReads();
  await session.flush();
  session.dispose();
  session = await RuntimeProjectSession.open(id, pack.project, location.href);
  session.registerAssetFormats(seedWorldProjectFormats);
  const reopenedDeletion = new RuntimeProjectEdit(session.projectPackage, formats);
  reopenedDeletion.delete(statePath);
  await session.publish(reopenedDeletion.finish(), session.publicationRevision, [statePath]);
  await session.flush();
  session.dispose();
  const saved = await RuntimeProjectStorage.open();
  assert(
    !(await saved.load(id))!.project.files.some((file) => file.virtualPath === statePath),
    "After reopening without a state owner the unused save can be deleted durably"
  );
  saved.close();
  URL.revokeObjectURL(materialURL);
}
async function main() {
  registerNativeFarming();
  registerPlanningFarmingAssets();
  mainEngine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
  await check("native JSON atlas reference encoding", () => {
    const file = encodeFarmingResourceFile({
      version: 1,
      kind: "catalog",
      data: { ...data.catalog, plants: data.catalog.plants.map((p) => ({ ...p, atlasUrl: `Textures/${p.id}.ktx2` })) }
    });
    assert(JSON.stringify(file).includes('"$ref":"Textures/'), "Native dependency references");
  });
  await assetParity();
  await check("real frame and idle-GC farming GPU ownership", checkPresentationOwnership);
  await check(
    "standalone JSONAsset ownership through restore, failure and pending disposal",
    checkStandaloneResourceOwnership
  );
  await check("Source edit / undo / redo / drain / save / fresh Engine reopen", vertical);
  await check(
    "review boundaries: lazy reads / custom materials / JSON ownership / retained state deletion",
    projectOwnershipAndChanges
  );
  (window as unknown as { farmingMigrationResults: typeof results }).farmingMigrationResults = results;
}
void main().catch((error) => {
  output.textContent = String(error);
  console.error(error);
});
