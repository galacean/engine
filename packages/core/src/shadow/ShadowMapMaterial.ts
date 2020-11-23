import { DataType } from "../base/Constant";
import { ComplexMaterial } from "../material/ComplexMaterial";
import { RenderTechnique } from "../material/RenderTechnique";
import fs from "./shaders/shadowMap.fs.glsl";
import vs from "./shaders/vertex.glsl";

/**
 * 生成 Shadow Map 使用的材质
 * @private
 */
export class ShadowMapMaterial extends ComplexMaterial {
  /**
   * 生成内部所使用的 Technique 对象
   * @private
   */
  _generateTechnique(camera, component) {
    const customMacros = this._generateMacros();
    const uniforms = this._generateFragmentUniform();

    //--
    const tech = new RenderTechnique(this._engine, this.name);
    tech.isValid = true;
    tech.uniforms = uniforms;
    tech.attributes = {};
    tech.states = {};
    tech.customMacros = customMacros;
    tech.vertexShader = vs;
    tech.fragmentShader = fs;

    return tech;
  }

  /**
   * 添加阴影相关的 uniform 定义
   * @private
   */
  _generateFragmentUniform() {
    const uniforms = {
      u_viewMatFromLight: {
        name: "u_viewMatFromLight",
        type: DataType.FLOAT_MAT4
      },
      u_projMatFromLight: {
        name: "u_projMatFromLight",
        type: DataType.FLOAT_MAT4
      }
    };

    return uniforms;
  }

  /**
   * 根据阴影的个数，添加相应的宏定义
   * @private
   */
  _generateMacros() {
    const macros = [];

    macros.push("O3_GENERATE_SHADOW_MAP");

    return macros;
  }
}
