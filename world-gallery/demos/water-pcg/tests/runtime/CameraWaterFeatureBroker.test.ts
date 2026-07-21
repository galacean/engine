import { DepthTextureMode, Downsampling } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";
import { CameraWaterFeatureBroker, type WaterCameraFeatureTarget } from "../../runtime/optics/CameraWaterFeatureBroker";

function request(quality: "low" | "medium" | "high", opaqueDownsampling?: Downsampling) {
  return {
    depthTexture: true,
    opaqueTexture: true,
    reflection: "none" as const,
    caustics: false,
    underwater: false,
    quality,
    opaqueDownsampling
  };
}

describe("CameraWaterFeatureBroker", () => {
  it("merges consumers once, chooses the highest requested resolution, and reports cost", () => {
    const camera: WaterCameraFeatureTarget = {
      depthTextureMode: DepthTextureMode.None,
      opaqueTextureEnabled: false,
      opaqueTextureDownsampling: Downsampling.FourX
    };
    const broker = new CameraWaterFeatureBroker(camera);
    broker.setViewportSize(100, 60);
    broker.setRequest("heightfield", request("medium", Downsampling.TwoX));
    broker.setRequest("river", request("high", Downsampling.None));

    expect(camera.depthTextureMode).toBe(DepthTextureMode.PrePass);
    expect(camera.opaqueTextureEnabled).toBe(true);
    expect(camera.opaqueTextureDownsampling).toBe(Downsampling.None);
    expect(broker.metrics.activeConsumerCount).toBe(2);
    expect(broker.metrics.depthCopyPassCount).toBe(1);
    expect(broker.metrics.colorCopyPassCount).toBe(1);
    expect(broker.metrics.estimatedRenderTargetBytes).toBe(100 * 60 * 8);

    broker.removeRequest("river");
    expect(camera.opaqueTextureDownsampling).toBe(Downsampling.TwoX);
    expect(broker.metrics.estimatedRenderTargetBytes).toBe(100 * 60 * 4 + 50 * 30 * 4);
  });

  it("restores the original camera state after the final consumer and destroy", () => {
    const camera: WaterCameraFeatureTarget = {
      depthTextureMode: DepthTextureMode.PrePass,
      opaqueTextureEnabled: true,
      opaqueTextureDownsampling: Downsampling.FourX
    };
    const broker = new CameraWaterFeatureBroker(camera);
    broker.setRequest("river", request("high", Downsampling.None));
    broker.removeRequest("river");
    expect(camera.depthTextureMode).toBe(DepthTextureMode.PrePass);
    expect(camera.opaqueTextureEnabled).toBe(true);
    expect(camera.opaqueTextureDownsampling).toBe(Downsampling.FourX);
    broker.destroy();
    expect(broker.metrics.activeConsumerCount).toBe(0);
  });
});
