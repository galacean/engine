import { DepthTextureMode, Downsampling } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { SurfaceDepthWaterVolumeProvider } from "../../runtime/body/SurfaceDepthWaterVolumeProvider";
import { getWaterBodyCapabilities } from "../../runtime/body/WaterBodyCapabilities";
import { WaterBodyRuntimeAdapter } from "../../runtime/body/WaterBodyRuntime";
import { WaterWorld } from "../../runtime/body/WaterWorld";
import { resetWaterSurfaceSample, type WaterSurfaceProvider } from "../../runtime/query/WaterSurfaceProvider";
import { CameraWaterFeatureBroker, type WaterCameraFeatureTarget } from "../../runtime/optics/CameraWaterFeatureBroker";
import { UnderwaterController } from "../../runtime/optics/UnderwaterController";
import type {
  UnderwaterPostProcessMetrics,
  UnderwaterPostProcessTarget
} from "../../runtime/optics/UnderwaterPostProcessPass";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "../../runtime/optics/WaterOpticalProfile";

class FakeUnderwaterPass implements UnderwaterPostProcessTarget {
  isActive = false;
  readonly metrics: UnderwaterPostProcessMetrics = {
    executionCount: 0,
    opticalProfileBindCount: 0,
    resolvedOpticalProfileFingerprint: "",
    shaderBoundOpticalProfileFingerprint: ""
  };
  profile?: WaterOpticalProfile;

  setOpticalProfile(profile: WaterOpticalProfile): void {
    this.profile = profile;
  }
}

function createSurface(id: string, height: number, depth: number): WaterSurfaceProvider {
  return {
    sampleSurface(position, out): boolean {
      resetWaterSurfaceSample(out);
      out.waterBodyId = id;
      out.surfacePosition.set(position.x, height, position.z);
      out.waterDepth = depth;
      return true;
    }
  };
}

function createBody(
  id: string,
  height: number,
  depth: number,
  priority: number,
  opticalProfile = DEFAULT_WATER_OPTICAL_PROFILE
): WaterBodyRuntimeAdapter {
  const surface = createSurface(id, height, depth);
  return new WaterBodyRuntimeAdapter({
    id,
    type: "river",
    capabilities: getWaterBodyCapabilities("river"),
    surface,
    volume: new SurfaceDepthWaterVolumeProvider(surface),
    opticalProfile,
    bounds: { minX: -5, minZ: -5, maxX: 5, maxZ: 5 },
    priority,
    metrics: { meshUploadCount: 0, drawCount: 1, triangleCount: 2, resourceBytes: 0 }
  });
}

function createFixture(world: WaterWorld, cameraPosition: Vector3) {
  const camera: WaterCameraFeatureTarget = {
    depthTextureMode: DepthTextureMode.None,
    opaqueTextureEnabled: false,
    opaqueTextureDownsampling: Downsampling.TwoX,
    enablePostProcess: false
  };
  const cameraFeatures = new CameraWaterFeatureBroker(camera);
  const pass = new FakeUnderwaterPass();
  const controller = new UnderwaterController({
    world,
    getCameraPosition: () => cameraPosition,
    cameraFeatures,
    postProcess: pass,
    consumerId: "underwater-test"
  });
  return { camera, cameraFeatures, pass, controller };
}

describe("UnderwaterController", () => {
  it("uses separate enter and exit thresholds so a camera near the surface does not flicker", () => {
    const world = new WaterWorld({ now: () => 0 });
    world.register(createBody("pool", 0, 3, 10));
    const position = new Vector3(0, 0.02, 0);
    const { camera, cameraFeatures, pass, controller } = createFixture(world, position);

    expect(controller.update()).toBe(false);
    position.y = -0.04;
    expect(controller.update()).toBe(false);
    position.y = -0.1;
    expect(controller.update()).toBe(true);
    expect(controller.activeBodyId).toBe("pool");
    expect(pass.isActive).toBe(true);
    expect(camera.depthTextureMode).toBe(DepthTextureMode.PrePass);
    expect(camera.opaqueTextureEnabled).toBe(false);
    expect(camera.enablePostProcess).toBe(true);

    for (const height of [-0.02, 0.04, -0.01, 0.1]) {
      position.y = height;
      expect(controller.update()).toBe(true);
    }
    expect(controller.metrics.enterCount).toBe(1);
    expect(controller.metrics.exitCount).toBe(0);

    position.y = 0.13;
    expect(controller.update()).toBe(false);
    expect(pass.isActive).toBe(false);
    expect(camera.depthTextureMode).toBe(DepthTextureMode.None);
    expect(camera.enablePostProcess).toBe(false);
    expect(cameraFeatures.metrics.activeConsumerCount).toBe(0);
    expect(controller.metrics.exitCount).toBe(1);
  });

  it("switches to the deterministic higher-priority containing body", () => {
    const lowProfile: WaterOpticalProfile = {
      ...DEFAULT_WATER_OPTICAL_PROFILE,
      scatteringColor: [0.1, 0.2, 0.3]
    };
    const highProfile: WaterOpticalProfile = {
      ...DEFAULT_WATER_OPTICAL_PROFILE,
      scatteringColor: [0.3, 0.2, 0.1]
    };
    const world = new WaterWorld({ now: () => 0 });
    const low = createBody("low", 0, 4, 0, lowProfile);
    const high = createBody("high", 0.5, 4, 20, highProfile);
    high.enabled = false;
    world.register(low);
    world.register(high);
    const position = new Vector3(0, -0.5, 0);
    const { pass, controller } = createFixture(world, position);

    expect(controller.update()).toBe(true);
    expect(controller.activeBodyId).toBe("low");
    expect(controller.activeOpticalProfile).toBe(lowProfile);
    expect(pass.profile).toBe(lowProfile);
    high.enabled = true;
    expect(controller.update()).toBe(true);
    expect(controller.activeBodyId).toBe("high");
    expect(controller.activeOpticalProfile).toBe(highProfile);
    expect(pass.profile).toBe(highProfile);
    expect(controller.metrics.bodySwitchCount).toBe(1);
    expect(controller.metrics.enterCount).toBe(1);
  });

  it("exits below a finite bottom and releases its broker request on destroy", () => {
    const world = new WaterWorld({ now: () => 0 });
    world.register(createBody("finite", 0, 2, 0));
    const position = new Vector3(0, -0.5, 0);
    const { cameraFeatures, pass, controller } = createFixture(world, position);

    expect(controller.update()).toBe(true);
    position.y = -2.05;
    expect(controller.update()).toBe(false);
    expect(controller.metrics.exitCount).toBe(1);
    position.y = -0.5;
    expect(controller.update()).toBe(true);
    controller.destroy();
    expect(controller.isUnderwater).toBe(false);
    expect(controller.activeOpticalProfile).toBeUndefined();
    expect(pass.isActive).toBe(false);
    expect(cameraFeatures.metrics.activeConsumerCount).toBe(0);
    expect(controller.update()).toBe(false);
  });
});
