import { Camera, Logger, TextureFormat } from "../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { createEngine } from "../../helpers/createEngine";

it("keeps HDR disabled without half-float textures", async () => {
  const { engine } = await createEngine(["OES_texture_half_float"]);
  try {
    const camera = engine.sceneManager.activeScene!.createRootEntity().addComponent(Camera);
    camera.enableHDR = true;
    expect(camera.enableHDR).toBe(false);
  } finally {
    engine.destroy();
  }
});

it("uses RGBA16F for HDR and clamps the requested mip level", async () => {
  const { engine } = await createEngine();
  try {
    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity();
    cameraEntity.transform.setPosition(0, 0, 5);
    const camera = cameraEntity.addComponent(Camera);
    camera.enablePostProcess = false;
    expect(camera._getInternalColorTextureFormat()).toBe(TextureFormat.R8G8B8A8);
    camera.enableHDR = true;
    expect(camera.enableHDR).toBe(true);
    expect(camera._getInternalColorTextureFormat()).toBe(TextureFormat.R16G16B16A16);
    camera.enableHDR = false;
    const error = vi.spyOn(Logger, "error");
    try {
      const renderPipeline = vi.spyOn(camera._renderPipeline, "render");
      camera.render(undefined, 1);
      expect(renderPipeline.mock.calls[0][2]).toBe(0);
      expect(error).toHaveBeenCalledWith("mipLevel only take effect in WebGL2.0");
    } finally {
      error.mockRestore();
    }
  } finally {
    engine.destroy();
  }
});
