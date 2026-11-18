import {
  type Camera,
  type Material,
  RenderQueueType,
  ScreenSpaceReflection,
  ScreenSpaceReflectionReceiverMode as ReceiverMode,
  ScreenSpaceReflectionUpsamplingMode as UpsamplingMode,
  Shader,
  ShaderData,
  ShaderDataGroup
} from "@galacean/engine";
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
  ["low", 0.25],
  ["medium", 0.5],
  ["high", 0.5]
] as const)("forwards the %s water trace preset to the transparent phase", (quality, resolutionScale) => {
  const { camera, reflection } = fixture();
  new CameraWaterFeatureBroker(camera).setRequest("lake", { ...waterRequest, quality });
  expect(reflection.metrics.transparentResolvedSettings).toMatchObject({
    resolutionScale,
    upsamplingMode: UpsamplingMode.Bilinear
  });
});

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
