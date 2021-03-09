import { Camera } from "../Camera";
import { Component } from "../Component";
import { Layer } from "../Layer";
import { LightFeature } from "../lighting/LightFeature";
import { RenderQueue } from "../RenderPipeline/RenderQueue";
import { Scene } from "../Scene";
import { SceneFeature } from "../SceneFeature";
import { ShadowMapMaterial } from "./ShadowMapMaterial";
import { ShadowMapPass } from "./ShadowMapPass";
import { ShadowMaterial } from "./ShadowMaterial";
import { ShadowPass } from "./ShadowPass";

/**
 * Shadow plug-in.
 */
export class ShadowFeature extends SceneFeature {
  private _shadowPass: ShadowPass;
  private _shadowMapMaterial: ShadowMapMaterial;

  /**
   * @override
   */
  preRender(scene: Scene, camera: Camera) {
    const lights = scene.findFeature(LightFeature).visibleLights;

    if (lights.length > 0) {
      // Check RenderPass for rendering shadows.
      if (!this._shadowPass) {
        this.addShadowPass(camera);
      }

      // Check RenderPass for rendering shadow map.
      const renderPipeline = camera._renderPipeline;

      for (let i = 0, len = lights.length; i < len; i++) {
        const lgt: any = lights[i];
        if (lgt.enableShadow && !lgt.shadowMapPass) {
          lgt.shadowMapPass = this.addShadowMapPass(camera, lgt);
        } else if (!lgt.enableShadow && lgt.shadowMapPass) {
          renderPipeline.removeRenderPass(lgt.shadowMapPass);
          lgt.shadowMapPass = null;
        }
      }

      this.updatePassRenderFlag(renderPipeline.opaqueQueue);
      this.updatePassRenderFlag(renderPipeline.transparentQueue);
    }
  }

  /**
   * Add RenderPass for rendering shadows.
   * @param camera - The camera for rendering
   */
  addShadowPass(camera: Camera) {
    const shadowMaterial = new ShadowMaterial(camera.engine);
    this._shadowPass = new ShadowPass("ShadowPass", 1, null, shadowMaterial, Layer.Layer30); // SHADOW
    const renderer = camera._renderPipeline;
    renderer.addRenderPass(this._shadowPass);
  }

  /**
   * Add RenderPass for rendering shadow map.
   * @param camera - The camera for rendering
   * @param light - The light that the shadow belongs to
   */
  addShadowMapPass(camera: Camera, light) {
    // Share shadow map material.
    this._shadowMapMaterial = this._shadowMapMaterial || new ShadowMapMaterial(camera.engine);

    const shadowMapPass = new ShadowMapPass(
      "ShadowMapPass",
      -1,
      light.shadow.renderTarget,
      this._shadowMapMaterial,
      Layer.Layer31, // SHADOW_MAP
      light
    );
    const renderer = camera._renderPipeline;
    renderer.addRenderPass(shadowMapPass);

    return shadowMapPass;
  }

  /**
   * Update the renderPassFlag state of renderers in the scene.
   * @param renderQueue - Render queue
   */
  updatePassRenderFlag(renderQueue: RenderQueue) {
    const items = renderQueue.items;
    for (let i = 0, len = items.length; i < len; i++) {
      const item = items[i];
      const ability: Component = item.component;

      const recieveShadow = (ability as any).recieveShadow;
      const castShadow = (ability as any).castShadow;
      if (recieveShadow === true) {
        ability.entity.layer |= Layer.Layer30; //SHADOW;
      } else if (recieveShadow === false) {
        ability.entity.layer &= ~Layer.Layer30; //SHADOW;
      }

      if (castShadow === true) {
        ability.entity.layer |= Layer.Layer31; //SHADOW_MAP;
      } else if (castShadow === false) {
        ability.entity.layer &= ~Layer.Layer31; //SHADOW_MAP;
      }
    }
  }
}
