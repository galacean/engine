import { ClearMode } from "@alipay/o3-base";
import { RenderPass, Camera } from "@alipay/o3-core";
import { LightFeature } from "@alipay/o3-lighting";

/**
 * RednerPass 对象
 * @private
 */
export class ShadowPass extends RenderPass {
  constructor(...args) {
    super(...args);
    this.clearMode = ClearMode.DONT_CLEAR;
  }

  /**
   * Pass 渲染前调用
   * @param {Camera} camera 相机
   * @param {RenderQueue} opaqueQueue 不透明物体渲染队列
   * @param {RenderQueue} transparentQueue 透明物体渲染队列
   */
  preRender(camera: Camera, opaqueQueue, transparentQueue) {
    this.enabled = false;
    const lightMgr = camera.scene.findFeature(LightFeature);
    if (lightMgr) {
      // keep render based on default render pass
      const pass = camera.renderPipeline.defaultRenderPass;
      this.renderTarget = pass.renderTarget;

      const lights = lightMgr.visibleLights;
      let shadowMapCount = 0;
      for (let i = 0, len = lights.length; i < len; i++) {
        const lgt: any = lights[i];
        if (lgt.enableShadow) {
          lgt.shadow.bindShadowValues(this.replaceMaterial, shadowMapCount, lgt);
          shadowMapCount++;
        }
      } // end of for

      if (shadowMapCount !== this.replaceMaterial.shadowMapCount) {
        this.replaceMaterial.shadowMapCount = shadowMapCount;
        this.replaceMaterial.clearTechniques();
      }

      if (shadowMapCount) this.enabled = true;
    }
  }
}
