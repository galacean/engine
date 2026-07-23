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
    expect(broker.metrics.activeConsumerIds).toEqual(["heightfield", "river"]);
    expect(broker.metrics.depthCopyPassCount).toBe(1);
    expect(broker.metrics.colorCopyPassCount).toBe(1);
    expect(broker.metrics.incrementalDepthCopyPassCount).toBe(1);
    expect(broker.metrics.incrementalColorCopyPassCount).toBe(1);
    expect(broker.metrics.totalDepthCopyPassCount).toBe(1);
    expect(broker.metrics.totalColorCopyPassCount).toBe(1);
    expect(broker.metrics.estimatedRenderTargetBytes).toBe(100 * 60 * 8);
    expect(broker.metrics.incrementalEstimatedRenderTargetBytes).toBe(100 * 60 * 8);
    expect(broker.metrics.totalEstimatedRenderTargetBytes).toBe(100 * 60 * 8);

    broker.removeRequest("river");
    expect(broker.metrics.activeConsumerIds).toEqual(["heightfield"]);
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
    expect(broker.metrics.incrementalDepthCopyPassCount).toBe(0);
    expect(broker.metrics.incrementalColorCopyPassCount).toBe(0);
    expect(broker.metrics.totalDepthCopyPassCount).toBe(1);
    expect(broker.metrics.totalColorCopyPassCount).toBe(1);
    expect(broker.metrics.incrementalEstimatedRenderTargetBytes).toBe(0);
    broker.destroy();
    expect(broker.metrics.activeConsumerCount).toBe(0);
    expect(broker.metrics.activeConsumerIds).toEqual([]);
  });

  it("owns depth and post-process state for underwater without requesting an opaque copy", () => {
    const camera: WaterCameraFeatureTarget = {
      depthTextureMode: DepthTextureMode.None,
      opaqueTextureEnabled: false,
      opaqueTextureDownsampling: Downsampling.TwoX,
      enablePostProcess: false
    };
    const broker = new CameraWaterFeatureBroker(camera);
    broker.setRequest("underwater", {
      depthTexture: false,
      opaqueTexture: false,
      reflection: "none",
      caustics: false,
      underwater: true,
      quality: "medium"
    });

    expect(camera.depthTextureMode).toBe(DepthTextureMode.PrePass);
    expect(camera.opaqueTextureEnabled).toBe(false);
    expect(camera.enablePostProcess).toBe(true);
    expect(broker.metrics.underwaterRequested).toBe(true);
    expect(broker.metrics.postProcessEnabled).toBe(true);
    expect(broker.metrics.depthCopyPassCount).toBe(1);
    expect(broker.metrics.colorCopyPassCount).toBe(0);

    broker.removeRequest("underwater");
    expect(camera.depthTextureMode).toBe(DepthTextureMode.None);
    expect(camera.enablePostProcess).toBe(false);
    expect(broker.metrics.underwaterRequested).toBe(false);
  });

  it("rejects underwater ownership when a legacy target cannot toggle post-process", () => {
    const broker = new CameraWaterFeatureBroker({
      depthTextureMode: DepthTextureMode.None,
      opaqueTextureEnabled: false,
      opaqueTextureDownsampling: Downsampling.TwoX
    });

    expect(() =>
      broker.setRequest("underwater", {
        depthTexture: true,
        opaqueTexture: false,
        reflection: "none",
        caustics: false,
        underwater: true,
        quality: "medium"
      })
    ).toThrow("enablePostProcess");
    expect(broker.metrics.activeConsumerCount).toBe(0);
  });
});
