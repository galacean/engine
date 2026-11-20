import { readFileSync } from "node:fs";
import {
  type Camera,
  type Material,
  ScreenSpaceReflectionQuality,
  ScreenSpaceReflectionSettings,
  Shader,
  SSRRuntimeState
} from "@galacean/engine";
import { TERRAIN_SCREEN_SPACE_REFLECTION_SETTINGS } from "@galacean/engine-environment/terrain/lighting/TerrainScreenSpaceReflectionTuning";
import { createSurfaceMaterial } from "@galacean/engine-terrain/surface/SurfaceMaterial";
import {
  TERRAIN_SCREEN_SPACE_REFLECTION_CONFIGURATION,
  applyAutomaticScreenSpaceReflectionConfiguration,
  applyScreenSpaceReflectionConfiguration,
  inspectScreenSpaceReflectionPanelStatus
} from "@galacean/engine-terrain/terrain/debug/TerrainScreenSpaceReflectionPanel";
import { createWaterMaterialDefaults } from "@galacean/engine-water/water/native/WaterMaterialFile";
import {
  TERRAIN_DEFAULT_SURFACE_WATER_TUNING,
  WorldEnvironmentRuntime
} from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import { SeedWorldTerrainRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";
import { describe, expect, it, vi } from "vitest";

function createMaterial(intensity = 0): Material {
  return {
    screenSpaceReflectionIntensity: intensity
  } as Material;
}

function fixture(requiresRain = true) {
  const sceneSettings = new ScreenSpaceReflectionSettings();
  let cameraOverride: ScreenSpaceReflectionSettings | null = null;
  const diagnostics = {
    active: false,
    state: SSRRuntimeState.Skipped,
    traceWidth: 640,
    traceHeight: 360,
    estimatedBytes: 2_097_152,
    unsupportedReason: null as string | null,
    opaqueReceiverCount: 0,
    transparentReceiverCount: 1,
    useHardwareStencil: true,
    usesPackedDepthRG8: false,
    usesPackedNormalOct8: true
  };
  const camera = {
    scene: { screenSpaceReflection: sceneSettings },
    enableScreenSpaceReflection: true,
    get screenSpaceReflectionOverride() {
      return cameraOverride;
    },
    set screenSpaceReflectionOverride(value: ScreenSpaceReflectionSettings | null) {
      cameraOverride = value;
    },
    screenSpaceReflectionDiagnostics: diagnostics
  } as unknown as Camera;

  const weather = Object.assign(Object.create(WorldEnvironmentRuntime.prototype), {
    _camera: camera,
    _surface: { puddles: 0.4 },
    _surfaceWater: { ...TERRAIN_DEFAULT_SURFACE_WATER_TUNING, puddleStorageBias: 0.3 },
    _surfaceWaterSsrDemandState: {},
    _surfaceWaterSsrRequiresRain: requiresRain,
    _surfaceWaterSsrRequested: false
  }) as WorldEnvironmentRuntime;

  const near = createMaterial(0);
  const far = createMaterial(0);
  const clipmap = {
    material: near,
    get renderMaterials() {
      return [this.material, far];
    }
  };
  const terrain = Object.assign(Object.create(SeedWorldTerrainRuntime.prototype), {
    clipmap,
    _surfaceWaterSsrEnabled: false
  }) as SeedWorldTerrainRuntime;

  const updateRain = (rate: number) => {
    weather["_synchronizeSurfaceWaterScreenSpaceReflection"](rate);
    terrain.setSurfaceWaterSsrEnabled(weather.surfaceWaterSsrRequested);
  };

  return { sceneSettings, camera, diagnostics, clipmap, terrain, weather, updateRain };
}

describe("Seed World SSR v2 configuration, diagnostics, and terrain wetness gating", () => {
  it("applies the world SSR v2 preset to scene.screenSpaceReflection and supports isolated camera overrides", () => {
    const { sceneSettings, camera, diagnostics } = fixture();
    applyAutomaticScreenSpaceReflectionConfiguration(camera, TERRAIN_SCREEN_SPACE_REFLECTION_CONFIGURATION);
    expect(camera.enableScreenSpaceReflection).toBe(true);
    expect(camera.screenSpaceReflectionOverride).toBeNull();
    expect(sceneSettings).toMatchObject(TERRAIN_SCREEN_SPACE_REFLECTION_SETTINGS);

    applyScreenSpaceReflectionConfiguration(camera, {
      useCameraOverride: true,
      quality: "high",
      thickness: 0.45
    });
    expect(camera.screenSpaceReflectionOverride).not.toBeNull();
    expect(camera.screenSpaceReflectionOverride!.quality).toBe(ScreenSpaceReflectionQuality.High);
    expect(camera.screenSpaceReflectionOverride!.thickness).toBe(0.45);
    expect(sceneSettings.quality).toBe(ScreenSpaceReflectionQuality.Medium);
    expect(sceneSettings.thickness).toBe(TERRAIN_SCREEN_SPACE_REFLECTION_SETTINGS.thickness);

    diagnostics.active = true;
    diagnostics.state = SSRRuntimeState.ActiveSteady;
    const status = inspectScreenSpaceReflectionPanelStatus(camera);
    expect(status.configuration).toMatchObject({
      globalEnabled: true,
      cameraEnabled: true,
      useCameraOverride: true,
      quality: "high",
      thickness: 0.45
    });
    expect(status).toMatchObject({
      active: true,
      state: SSRRuntimeState.ActiveSteady,
      supported: true,
      traceWidth: 640,
      traceHeight: 360,
      estimatedBytes: 2_097_152,
      transparentReceiverCount: 1,
      useHardwareStencil: true,
      usesPackedDepthRG8: false,
      usesPackedNormalOct8: true
    });

    applyScreenSpaceReflectionConfiguration(camera, { useCameraOverride: false });
    expect(camera.screenSpaceReflectionOverride).toBeNull();
  });

  it("gates near terrain material.screenSpaceReflectionIntensity by rainfall and keeps far terrain at 0", () => {
    const { clipmap, updateRain, weather } = fixture();
    updateRain(0);
    expect(weather.surfaceWaterSsrRequested).toBe(false);
    expect(clipmap.material.screenSpaceReflectionIntensity).toBe(0);
    expect(clipmap.renderMaterials[1]!.screenSpaceReflectionIntensity).toBe(0);

    updateRain(0.3);
    expect(weather.surfaceWaterSsrRequested).toBe(true);
    expect(clipmap.material.screenSpaceReflectionIntensity).toBe(1);
    expect(clipmap.renderMaterials[1]!.screenSpaceReflectionIntensity).toBe(0);

    updateRain(0);
    expect(weather.surfaceWaterSsrRequested).toBe(false);
    expect(clipmap.material.screenSpaceReflectionIntensity).toBe(0);
  });

  it("reapplies intensity onto a replaced near material without rewriting stable materials", () => {
    const { clipmap, updateRain, terrain } = fixture();
    updateRain(0.3);
    expect(clipmap.material.screenSpaceReflectionIntensity).toBe(1);

    let writes = 0;
    const trackedMaterial = {
      _value: 0,
      get screenSpaceReflectionIntensity() {
        return this._value;
      },
      set screenSpaceReflectionIntensity(v: number) {
        writes++;
        this._value = v;
      }
    } as unknown as Material;

    clipmap.material = trackedMaterial;
    terrain.setSurfaceWaterSsrEnabled(true);
    expect(writes).toBe(1);
    expect(trackedMaterial.screenSpaceReflectionIntensity).toBe(1);

    terrain.setSurfaceWaterSsrEnabled(true);
    expect(writes).toBe(1);

    terrain.setSurfaceWaterSsrEnabled(false);
    expect(writes).toBe(2);
    expect(trackedMaterial.screenSpaceReflectionIntensity).toBe(0);
  });

  it("keeps retained-puddle demand when rain is not required", () => {
    const { clipmap, weather, updateRain } = fixture(false);
    updateRain(0);
    expect(weather.surfaceWaterSsrRequested).toBe(true);
    expect(clipmap.material.screenSpaceReflectionIntensity).toBe(1);
  });

  it("opts Water and Terrain/Surface materials out of Forward bilateral SSR sampling", () => {
    expect(createWaterMaterialDefaults("lake").screenSpaceReflectionBilateral).toBe(false);
    expect(createWaterMaterialDefaults("river").screenSpaceReflectionBilateral).toBe(false);
    const lakeMat = JSON.parse(
      readFileSync(
        new URL("../../../packages/water/src/water/native/assets/Water/Materials/lake.mat", import.meta.url),
        "utf8"
      )
    );
    const riverMat = JSON.parse(
      readFileSync(
        new URL("../../../packages/water/src/water/native/assets/Water/Materials/river.mat", import.meta.url),
        "utf8"
      )
    );
    expect(lakeMat.screenSpaceReflectionBilateral).toBe(false);
    expect(riverMat.screenSpaceReflectionBilateral).toBe(false);

    const mockShader = { name: "MockSurface", destroyed: false, _addReferCount() {} } as any;
    const mockEngine = { resourceManager: { _addReferResource() {} } } as any;
    const findSpy = vi.spyOn(Shader, "find").mockImplementation((name: string) =>
      name === "PBR" || name === "Terrain/Surface" ? mockShader : null!
    );
    try {
      const surfaceMat = createSurfaceMaterial(mockEngine);
      expect(surfaceMat.screenSpaceReflectionIntensity).toBe(0);
      expect(surfaceMat.screenSpaceReflectionBilateral).toBe(false);
    } finally {
      findSpy.mockRestore();
    }
  });
});
