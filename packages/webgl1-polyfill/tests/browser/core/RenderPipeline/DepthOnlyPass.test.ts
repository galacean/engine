import { Camera, DepthOnlyPass, TextureFormat } from "../../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../../helpers/createEngine";

it.each([true, false])(
  "configures the depth pass with depth texture extension enabled=%s",
  async (withDepthTexture) => {
    const { engine } = await createEngine(withDepthTexture ? [] : ["WEBGL_depth_texture"]);

    try {
      const camera = engine.sceneManager.activeScene!.createRootEntity().addComponent(Camera);
      const depthPass = new DepthOnlyPass(engine);
      expect(depthPass.supportDepthTexture).toBe(withDepthTexture);

      if (withDepthTexture) {
        depthPass.onConfig(camera);
        expect(depthPass.renderTarget?.depthTexture?.format).toBe(TextureFormat.Depth24Stencil8);
        depthPass.renderTarget?.destroy();
      }
    } finally {
      engine.destroy();
    }
  }
);
