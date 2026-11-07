import {
  AssetType,
  Camera,
  Color,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderTarget,
  Scene,
  Shader,
  ShaderLanguage,
  ScreenSpaceReflection as SSR,
  type ScreenSpaceReflectionPass,
  ScreenSpaceReflectionContent as Content,
  Texture2D,
  TextureFormat,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import type { HeightfieldWaterDescriptorV1 } from "../../water/src/water/authoring/heightfield/HeightfieldWaterDescriptor";
import { WaterQualityTier } from "../../water/src/water/authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../water/src/water/authoring/wave/enums/WaterWaveModel";
import PBRSource from "../src/native/shader/src/Shaders/PBR.shader?raw";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
let engine: WebGLEngine;
beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
});
afterAll(() => engine.destroy());

it("keeps contribution independent from receiver ownership and restores Scene, Camera and material author data", async () => {
  const mat = new PBRMaterial(engine);
  SSR.setMaterialReceiver(mat, 1, 0.7);
  mat.contributeScreenSpaceReflection = true;
  expect(mat._screenSpaceReflectionAuthorSettings).toBeNull();
  expect(SSR.setMaterialReceiver(mat, 0)).toBe(true);
  expect(mat.contributeScreenSpaceReflection).toBe(true);
  const clone = mat.clone();
  expect(clone.contributeScreenSpaceReflection).toBe(true);
  clone.destroy();
  const url = URL.createObjectURL(
    new Blob([
      JSON.stringify({
        name: "contributor",
        shader: "PBR",
        shaderData: {},
        macros: [],
        contributeScreenSpaceReflection: true
      })
    ])
  );
  const restored = await engine.resourceManager.load<PBRMaterial>({ type: AssetType.Material, url });
  expect(restored.contributeScreenSpaceReflection).toBe(true);
  expect(restored._screenSpaceReflectionAuthorSettings).toBeNull();
  const scene = new Scene(engine);
  expect(scene.screenSpaceReflection.reflectionContent).toBe(Content.OpaqueOnly);
  scene.screenSpaceReflection.reflectionContent = Content.OpaqueAndTransparent;
  const c = scene.createRootEntity().addComponent(Camera);
  c.screenSpaceReflection.settingsSource = 1;
  expect(c.screenSpaceReflectionSettings.overrideSettings?.reflectionContent).toBe(Content.OpaqueAndTransparent);
  scene.screenSpaceReflection.reflectionContent = Content.OpaqueOnly;
  expect(c.screenSpaceReflection._includesTransparentContributors).toBe(true);
  c.screenSpaceReflectionSettings = { settingsSource: 0 };
  expect(c.screenSpaceReflection._includesTransparentContributors).toBe(false);
  URL.revokeObjectURL(url);
  restored.destroy();
  mat.destroy();
  scene.destroy();
});

it("renders all receive/contribute combinations with correct alpha, opaque occlusion and allocation fallback", () => {
  const scene = new Scene(engine);
  engine.sceneManager.activeScene = scene;
  scene.background.solidColor = new Color(0, 0, 0, 1);
  scene.screenSpaceReflection.apply({
    activationMode: 1,
    receiverPolicy: 1,
    resolutionScale: 1,
    maxRaySteps: 64,
    thickness: 0.4,
    edgeFade: 0,
    reflectionContent: Content.OpaqueAndTransparent
  });
  const camera = scene.createRootEntity().addComponent(Camera);
  camera.entity.transform.setPosition(3, 3, 6);
  camera.entity.transform.lookAt(new Vector3(0, 0.5, 0));
  const output = new Texture2D(engine, 256, 256, TextureFormat.R8G8B8A8, false, false);
  const rt = new RenderTarget(engine, 256, 256, output, TextureFormat.Depth24);
  camera.renderTarget = rt;
  const floor = scene.createRootEntity().addComponent(MeshRenderer);
  floor.mesh = PrimitiveMesh.createPlane(engine, 10, 10);
  const mirror = new PBRMaterial(engine);
  mirror.roughness = 0.05;
  mirror.metallic = 1;
  mirror.emissiveColor.set(0, 0, 0.3, 1);
  floor.setMaterial(mirror);
  const cube = scene.createRootEntity().addComponent(MeshRenderer);
  cube.entity.transform.setPosition(0, 1, 0);
  cube.mesh = PrimitiveMesh.createCuboid(engine, 1.5, 1.5, 1.5);
  const red = new PBRMaterial(engine);
  const samplingSource = PBRSource.replace('Shader "PBR"', 'Shader "ContributionReceiver"')
    .replace(
      'Tags { pipelineStage = "Forward"}',
      'Tags { pipelineStage = "Forward", screenSpaceReflectionTransparentSample = "SampleV1" }'
    )
    .replace("FragmentShader = PBRFragment;", "FragmentShader = receiverForward;")
    .replace(
      '#include "ShaderLibrary/PBR/ForwardPassPBR.glsl"',
      `#include "ShaderLibrary/PBR/ForwardPassPBR.glsl"
      sampler2D camera_ScreenSpaceReflectionTexture;
      float camera_ScreenSpaceReflectionIntensity;
      float material_ScreenSpaceReflectionMode;
      float material_ScreenSpaceReflectionIntensity;
      void receiverForward(Varyings v) {
        PBRFragment(v);
        if (material_ScreenSpaceReflectionMode > 1.5 && material_ScreenSpaceReflectionMode < 2.5)
          gl_FragColor.rgb += texture2D(camera_ScreenSpaceReflectionTexture, gl_FragCoord.xy / vec2(256.0)).rgb *
            camera_ScreenSpaceReflectionIntensity * material_ScreenSpaceReflectionIntensity;
      }`
    );
  red.shader = Shader.create(samplingSource, ShaderLanguage.GLSLES300)!;
  expect(SSR.supportsMaterialTransparentSampling(red)).toBe(true);
  red.roughness = 0.05;
  red.isTransparent = true;
  red.baseColor.set(1, 0, 0, 0.6);
  red.emissiveColor.set(1, 0, 0, 1);
  red.screenSpaceReflection = { mode: "Off", intensity: 0.7 };
  cube.setMaterial(red);
  const render = () => {
    engine.update();
    const pixels = new Uint8Array(256 * 256 * 4);
    output.getPixelBuffer(0, 0, 256, 256, 0, pixels);
    return pixels;
  };
  const difference = (a: Uint8Array, b: Uint8Array) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);
  expect(SSR.supportsMaterialContribution(red)).toBe(true);
  const off = render();
  const baseCost = { ...camera.screenSpaceReflection.metrics };
  expect(camera.screenSpaceReflection.metrics.contributionColorDrawCount).toBe(0);
  red.contributeScreenSpaceReflection = true;
  const capabilityChecks = vi.spyOn(SSR, "supportsMaterialContribution");
  let on: Uint8Array;
  try {
    on = render();
    expect(capabilityChecks.mock.calls.filter(([material]) => material === red)).toHaveLength(1);
    const depthPass = red.shader.subShaders[0].passes.find(
      (pass) => pass.getTagValue("pipelineStage") === "ScreenSpaceReflectionContributionDepth"
    )!;
    try {
      depthPass.setTag("screenSpaceReflectionContribution", "incompatible");
      render();
      expect(camera.screenSpaceReflection.metrics.contributionColorDrawCount).toBe(0);
    } finally {
      depthPass.setTag("screenSpaceReflectionContribution", "ColorDepthV1");
    }
    render();
  } finally {
    capabilityChecks.mockRestore();
  }
  expect(camera.screenSpaceReflection.metrics.contributionUnsupportedReason).toBeNull();
  expect(camera.screenSpaceReflection.metrics.contributionColorDrawCount).toBe(1);
  expect(camera.screenSpaceReflection.metrics.contributionDepthDrawCount).toBe(1);
  const contributionCost = camera.screenSpaceReflection.metrics;
  expect(contributionCost.renderTargetCount - baseCost.renderTargetCount).toBe(1);
  expect(contributionCost.renderTextureCount - baseCost.renderTextureCount).toBe(2);

  expect(difference(on, off)).toBeGreaterThan(100);
  expect(red.screenSpaceReflection).toEqual({ mode: "Off", intensity: 0.7 });
  red.screenSpaceReflection = { mode: "On", intensity: 0.7 };
  const both = render();
  expect(difference(both, on)).toBeGreaterThan(100);
  red.contributeScreenSpaceReflection = false;
  const receiveOnly = render();
  expect(difference(receiveOnly, off)).toBeGreaterThan(100);
  expect(difference(both, receiveOnly)).toBeGreaterThan(100);
  red.screenSpaceReflection = { mode: "Off", intensity: 0.7 };
  red.contributeScreenSpaceReflection = true;
  scene.screenSpaceReflection.reflectionContent = Content.OpaqueOnly;
  expect(difference(render(), off)).toBe(0);
  scene.screenSpaceReflection.reflectionContent = Content.OpaqueAndTransparent;
  red.baseColor.a = 0;
  const zero = render();
  red.contributeScreenSpaceReflection = false;
  expect(difference(render(), zero)).toBe(0);
  red.baseColor.a = 0.6;
  scene.screenSpaceReflection.activationMode = 2;
  const disabled = render();
  red.contributeScreenSpaceReflection = true;
  expect(difference(render(), disabled)).toBe(0);

  // The color capture must match normal transparent blending, including overlapping layers.
  const back = scene.createRootEntity().addComponent(MeshRenderer);
  back.entity.transform.setPosition(0, 1, -1.2);
  back.mesh = cube.mesh;
  const blue = new PBRMaterial(engine);
  blue.isTransparent = true;
  blue.baseColor.set(0, 0, 1, 0.4);
  blue.emissiveColor.set(0, 0, 1, 1);
  blue.screenSpaceReflection = { mode: "Off", intensity: 1 };
  blue.contributeScreenSpaceReflection = true;
  back.setMaterial(blue);
  const normalForward = render();
  const pass = (
    camera as unknown as {
      _renderPipeline: {
        _screenSpaceReflectionPass: Pick<ScreenSpaceReflectionPass, "captureContributions"> & {
          _contributionTarget: RenderTarget | null;
        };
      };
    }
  )._renderPipeline._screenSpaceReflectionPass;
  const capture = pass.captureContributions;
  let captured: Uint8Array;
  let capturedSRGB = false;
  pass.captureContributions = function (...args: Parameters<typeof capture>) {
    capture.apply(this, args);
    capturedSRGB = this._contributionTarget!.getColorTexture(0)!.isSRGBColorSpace;
    captured = new Uint8Array(256 * 256 * 4);
    (this._contributionTarget!.getColorTexture(0) as Texture2D).getPixelBuffer(0, 0, 256, 256, 0, captured);
  };
  scene.screenSpaceReflection.activationMode = 1;
  try {
    render();
  } finally {
    pass.captureContributions = capture;
  }
  // Compare linear values: the capture preserves source sRGB encoding, while this output is linear.
  if (capturedSRGB) {
    for (let i = 0; i < captured!.length; i++) {
      if (i % 4 !== 3) captured![i] = Math.round(Color.gammaToLinearSpace(captured![i] / 255) * 255);
    }
  }
  const maximumError = captured!.reduce(
    (maximum, value, index) => Math.max(maximum, Math.abs(value - normalForward[index])),
    0
  );
  expect(maximumError).toBeLessThanOrEqual(1);
  back.entity.destroy();
  blue.destroy();

  // A fully occluded transparent contributor must not leak through the opaque depth.
  const occluder = scene.createRootEntity().addComponent(MeshRenderer);
  occluder.entity.transform.setPosition(0, 1, 0);
  occluder.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
  const green = new PBRMaterial(engine);
  green.emissiveColor.set(0, 1, 0, 1);
  occluder.setMaterial(green);
  for (const samples of [1, 4]) {
    camera.msaaSamples = samples;
    red.contributeScreenSpaceReflection = true;
    const hidden = render();
    red.contributeScreenSpaceReflection = false;
    expect(difference(render(), hidden)).toBe(0);
  }
  camera.msaaSamples = 1;
  occluder.entity.destroy();
  green.destroy();

  // Contribution allocation failure retains the valid opaque reflection path.
  const pool = engine._renderTargetPool;
  const allocate = pool.allocateRenderTarget;
  pool.allocateRenderTarget = function (...args: Parameters<typeof allocate>) {
    if (args[4] && args[5]) throw new Error("injected contribution allocation failure");
    return allocate.apply(this, args);
  };
  red.contributeScreenSpaceReflection = true;
  try {
    expect(difference(render(), off)).toBe(0);
  } finally {
    pool.allocateRenderTarget = allocate;
  }
  expect(camera.screenSpaceReflection.metrics.contributionUnsupportedReason).toBe(
    "screen-space-reflection-contribution-unavailable"
  );
  expect(camera.screenSpaceReflection.metrics.tracePassCount).toBeGreaterThan(0);
  expect(engine._hardwareRenderer.gl.getError()).toBe(0);
  rt.destroy();
  output.destroy();
  scene.destroy();
  mirror.destroy();
  red.destroy();
});

it("verifies Heightfield and River Auto rendering, contribution and lifecycle", async () => {
  const { registerLakeWaterLook, createLakeSpatialFieldBudget, LAKE_WATER_LOOK_PRESET_ID } = await import(
    "../../water/src/water/presets/lake/LakeWaterLook"
  );
  const { createWaterQualityPlanV2 } = await import("../../water/src/water/authoring/quality/WaterQualityPlan");
  const { WaterSceneRuntimeHost } = await import("../../water/src/water/runtime/scene/WaterSceneRuntimeHost");
  const { HeightfieldWaterBackend } = await import("../../water/src/water/runtime/heightfield/HeightfieldWaterBackend");
  const { createLakeNormalResourceFactory } = await import(
    "../../water/src/water/resources/lake/LakeNormalRuntimeResource"
  );
  const { createWaterBodyAsset } = await import("../../water/src/water/authoring/body/WaterBodyAsset");
  const { createWaterBodyInstance } = await import("../../water/src/water/authoring/body/WaterBodyInstance");
  const { createHeightfieldWaterBodySourceDescriptorV1, createHeightfieldWaterRepresentationDataV1 } = await import(
    "../../water/src/water/authoring/heightfield/HeightfieldWaterDescriptor"
  );
  const { computeHeightfieldWaterPhysicalSourceHash } = await import(
    "../../water/src/water/compiler/heightfield/HeightfieldWaterCompiler"
  );
  const { hashStableValue } = await import("../../water/src/water/compiler/shared/determinism");
  const { RiverWaterBackend } = await import("../../water/src/water/runtime/river/RiverWaterBackend");
  const { createRiver } = await import("../../water/src/water/authoring/river/createRiver");
  const {
    createRiverWaterBodyAsset,
    registerRiverWaterBodyPresets,
    RIVER_CANONICAL_LOOK_PRESET_ID,
    riverQualityPlanIdForQuality
  } = await import("../../water/src/water/authoring/river/RiverWaterBodyAuthoring");
  const { RiverQualityLevel } = await import("../../water/src/water/authoring/river/RiverAuthoringEnums");
  const originalCreate = Shader.create;
  const targetProbes = new Set<string>();
  const shaderProbe = vi.spyOn(Shader, "create").mockImplementation((...args) => {
    const shader = Reflect.apply(originalCreate, Shader, args) as Shader;
    const source = args[0];
    if (
      typeof source === "string" &&
      source.includes('Pass "ScreenSpaceReflectionSurface"') &&
      source.includes('Shader "AIWorld/')
    ) {
      const name = shader.name + "Target300Probe";
      const probe = Reflect.apply(originalCreate, Shader, [
        source.replace(shader.name, name),
        ShaderLanguage.GLSLES300
      ]) as Shader;
      expect(probe.compileVariant(engine, []), `${shader.name} GLSLES300`).toBe(true);
      targetProbes.add(shader.name);
    }
    return shader;
  });
  try {
    for (const family of ["heightfield", "river"] as const) {
      const scene = new Scene(engine);
      engine.sceneManager.activeScene = scene;
      const camera = scene.createRootEntity("water-camera").addComponent(Camera);
      camera.entity.transform.setPosition(3, family === "river" ? 1.5 : 3, 6);
      camera.entity.transform.lookAt(new Vector3(0, 0, 0));
      const output = new Texture2D(engine, 256, 256, TextureFormat.R8G8B8A8, false, false);
      const target = new RenderTarget(engine, 256, 256, output, TextureFormat.Depth24);
      camera.renderTarget = target;
      const cube = scene.createRootEntity("reflection-target").addComponent(MeshRenderer);
      cube.mesh = PrimitiveMesh.createCuboid(engine, 1.5, 1.5, 1.5);
      cube.entity.transform.setPosition(0, 1, 0);
      const cubeMaterial = new PBRMaterial(engine);
      cubeMaterial.emissiveColor.set(1, 0, 0, 1);
      cube.setMaterial(cubeMaterial);
      const renderPixels = () => {
        engine.update();
        const pixels = new Uint8Array(256 * 256 * 4);
        output.getPixelBuffer(0, 0, 256, 256, 0, pixels);
        return pixels;
      };
      const waterRoot = scene.createRootEntity("water");
      const host = new WaterSceneRuntimeHost({
        engine,
        root: waterRoot,
        camera,
        reflection: { cullingMask: 0xffffffff }
      });
      const backend = family === "heightfield" ? new HeightfieldWaterBackend() : new RiverWaterBackend();
      host.registerBackend(backend);
      host.registerRuntimeResource(createLakeNormalResourceFactory(engine));
      const descriptor: HeightfieldWaterDescriptorV1 = {
        schemaVersion: 1,
        id: "ssr-water",
        grid: { originXZ: [-3.5, -3.5], cellSizeXZ: [1, 1], width: 8, height: 8 },
        wetTexelIndices: Uint32Array.from({ length: 64 }, (_, i) => i),
        surfaceHeights: new Float32Array(64),
        bedHeights: new Float32Array(64).fill(-2),
        quality: WaterQualityTier.High,
        waveAsset: { schemaVersion: 1, model: WaterWaveModel.None },
        surfaceMotion: { waveStrength: 0, shoreDampingWidth: 1 },
        spatialField: { signedDistanceRange: 8 }
      };
      const quality = createWaterQualityPlanV2({
        id: "runtime-quality",
        geometry: "high",
        surfaceShading: "high",
        sceneFields: "scene-color-depth",
        reflectionBudget: { environment: true, screenSpace: true },
        query: "off",
        spatialField: createLakeSpatialFieldBudget(descriptor)
      });
      host.registerAuthoringOnce("water-look", "test-v1", (assets) => {
        registerLakeWaterLook(assets);
        assets.registerQualityPlan(quality);
        registerRiverWaterBodyPresets(assets);
      });
      const representationData = createHeightfieldWaterRepresentationDataV1(descriptor);
      const asset =
        family === "river"
          ? createRiverWaterBodyAsset(
              createRiver({
                id: "ssr-river",
                width: 8,
                depth: 2,
                points: [
                  { id: "upstream", position: [0, 0, -4] },
                  { id: "downstream", position: [0, 0, 4] }
                ]
              })
            )
          : createWaterBodyAsset({
              id: "ssr-water",
              kind: "lake",
              representation: { domain: "bounded-grid", macroSurface: "heightfield" },
              source: {
                schemaVersion: 1,
                kind: "grid-mask",
                descriptor: createHeightfieldWaterBodySourceDescriptorV1(descriptor),
                capabilities: { localBathymetry: true, shoreSdf: true, current: false }
              },
              sourceHash: computeHeightfieldWaterPhysicalSourceHash(descriptor),
              representationData,
              representationDataHash: hashStableValue(representationData)
            });
      const transaction = host.beginBodySetTransaction();
      transaction.stage({
        bodyId: "water",
        asset,
        instance: createWaterBodyInstance({
          id: "water",
          assetId: asset.id,
          lookPresetId: family === "river" ? RIVER_CANONICAL_LOOK_PRESET_ID : LAKE_WATER_LOOK_PRESET_ID,
          qualityPlanId: family === "river" ? riverQualityPlanIdForQuality(RiverQualityLevel.High) : quality.id,
          visible: true,
          priority: 0,
          transform: { position: [0, 0, 0], yawDegrees: 0, scaleXZ: [1, 1] },
          interaction: { query: false, buoyancy: false, wake: false }
        }),
        createRuntimeContext: (root) => ({ engine, root, surfaceTimeOverride: 0 })
      });
      try {
        await transaction.commit();
        for (let i = 0; i < 3; i++) engine.update();
        expect(camera.screenSpaceReflection.metrics.requestedByConsumers).toBe(true);
        expect(camera.screenSpaceReflection.metrics.transparentSurfacePassDrawCount).toBeGreaterThan(0);
        if (backend instanceof HeightfieldWaterBackend) backend.setRuntimeSurfaceTimeOverride("water", 0);
        const on = renderPixels();
        const preview = scene.createRootEntity("disabled-ssr-preview").addComponent(Camera);
        preview.entity.transform.setPosition(3, family === "river" ? 1.5 : 3, 6);
        preview.entity.transform.lookAt(new Vector3(0, 0, 0));
        preview.screenSpaceReflection.renderingEnabled = false;
        const previewOutput = new Texture2D(engine, 256, 256, TextureFormat.R8G8B8A8, false, false);
        const previewTarget = new RenderTarget(engine, 256, 256, previewOutput, TextureFormat.Depth24);
        preview.renderTarget = previewTarget;
        const readPreview = () => {
          engine.update();
          const pixels = new Uint8Array(256 * 256 * 4);
          previewOutput.getPixelBuffer(0, 0, 256, 256, 0, pixels);
          return pixels;
        };
        const unpublished = readPreview();
        // Reference: explicitly prohibit sampling in the actual Water shader on this camera.
        preview.shaderData.setFloat("camera_ScreenSpaceReflectionMaxRoughness", -1);
        const fallback = readPreview();
        const previewError = unpublished.reduce((sum, value, index) => sum + Math.abs(value - fallback[index]), 0);
        console.info(JSON.stringify({ family, previewError }));
        preview.entity.destroy();
        previewTarget.destroy();
        previewOutput.destroy();
        expect(previewError, `${family}: unpublished preview must match Environment fallback`).toBe(0);
        const autoSettings = { ...camera.screenSpaceReflection.metrics.transparentResolvedSettings };
        scene.screenSpaceReflection.activationMode = 1;
        renderPixels();
        expect(camera.screenSpaceReflection.metrics.transparentResolvedSettings).toEqual(autoSettings);
        scene.screenSpaceReflection.activationMode = 2;
        const off = renderPixels();
        // A changed fallback alone is not evidence of a reflected object. Require red chroma
        // that is absent with SSR off; the unchanged red cube itself cannot satisfy this.
        let reflectedPixels = 0;
        for (let i = 0; i < on.length; i += 4) {
          const redChroma = on[i] - on[i + 1];
          if (redChroma > 5 && redChroma - (off[i] - off[i + 1]) > 10) reflectedPixels++;
        }
        expect(reflectedPixels, `${family} must visibly reflect the red object`).toBeGreaterThan(0);
        expect(camera.screenSpaceReflection.metrics.activeConsumerLeaseCount).toBe(1);
        scene.screenSpaceReflection.activationMode = 0;
        scene.screenSpaceReflection.reflectionContent = 1;
        const renderers: MeshRenderer[] = [];
        waterRoot.getComponentsIncludeChildren(MeshRenderer, renderers);
        const waterMaterial = renderers[0].getMaterial()!;
        expect(SSR.supportsMaterialTransparentSampling(waterMaterial)).toBe(true);
        expect(SSR.supportsMaterialContribution(waterMaterial)).toBe(true);
        expect(waterMaterial._screenSpaceReflectionAuthorSettings).toBeNull();
        waterMaterial.contributeScreenSpaceReflection = true;
        for (let frame = 0; frame < 3; frame++) renderPixels();
        expect(camera.screenSpaceReflection.metrics.contributionColorDrawCount).toBeGreaterThan(0);
        expect(camera.screenSpaceReflection.metrics.contributionDepthDrawCount).toBeGreaterThan(0);
        expect(engine._hardwareRenderer.gl.getError()).toBe(0);
        await host.destroy();
        renderPixels();
        expect(camera.screenSpaceReflection.metrics.activeConsumerLeaseCount).toBe(0);
        expect(camera.screenSpaceReflection.metrics.requested).toBe(false);
      } finally {
        await host.destroy();
        scene.destroy();
        target.destroy();
        output.destroy();
        cubeMaterial.destroy();
      }
    }
  } finally {
    shaderProbe.mockRestore();
  }
  expect(targetProbes.size).toBeGreaterThanOrEqual(2);
  console.info(JSON.stringify({ waterGLSLES300: [...targetProbes] }));
});
