import { Camera, DepthTextureMode, TextureFormat } from "../../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../../helpers/createEngine";

it.each([true, false])(
  "configures the depth pass with depth texture extension enabled=%s",
  async (withDepthTexture) => {
    const { engine } = await createEngine(withDepthTexture ? [] : ["WEBGL_depth_texture"]);

    try {
      const scene = engine.sceneManager.activeScene!;
      const camera = scene.createRootEntity().addComponent(Camera);
      const depthPass = camera._renderPipeline["_depthOnlyPass"];
      camera.depthTextureMode = DepthTextureMode.PrePass;
      camera.render();

      if (withDepthTexture) {
        expect(depthPass?.renderTarget?.depthTexture?.format).toBe(TextureFormat.Depth24Stencil8);
      } else {
        expect(depthPass).toBeNull();
        camera.depthTextureMode = DepthTextureMode.None;
        scene.ambientOcclusion.enabled = true;
        camera.render();
        expect(camera._renderPipeline["_saoPass"]).toBeNull();
      }
    } finally {
      engine.destroy();
    }
  }
);
