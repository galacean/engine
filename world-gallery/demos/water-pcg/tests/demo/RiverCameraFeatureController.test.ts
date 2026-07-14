import { DepthTextureMode } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import { RiverCameraFeatureController, type RiverCameraFeatureTarget } from "../../demo/RiverCameraFeatureController";

describe("RiverCameraFeatureController", () => {
  it("enables depth only for a visible Medium or High river", () => {
    const camera: RiverCameraFeatureTarget = { depthTextureMode: DepthTextureMode.None };
    const controller = new RiverCameraFeatureController(camera);

    controller.apply(true, RiverQualityLevel.Low);
    expect(camera.depthTextureMode).toBe(DepthTextureMode.None);
    expect(controller.depthTextureRequested).toBe(false);

    controller.apply(true, RiverQualityLevel.Medium);
    expect(camera.depthTextureMode).toBe(DepthTextureMode.PrePass);
    expect(controller.depthTextureRequested).toBe(true);

    controller.apply(false, RiverQualityLevel.High);
    expect(camera.depthTextureMode).toBe(DepthTextureMode.None);
    expect(controller.depthTextureRequested).toBe(false);
  });

  it("restores a pre-existing camera depth mode", () => {
    const camera: RiverCameraFeatureTarget = { depthTextureMode: DepthTextureMode.PrePass };
    const controller = new RiverCameraFeatureController(camera);

    controller.apply(true, RiverQualityLevel.Low);
    expect(camera.depthTextureMode).toBe(DepthTextureMode.PrePass);

    controller.apply(true, RiverQualityLevel.Medium);
    controller.destroy();
    expect(camera.depthTextureMode).toBe(DepthTextureMode.PrePass);
    expect(controller.depthTextureRequested).toBe(false);
  });
});
