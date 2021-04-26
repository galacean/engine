import { Camera, CameraClearFlags } from "../Camera";
import { LightFeature } from "../lighting/LightFeature";
import { RenderPass } from "../RenderPipeline/RenderPass";
import { RenderQueue } from "../RenderPipeline/RenderQueue";
import { LightShadow } from "./LightShadow";

/**
 * RenderPass for rendering shadow.
 */
export class ShadowPass extends RenderPass {
  constructor(...args) {
    super(...args);
    this.clearFlags = CameraClearFlags.None;
  }

  /**
   * @override
   */
  preRender(camera: Camera, queue: RenderQueue) {
    this.enabled = false;
    const lightMgr = camera.scene.findFeature(LightFeature);
    const lights = lightMgr.visibleLights;
    const shaderData = this.replaceMaterial.shaderData;

    // keep render based on default render pass
    const pass = camera._renderPipeline.defaultRenderPass;
    this.renderTarget = pass.renderTarget;

    let shadowMapCount = 0;

    LightShadow.clearMap();
    for (let i = 0, len = lights.length; i < len; i++) {
      const lgt: any = lights[i];
      if (lgt.enableShadow) {
        lgt.shadow.appendData(shadowMapCount++);
      }
    }

    if (shadowMapCount) {
      this.enabled = true;
      LightShadow._updateShaderData(shaderData);
      shaderData.enableMacro("O3_SHADOW_MAP_COUNT", shadowMapCount.toString());
    } else {
      shaderData.disableMacro("O3_SHADOW_MAP_COUNT");
    }
  }
}
