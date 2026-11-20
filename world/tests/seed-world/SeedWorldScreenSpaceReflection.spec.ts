import {
  type Camera,
  type Material,
  RenderQueueType,
  ScreenSpaceReflection,
  ScreenSpaceReflectionQuality as Quality,
  ScreenSpaceReflectionReceiverMode as ReceiverMode,
  ScreenSpaceReflectionUpsamplingMode as UpsamplingMode,
  Shader,
  ShaderData,
  ShaderDataGroup
} from "@galacean/engine";
import {
  TERRAIN_MOBILE_WATER_SCREEN_SPACE_REFLECTION_CONFIGURATION,
  TERRAIN_SCREEN_SPACE_REFLECTION_CONFIGURATION,
  applyAutomaticScreenSpaceReflectionConfiguration,
  applyScreenSpaceReflectionConfiguration
} from "@galacean/engine-terrain/terrain/debug/TerrainScreenSpaceReflectionPanel";
import {
  CameraWaterFeatureBroker,
  type WaterCameraFeatureRequest
} from "@galacean/engine-water/water/runtime/optics/CameraWaterFeatureBroker";
import { TERRAIN_WATER_SSR_CAMERA_SETTINGS } from "@galacean/engine-world-planning/integrations/grasslands/GrasslandsWaterPcg";
import {
  TERRAIN_DEFAULT_SURFACE_WATER_TUNING,
  WorldEnvironmentRuntime
} from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import { SeedWorldTerrainRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  // The phase policy does not need the GPU's empty fallback texture.
  vi.spyOn(ScreenSpaceReflection.prototype, "_unpublish").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createMaterial(receiver: ReceiverMode = ReceiverMode.OpaqueComposite): Material {
  const material = {
    shader: Shader.find("PBR"),
    shaderData: new ShaderData(ShaderDataGroup.Material)
  } as Material;
  expect(ScreenSpaceReflection.setMaterialReceiver(material, receiver)).toBe(true);
  return material;
}

function fixture(requiresRain = true) {
  const camera = { shaderData: new ShaderData(ShaderDataGroup.Camera) } as Camera;
  const reflection = new ScreenSpaceReflection(camera);
  Object.defineProperty(camera, "screenSpaceReflection", { value: reflection });
  const weather = Object.assign(Object.create(WorldEnvironmentRuntime.prototype), {
    _camera: camera,
    _surface: { puddles: 0.4 },
    _surfaceWater: { ...TERRAIN_DEFAULT_SURFACE_WATER_TUNING, puddleStorageBias: 0.3 },
    _surfaceWaterSsrDemandState: {},
    _surfaceWaterSsrRequiresRain: requiresRain
  }) as WorldEnvironmentRuntime;
  const near = createMaterial();
  const far = createMaterial(ReceiverMode.Disabled);
  const clipmap = {
    material: near,
    get renderMaterials() {
      return [this.material, far];
    }
  };
  const terrain = Object.assign(Object.create(SeedWorldTerrainRuntime.prototype), {
    clipmap
  }) as SeedWorldTerrainRuntime;
  const updateRain = (rate: number) => {
    weather["_synchronizeSurfaceWaterScreenSpaceReflection"](rate);
    terrain.setSurfaceWaterSsrEnabled(weather.surfaceWaterSsrRequested);
  };
  return { camera, reflection, clipmap, terrain, weather, updateRain };
}

const waterRequest: WaterCameraFeatureRequest = {
  reflection: "ssr",
  quality: "high",
  depthTexture: false,
  opaqueTexture: false,
  caustics: false
};

it.each([
  ["low", Quality.Low, 0.25, 16, 2],
  ["medium", Quality.Medium, 0.5, 32, 3],
  ["high", Quality.High, 0.5, 64, 5]
] as const)(
  "forwards the %s water trace preset and keeps quality tiers active under Seed World startup config",
  (quality, expectedQuality, resolutionScale, maxRaySteps, hitRefinementSteps) => {
    const { camera, reflection } = fixture();
    applyAutomaticScreenSpaceReflectionConfiguration(camera, TERRAIN_SCREEN_SPACE_REFLECTION_CONFIGURATION);
    expect(reflection.getReceiverTraceSettingsOverride(ReceiverMode.TransparentSampleOnly)).toBeNull();

    const standaloneBroker = new CameraWaterFeatureBroker(camera);
    standaloneBroker.setRequest("lake", { ...waterRequest, quality });
    expect(reflection.metrics.transparentResolvedSettings).toMatchObject({
      quality: expectedQuality,
      resolutionScale,
      upsamplingMode: UpsamplingMode.Bilinear,
      thickness: 0.2
    });
    standaloneBroker.destroy();

    new CameraWaterFeatureBroker(camera).setRequest("lake", {
      ...waterRequest,
      quality,
      screenSpaceReflection: TERRAIN_WATER_SSR_CAMERA_SETTINGS
    });
    expect(reflection.metrics.transparentResolvedSettings).toMatchObject({
      quality: expectedQuality,
      resolutionScale,
      upsamplingMode: UpsamplingMode.Bilinear,
      maxRayDistance: 168,
      rayLengthFade: 16.8,
      maxRaySteps,
      hitRefinementSteps,
      thickness: 0.2,
      maxRoughness: 0.7,
      edgeFade: 0.02
    });

    applyScreenSpaceReflectionConfiguration(camera, { waterThickness: 0.45 });
    expect(reflection.metrics.transparentResolvedSettings).toMatchObject({
      thickness: 0.45,
      upsamplingMode: UpsamplingMode.Bilinear
    });
  }
);

it("applies mode-only water updates and rejects an invalid mode without replacing the request", () => {
  const { camera, reflection } = fixture();
  const broker = new CameraWaterFeatureBroker(camera);
  const request = { ...waterRequest, screenSpaceReflection: TERRAIN_WATER_SSR_CAMERA_SETTINGS };
  const setMode = (upsamplingMode: UpsamplingMode) =>
    broker.setRequest("lake", {
      ...request,
      screenSpaceReflection: { ...request.screenSpaceReflection, upsamplingMode }
    });
  broker.setRequest("lake", request);
  expect(request.screenSpaceReflection.upsamplingMode).toBe(UpsamplingMode.Bilinear);
  for (const mode of [UpsamplingMode.Bilateral, UpsamplingMode.GaussianBilateral, UpsamplingMode.Bilinear]) {
    setMode(mode);
    expect(reflection.metrics.transparentResolvedSettings.upsamplingMode).toBe(mode);
  }
  expect(() => setMode(-1 as UpsamplingMode)).toThrow(RangeError);
  expect(reflection.metrics.transparentResolvedSettings.upsamplingMode).toBe(UpsamplingMode.Bilinear);
  expect(reflection.metrics.activeConsumerLeaseCount).toBe(1);
});

it("uses the mode to break a tie between leases with the same label and priority", () => {
  const { camera, reflection } = fixture();
  const broker = new CameraWaterFeatureBroker(camera);
  broker.acquireRequest("lake", {
    ...waterRequest,
    screenSpaceReflection: { upsamplingMode: UpsamplingMode.Bilateral }
  });
  const bilinear = broker.acquireRequest("lake", waterRequest);
  expect(reflection.metrics.transparentResolvedSettings.upsamplingMode).toBe(UpsamplingMode.Bilinear);
  bilinear.destroy();
  expect(reflection.metrics.transparentResolvedSettings.upsamplingMode).toBe(UpsamplingMode.Bilateral);
});

it("keeps dry terrain out of SSR even with a water lease and retained puddles", () => {
  const { reflection, clipmap, updateRain } = fixture();
  const opaqueProp = createMaterial();
  updateRain(0);
  expect(reflection._beginFrame(true, null)).toBe(false);
  const water = reflection.acquireConsumer("water-pcg", { receiverMode: ReceiverMode.TransparentSampleOnly });
  expect(reflection._beginFrame(true, null)).toBe(true);
  expect(reflection._isMaterialReceiver(clipmap.material, RenderQueueType.Opaque)).toBe(false);
  expect(reflection._isMaterialReceiver(opaqueProp, RenderQueueType.Opaque)).toBe(true);
  expect(reflection.metrics.activeConsumerLeaseCount).toBe(1);
  water.release();
});

it("enables only near terrain in rain and releases its request when rain stops", () => {
  const { reflection, clipmap, updateRain, weather } = fixture();
  updateRain(0.3);
  expect(weather.surfaceWaterSsrRequested).toBe(true);
  expect(reflection._beginFrame(true, null)).toBe(true);
  expect(reflection._isMaterialReceiver(clipmap.material, RenderQueueType.Opaque)).toBe(true);
  expect(reflection._isMaterialReceiver(clipmap.renderMaterials[1]!, RenderQueueType.Opaque)).toBe(false);

  const water = reflection.acquireConsumer("water-pcg", { receiverMode: ReceiverMode.TransparentSampleOnly });
  updateRain(0);
  expect(weather.surfaceWaterSsrRequested).toBe(false);
  expect(reflection._isMaterialReceiver(clipmap.material, RenderQueueType.Opaque)).toBe(false);
  expect(reflection.metrics.activeConsumerLeaseCount).toBe(1);
  expect(water.active).toBe(true);
  water.release();
  expect(reflection._beginFrame(true, null)).toBe(false);
});

it("reapplies the current state to a replacement near material without rewriting stable materials", () => {
  const { clipmap, updateRain, terrain } = fixture();
  updateRain(0);
  const setter = vi.spyOn(ScreenSpaceReflection, "setMaterialReceiver");
  terrain.setSurfaceWaterSsrEnabled(false);
  expect(setter).not.toHaveBeenCalled();

  clipmap.material = createMaterial();
  setter.mockClear();
  terrain.setSurfaceWaterSsrEnabled(false);
  expect(setter).toHaveBeenCalledExactlyOnceWith(clipmap.material, ReceiverMode.Disabled);
  expect(ScreenSpaceReflection.getMaterialReceiverMode(clipmap.material)).toBe(ReceiverMode.Disabled);

  updateRain(0.3);
  clipmap.material = createMaterial(ReceiverMode.Disabled);
  setter.mockClear();
  terrain.setSurfaceWaterSsrEnabled(true);
  expect(setter).toHaveBeenCalledExactlyOnceWith(clipmap.material, ReceiverMode.OpaqueComposite);
  expect(ScreenSpaceReflection.getMaterialReceiverMode(clipmap.material)).toBe(ReceiverMode.OpaqueComposite);
});

it("keeps the existing retained-puddle demand when rain is not required", () => {
  const { weather, updateRain } = fixture(false);
  updateRain(0);
  expect(weather.surfaceWaterSsrRequested).toBe(true);
});

it("uses the downscaled terrain opaque SSR budget in rain without lowering water trace quality", () => {
  const { camera, reflection, updateRain } = fixture();
  applyAutomaticScreenSpaceReflectionConfiguration(camera, TERRAIN_SCREEN_SPACE_REFLECTION_CONFIGURATION);
  new CameraWaterFeatureBroker(camera).setRequest("lake", {
    ...waterRequest,
    quality: "high",
    screenSpaceReflection: TERRAIN_WATER_SSR_CAMERA_SETTINGS
  });
  updateRain(0.3);

  expect(reflection.metrics.opaqueResolvedSettings).toMatchObject({
    quality: Quality.Low,
    resolutionScale: 0.25,
    maxRayDistance: 168,
    rayLengthFade: 16.8,
    maxRaySteps: 24,
    hitRefinementSteps: 2,
    thickness: 0.2,
    maxRoughness: 0.7,
    edgeFade: 0.06
  });
  expect(reflection.metrics.transparentResolvedSettings).toMatchObject({
    quality: Quality.High,
    resolutionScale: 0.5,
    upsamplingMode: UpsamplingMode.Bilinear,
    maxRayDistance: 168,
    rayLengthFade: 16.8,
    maxRaySteps: 64,
    hitRefinementSteps: 5,
    thickness: 0.2,
    maxRoughness: 0.7,
    edgeFade: 0.02
  });

  applyScreenSpaceReflectionConfiguration(camera, {
    quality: "high",
    resolutionScale: 0.5,
    maxRaySteps: 64,
    hitRefinementSteps: 5
  });
  expect(reflection.metrics.opaqueResolvedSettings).toMatchObject({
    quality: Quality.High,
    resolutionScale: 0.5,
    maxRaySteps: 64,
    hitRefinementSteps: 5
  });
});

it("tightens mobile water SSR budget without affecting desktop defaults or water lease lifetime", () => {
  const { camera, reflection, updateRain } = fixture();
  applyAutomaticScreenSpaceReflectionConfiguration(camera, TERRAIN_SCREEN_SPACE_REFLECTION_CONFIGURATION);
  applyScreenSpaceReflectionConfiguration(camera, TERRAIN_MOBILE_WATER_SCREEN_SPACE_REFLECTION_CONFIGURATION);

  new CameraWaterFeatureBroker(camera).setRequest("lake", {
    ...waterRequest,
    quality: "high",
    screenSpaceReflection: TERRAIN_WATER_SSR_CAMERA_SETTINGS
  });
  updateRain(0.3);

  expect(reflection.metrics.activationMode).toBe(0);
  expect(reflection.metrics.opaqueResolvedSettings).toMatchObject({
    quality: Quality.Low,
    resolutionScale: 0.25,
    maxRaySteps: 24,
    hitRefinementSteps: 2
  });
  expect(reflection.metrics.transparentResolvedSettings).toMatchObject({
    quality: Quality.Low,
    resolutionScale: 0.25,
    upsamplingMode: UpsamplingMode.Bilinear,
    maxRayDistance: 168,
    rayLengthFade: 16.8,
    maxRaySteps: 24,
    hitRefinementSteps: 2,
    thickness: 0.2,
    maxRoughness: 0.7,
    edgeFade: 0.02
  });
});
