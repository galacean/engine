import { describe, expect, it } from "vitest";
import { Camera, Color, Vector3 } from "@galacean/engine";
import { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";

describe("TerrainPostProcessRuntime SunLensFlare integration", () => {
  it("keeps shader warmup state stable at midnight and restores debug snapshot", () => {
    const postProcessStub = {
      isGlobal: false,
      enabled: true,
      addEffect<T>(EffectCtor: new () => T): T {
        return new EffectCtor();
      },
      destroy() {}
    };
    const sceneStub = {};
    const cameraStub = Object.create(Camera.prototype) as Camera;
    Object.defineProperty(cameraStub, "scene", { value: sceneStub });
    const runtime = Object.create(TerrainPostProcessRuntime.prototype) as TerrainPostProcessRuntime;
    Object.assign(runtime as any, {
      _config: null,
      _postProcess: null,
      _colorAdjustments: null,
      _tonemapping: null,
      _bloom: null,
      _sunLensFlare: null,
      _profileEnabled: true,
      _colorAdjustmentsEnabled: true,
      _tonemappingEnabled: true,
      _tonemappingMode: 1,
      _bloomEnabled: true,
      _bloomTint: new Color(1, 1, 1, 1),
      _sunLensFlareEnabled: true,
      _sunLensFlareDepthOcclusion: true,
      _sunLensFlareTemporalSmoothing: 0.08,
      _sunLensFlareIntensity: 0.85,
      _sunLensFlareGlareIntensity: 0.75,
      _sunLensFlareGhostIntensity: 1.2,
      _sunLensFlareGhostSpread: 1,
      _sunLensFlareGhostChromaticity: 0.8,
      _sunLensFlareTint: new Color(1, 0.94, 0.84, 1),
      _sunLensFlareSolarDirection: new Vector3(0, 0, 0),
      _sunLensFlareSolarAttenuation: 1,
      _sunLensFlareSolarColor: new Color(1, 1, 1, 1),
      _manualOverrides: {}
    });
    Object.defineProperty(runtime, "scene", { value: sceneStub });
    Object.defineProperty(runtime, "entity", { value: { addComponent: () => postProcessStub } });

    runtime.initialize({
      camera: cameraStub,
      postExposure: 0.4,
      temperature: 10,
      tint: 0,
      contrast: 7,
      saturation: 18,
      bloomThreshold: 0.7,
      bloomIntensity: 1,
      bloomScatter: 0.3
    });
    runtime.onStart();

    // Midnight solar attenuation = 0 must still keep shader warmup variant active
    runtime.setSunLensFlareSolarState(new Vector3(0, 1, 0), 0, 1, 0.8, 0.6);
    expect(runtime.getShaderWarmupState()?.sunLensFlare).toBe(true);

    const reset = runtime.captureDebugReset();
    runtime.setSunLensFlareIntensity(2.2);
    runtime.setSunLensFlareGhostIntensity(0.4);
    runtime.setSunLensFlareDepthOcclusion(false);
    expect(runtime.getDebugSnapshot().sunLensFlare.intensity).toBe(2.2);
    expect(runtime.getDebugSnapshot().sunLensFlare.depthOcclusion).toBe(false);

    reset();
    expect(runtime.getDebugSnapshot().sunLensFlare.intensity).toBe(0.85);
    expect(runtime.getDebugSnapshot().sunLensFlare.ghostIntensity).toBe(1.2);
    expect(runtime.getDebugSnapshot().sunLensFlare.depthOcclusion).toBe(true);
  });
});
