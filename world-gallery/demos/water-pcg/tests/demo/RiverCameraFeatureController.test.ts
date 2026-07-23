import { DepthTextureMode, Downsampling } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import { RiverCameraFeatureController, type RiverCameraFeatureTarget } from "../../demo/RiverCameraFeatureController";

describe("RiverCameraFeatureController", () => {
  it("uses TwoX opaque color for Medium and full resolution only for High", () => {
    const camera: RiverCameraFeatureTarget = {
      depthTextureMode: DepthTextureMode.None,
      opaqueTextureEnabled: false,
      opaqueTextureDownsampling: Downsampling.TwoX
    };
    const controller = new RiverCameraFeatureController(camera);

    controller.apply(true, RiverQualityLevel.Low);
    expect(camera.depthTextureMode).toBe(DepthTextureMode.None);
    expect(controller.depthTextureRequested).toBe(false);
    expect(camera.opaqueTextureEnabled).toBe(false);
    expect(controller.opaqueTextureRequested).toBe(false);

    controller.apply(true, RiverQualityLevel.Medium);
    expect(camera.depthTextureMode).toBe(DepthTextureMode.PrePass);
    expect(controller.depthTextureRequested).toBe(true);
    expect(camera.opaqueTextureEnabled).toBe(true);
    expect(camera.opaqueTextureDownsampling).toBe(Downsampling.TwoX);
    expect(controller.opaqueTextureRequested).toBe(true);

    controller.apply(true, RiverQualityLevel.High);
    expect(camera.opaqueTextureDownsampling).toBe(Downsampling.None);
    expect(controller.opaqueTextureRequested).toBe(true);

    controller.apply(false, RiverQualityLevel.High);
    expect(camera.depthTextureMode).toBe(DepthTextureMode.None);
    expect(controller.depthTextureRequested).toBe(false);
    expect(camera.opaqueTextureEnabled).toBe(false);
    expect(camera.opaqueTextureDownsampling).toBe(Downsampling.TwoX);
  });

  it("restores pre-existing camera screen-texture settings", () => {
    const camera: RiverCameraFeatureTarget = {
      depthTextureMode: DepthTextureMode.PrePass,
      opaqueTextureEnabled: true,
      opaqueTextureDownsampling: Downsampling.FourX
    };
    const controller = new RiverCameraFeatureController(camera);

    controller.apply(true, RiverQualityLevel.Low);
    expect(camera.depthTextureMode).toBe(DepthTextureMode.PrePass);

    controller.apply(true, RiverQualityLevel.Medium);
    controller.destroy();
    expect(camera.depthTextureMode).toBe(DepthTextureMode.PrePass);
    expect(camera.opaqueTextureEnabled).toBe(true);
    expect(camera.opaqueTextureDownsampling).toBe(Downsampling.FourX);
    expect(controller.depthTextureRequested).toBe(false);
    expect(controller.opaqueTextureRequested).toBe(false);
  });
});
