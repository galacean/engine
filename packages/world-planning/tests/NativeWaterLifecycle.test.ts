import { expect, it } from "vitest";
import { AssetType, Camera, Scene, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { registerNativeWater, WaterBodyComponent, WaterSystem } from "@galacean/engine-water/water/native/index";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { waterProjectFormats } from "@galacean/engine-water/water/native/WaterProjectFormats";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";

it("retires replaced Source components without leaking cancelled candidates or Scene ownership", async () => {
  registerNativeWater();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  const manifest = await (await fetch(BUILTIN_WATER_PROJECT_URL)).json();
  const project = await RuntimeProjectSession.open(
    `water-retirement:${crypto.randomUUID()}`,
    manifest,
    BUILTIN_WATER_PROJECT_URL
  );
  project.registerAssetFormats(waterProjectFormats);
  project.registerTextAssetTypes(["WaterResource"]);
  await project.initializeDependencies();
  engine.resourceManager.registerVirtualResources(await project.resources());
  const scene = await engine.resourceManager.load<Scene>({ type: AssetType.Scene, url: manifest.scene });
  engine.sceneManager.activeScene = scene;
  const original: WaterBodyComponent[] = [];
  for (const root of scene.rootEntities) root.getComponentsIncludeChildren(WaterBodyComponent, original);
  const body = original[0],
    input = body.authoring!,
    id = body.waterId;
  const system = scene.createRootEntity("Water owner").addComponent(WaterSystem);
  system.camera = scene.createRootEntity("Camera").addComponent(Camera);
  const otherScene = new Scene(engine);
  engine.sceneManager.addScene(otherScene);
  const other = otherScene.createRootEntity("Other owner").addComponent(WaterSystem);
  expect(() => other.runtimeHost).toThrow("Camera");
  other.camera = otherScene.createRootEntity("Camera").addComponent(Camera);
  system.beginInputUpdate();
  other.beginInputUpdate();
  try {
    await (await system.prepareBatch([{ body, configuration: body._compileAuthoring() }])).commit().retiredCleanup;
    body.entity.destroy();
    const replacement = scene.createRootEntity("Restored Source body").addComponent(WaterBodyComponent);
    replacement.waterId = id;
    replacement.authoring = input;
    await (await system.prepareBatch([{ body: replacement, configuration: replacement._compileAuthoring() }])).commit()
      .retiredCleanup;
    let retired = false;
    void body.dispose().then(() => {
      retired = true;
    });
    await expect.poll(() => retired, { timeout: 1000 }).toBe(true);
    expect(system.bodies).toEqual([replacement]);
    expect(system.sample(4, 4)).toMatchObject({ water: true, surfaceElevationMetres: 0.5 });
    expect(input.material!.destroyed).toBe(false);
    const duplicate = scene.createRootEntity("Duplicate owner");
    expect(() => duplicate.addComponent(WaterSystem)).toThrow("one WaterSystem");
    duplicate.destroy();
    expect(system.sample(4, 4)).toMatchObject({ water: true });
    expect(() => {
      system.camera = other.camera;
    }).toThrow("Recreate WaterSystem");
    const controller = new AbortController(),
      revision = system.revision;
    const publishedQuality = replacement.configuration!.quality;
    replacement.authoring = { ...input, quality: { ...input.quality, query: "off" } };
    const candidateConfiguration = replacement._compileAuthoring();
    const candidate = await system.prepareBatch(
      [{ body: replacement, configuration: { ...candidateConfiguration, visible: false } }],
      controller.signal
    );
    controller.abort();
    expect(() => candidate.commit()).toThrow();
    await candidate.rollback();
    expect(system.revision).toBe(revision);
    expect(replacement.configuration!.quality).toBe(publishedQuality);
    expect(publishedQuality.destroyed).toBe(false);
    replacement.authoring = input;
    await (await system.prepareBatch([{ body: replacement, configuration: replacement._compileAuthoring() }])).commit()
      .retiredCleanup;
    expect(candidateConfiguration.quality.destroyed).toBe(true);
    const shared = otherScene.createRootEntity("Other Scene lake").addComponent(WaterBodyComponent);
    shared.waterId = id;
    shared.authoring = input;
    await (await other.prepareBatch([{ body: shared, configuration: shared._compileAuthoring() }])).commit()
      .retiredCleanup;
    const late = await system.prepareBatch([{ body: replacement, configuration: replacement.configuration! }]);
    await system.dispose();
    expect(() => late.commit()).toThrow();
    await late.rollback();
    expect(other.sample(4, 4)).toMatchObject({ water: true });
    expect(input.material!.destroyed).toBe(false);
  } finally {
    system.endInputUpdate(true, false);
    other.endInputUpdate(true, false);
    await system.dispose();
    await other.dispose();
    project.dispose();
    engine.destroy();
  }
});
