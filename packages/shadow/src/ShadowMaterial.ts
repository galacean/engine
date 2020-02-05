import { ComplexMaterial, RenderTechnique } from "@alipay/o3-material";
import { RenderState, BlendFunc, CompFunc } from "@alipay/o3-base";
import { LightShadow } from "./LightShadow";

import vs from "./shaders/vertex.glsl";
import fs from "./shaders/shadow.fs.glsl";

/**
 * 接收阴影的材质
 * @private
 */
export class ShadowMaterial extends ComplexMaterial {
  public shadowMapCount;
  /**
   * 生成内部所使用的 Technique 对象
   * @private
   */
  _generateTechnique(camera, component) {
    const customMacros = this._generateMacros();
    const uniforms = this._generateFragmentUniform();

    //--
    const tech = new RenderTechnique(this.name);
    tech.isValid = true;
    tech.uniforms = uniforms;
    tech.attributes = {};
    tech.states = {};
    tech.customMacros = customMacros;
    tech.vertexShader = vs;
    tech.fragmentShader = fs;
    tech.states = {
      enable: [RenderState.BLEND],
      functions: {
        depthFunc: [CompFunc.LEQUAL],
        blendFunc: [BlendFunc.DST_COLOR, BlendFunc.ZERO]
      }
    };

    return tech;
  }

  /**
   * 添加阴影相关的 uniform 定义
   * @private
   */
  _generateFragmentUniform() {
    let uniforms = {};

    for (let i = 0; i < this.shadowMapCount; i++) {
      const lgtUniforms = LightShadow.getUniformDefine(i);
      uniforms = { ...uniforms, ...lgtUniforms };
    } // end of for

    return uniforms;
  }

  /**
   * 根据阴影的个数，添加相应的宏定义
   * @private
   */
  _generateMacros() {
    const macros = [];

    if (this.shadowMapCount > 0) {
      macros.push(`O3_SHADOW_MAP_COUNT ${this.shadowMapCount}`);
    }
    return macros;
  }
}
