import { DataType, RenderState, BlendFunc, MaterialType } from "@alipay/o3-core";
import { Material, RenderTechnique } from "@alipay/o3-material";

import VERT_SHADER from "./trail.vs.glsl";
import FRAG_SHADER from "./trail.fs.glsl";

export class TrailMaterial extends Material {
  /**
   * 生成内部所使用的 Technique 对象
   * @private
   */
  _generateTechnique() {
    //--
    const tech = new RenderTechnique("trail_tech");
    tech.isValid = true;
    tech.uniforms = {
      u_texture: {
        name: "u_texture",
        type: DataType.SAMPLER_2D
      }
    };
    tech.attributes = {};
    tech.states = {
      enable: [RenderState.BLEND],
      functions: {
        blendFunc: [BlendFunc.SRC_ALPHA, BlendFunc.ONE],
        depthMask: [false]
      }
    };
    tech.customMacros = [];
    tech.vertexShader = VERT_SHADER;
    tech.fragmentShader = FRAG_SHADER;

    this._technique = tech;
    this.renderType = MaterialType.TRANSPARENT;
  }

  /**
   * 重写基类方法
   * @private
   */
  prepareDrawing(context, component, primitive) {
    if (this._technique === null) {
      this._generateTechnique();
    }

    super.prepareDrawing(context, component, primitive);
  }
}
