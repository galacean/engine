import { MaskList } from "@alipay/o3-core";
import { Camera, Component, RenderQueue, SceneFeature } from "@alipay/o3-core";
import { LightFeature } from "@alipay/o3-lighting";
import { ShadowMapMaterial } from "./ShadowMapMaterial";
import { ShadowMapPass } from "./ShadowMapPass";
import { ShadowMaterial } from "./ShadowMaterial";
import { ShadowPass } from "./ShadowPass";

/**
 * Shadow Feature：场景中 Shadow 特性
 * @extends SceneFeature
 * @private
 */
export class ShadowFeature extends SceneFeature {
  private _shadowPass;
  private _shadowMapMaterial: ShadowMapMaterial;
  /**
   * 场景渲染前的回调, 在此环节生成 Shadow Map
   * @param {Scene} scene
   * @param {Camera} camera
   */
  preRender(scene, camera: Camera) {
    const lightMgr = camera.scene.findFeature(LightFeature);
    if (lightMgr && lightMgr.visibleLights.length > 0) {
      // 检查添加绘制 Shadow 的 RenderPass
      if (!this._shadowPass) {
        this.addShadowPass(camera);
      }

      // 检查添加绘制 Shadow Map 的 RenderPass
      const lights = lightMgr.visibleLights;
      for (let i = 0, len = lights.length; i < len; i++) {
        const lgt: any = lights[i];
        if (lgt.enableShadow && !lgt.shadowMapPass) {
          lgt.shadowMapPass = this.addShadowMapPass(camera, lgt);
        } else if (!lgt.enableShadow && lgt.shadowMapPass) {
          const renderer = camera._renderPipeline;
          renderer.removeRenderPass(lgt.shadowMapPass);
          lgt.shadowMapPass = null;
        }
      } // end of for

      this.updatePassRenderFlag(camera._renderPipeline.opaqueQueue);
      this.updatePassRenderFlag(camera._renderPipeline.transparentQueue);
    } // end of if
  }

  /**
   * 添加渲染阴影的 RendererPass
   * @param {Camera} camera
   */
  addShadowPass(camera: Camera) {
    const shadowMaterial = new ShadowMaterial("shadowMaterial");
    this._shadowPass = new ShadowPass("ShadowPass", 1, null, shadowMaterial, MaskList.SHADOW);
    const renderer = camera._renderPipeline;
    renderer.addRenderPass(this._shadowPass);
  }

  /**
   * 添加渲染 shadow map 的 RendererPass
   * @param {Camera} camera
   * @param {ALight} light
   */
  addShadowMapPass(camera: Camera, light) {
    // 共用 shadow map 材质
    this._shadowMapMaterial = this._shadowMapMaterial || new ShadowMapMaterial("shadowMapMaterial");

    const shadowMapPass = new ShadowMapPass(
      "ShadowMapPass",
      -1,
      light.shadow.renderTarget,
      this._shadowMapMaterial,
      MaskList.SHADOW_MAP,
      light
    );
    const renderer = camera._renderPipeline;
    renderer.addRenderPass(shadowMapPass);

    return shadowMapPass;
  }

  /**
   * 用于更新场景中物体的 renderPassFlag 状态
   * @param {RenderQueue} renderQueue
   */
  updatePassRenderFlag(renderQueue: RenderQueue) {
    const items = renderQueue.items;
    for (let i = 0, len = items.length; i < len; i++) {
      const item = items[i];
      const ability: Component = item.component;

      const recieveShadow = (ability as any).recieveShadow;
      const castShadow = (ability as any).castShadow;
      if (recieveShadow === true) {
        ability.addPassMasks(MaskList.SHADOW);
      } else if (recieveShadow === false) {
        ability.removePassMasks(MaskList.SHADOW);
      }

      if (castShadow === true) {
        ability.addPassMasks(MaskList.SHADOW_MAP);
      } else if (castShadow === false) {
        ability.removePassMasks(MaskList.SHADOW_MAP);
      }
    }
  }
}
