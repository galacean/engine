import { MaskList } from "@alipay/o3-base";
import { SceneFeature, NodeAbility } from "@alipay/o3-core";
import { LightFeature } from "@alipay/o3-lighting";
import { ShadowMapMaterial } from "./ShadowMapMaterial";
import { ShadowMaterial } from "./ShadowMaterial";
import { ShadowPass } from "./ShadowPass";
import { ShadowMapPass } from "./ShadowMapPass";
import { RenderQueue } from "@alipay/o3-renderer-basic";

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
   * @param {ACamera} camera
   */
  preRender(scene, camera) {
    const lightMgr = camera.scene.findFeature(LightFeature);
    if (lightMgr && lightMgr.visibleLights.length > 0) {
      // 检查添加绘制 Shadow 的 RenderPass
      if (!this._shadowPass) {
        this.addShadowPass(camera);
      }

      // 检查添加绘制 Shadow Map 的 RenderPass
      const lights = lightMgr.visibleLights;
      for (let i = 0, len = lights.length; i < len; i++) {
        const lgt = lights[i];
        if (lgt.enableShadow && !lgt.shadowMapPass) {
          lgt.shadowMapPass = this.addShadowMapPass(camera, lgt);
        } else if (!lgt.enableShadow && lgt.shadowMapPass) {
          const renderer = camera.sceneRenderer;
          renderer.removeRenderPass(lgt.shadowMapPass);
          lgt.shadowMapPass = null;
        }
      } // end of for

      this.updatePassRenderFlag(camera.sceneRenderer.opaqueQueue);
      this.updatePassRenderFlag(camera.sceneRenderer.transparentQueue);
    } // end of if
  }

  /**
   * 添加渲染阴影的 RendererPass
   * @param {ACamera} camera
   */
  addShadowPass(camera) {
    const shadowMaterial = new ShadowMaterial("shadowMaterial");
    this._shadowPass = new ShadowPass("ShadowPass", 1, null, shadowMaterial, MaskList.SHADOW);
    const renderer = camera.sceneRenderer;
    renderer.addRenderPass(this._shadowPass);
  }

  /**
   * 添加渲染 shadow map 的 RendererPass
   * @param {ACamera} camera
   * @param {ALight} light
   */
  addShadowMapPass(camera, light) {
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
    const renderer = camera.sceneRenderer;
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
      const ability: NodeAbility = item.nodeAbility;

      if ((ability as any).recieveShadow) {
        ability.addPassMasks(MaskList.SHADOW);
      } else {
        ability.removePassMasks(MaskList.SHADOW);
      }

      if ((ability as any).castShadow) {
        ability.addPassMasks(MaskList.SHADOW_MAP);
      } else {
        ability.removePassMasks(MaskList.SHADOW_MAP);
      }
    }
  }
}
