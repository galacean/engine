import { SceneFeature } from "@alipay/o3-core";
import { Logger } from "@alipay/o3-base";
import { ALight } from "./ALight";
import { AAmbientLight } from "./AAmbientLight";
import { ADirectLight } from "./ADirectLight";
import { APointLight } from "./APointLight";
import { ASpotLight } from "./ASpotLight";
import { AEnvironmentMapLight } from "@alipay/o3-pbr";

/**
 * 判断场景中是否有灯光
 * @returns {boolean}
 * @private
 */
export function hasLight() {
  return this.findFeature(LightFeature).visibleLights.length > 0;
}

/**
 * Scene Feature：在场景中添加灯光特性
 * @extends SceneFeature
 * @private
 */
export class LightFeature extends SceneFeature {
  private visibleLights: ALight[];
  constructor() {
    super();
    this.visibleLights = [];
  }

  /**
   * 向当前场景注册一个灯光对象
   * @param {ALight} light 灯光对象
   * @private
   */
  attachRenderLight(light: ALight) {
    const index = this.visibleLights.indexOf(light);
    if (index == -1) {
      this.visibleLights.push(light);
    } else {
      Logger.warn("Light already attached.");
    }
  }

  /**
   * 从当前场景移除一个灯光对象
   * @param {ALight} light 灯光对象
   * @private
   */
  detachRenderLight(light: ALight) {
    const index = this.visibleLights.indexOf(light);
    if (index != -1) {
      this.visibleLights.splice(index, 1);
    }
  }

  /**
   * 将灯光数据绑定到指定的材质中（指定 Uniform 的值）
   * @param {Material} mtl 材质对象
   * @private
   */
  bindMaterialValues(mtl) {
    /**
     * ambientLight 和 envMapLight 在 scene 中分别只有一个
     * */
    let ambientLightCount = 0;
    let directLightCount = 0;
    let pointLightCount = 0;
    let spotLightCount = 0;
    let envMapLightCount = 0;

    let lights = this.visibleLights;
    for (let i = 0, len = lights.length; i < len; i++) {
      const light = lights[i];
      if (light instanceof AAmbientLight && !ambientLightCount++) {
        light.bindMaterialValues(mtl, `u_ambientLight`);
      } else if (light instanceof ADirectLight) {
        light.bindMaterialValues(mtl, `u_directLights[${directLightCount++}]`);
      } else if (light instanceof APointLight) {
        light.bindMaterialValues(mtl, `u_pointLights[${pointLightCount++}]`);
      } else if (light instanceof ASpotLight) {
        light.bindMaterialValues(mtl, `u_spotLights[${spotLightCount++}]`);
      } else if (light instanceof AEnvironmentMapLight && !envMapLightCount++) {
        light.bindMaterialValues(mtl, `u_envMapLight`);
      }
    }
  }

  /**
   * 生成 Technique 所需的全部 uniform 定义
   */
  getUniformDefine() {
    let uniforms = {};
    let ambientLightCount = 0;
    let directLightCount = 0;
    let pointLightCount = 0;
    let spotLightCount = 0;
    let envMapLightCount = 0;

    let lights = this.visibleLights;
    for (let i = 0, len = lights.length; i < len; i++) {
      const light = lights[i];
      if (light instanceof AAmbientLight && !ambientLightCount++) {
        uniforms = { ...uniforms, ...AAmbientLight.getUniformDefine(`u_ambientLight`) };
      } else if (light instanceof ADirectLight) {
        uniforms = { ...uniforms, ...ADirectLight.getUniformDefine(`u_directLights[${directLightCount++}]`) };
      } else if (light instanceof APointLight) {
        uniforms = { ...uniforms, ...APointLight.getUniformDefine(`u_pointLights[${pointLightCount++}]`) };
      } else if (light instanceof ASpotLight) {
        uniforms = { ...uniforms, ...ASpotLight.getUniformDefine(`u_spotLights[${spotLightCount++}]`) };
      } else if (light instanceof AEnvironmentMapLight && !envMapLightCount++) {
        uniforms = { ...uniforms, ...AEnvironmentMapLight.getUniformDefine(`u_envMapLight`) };
      }
    }
    return uniforms;
  }
}
