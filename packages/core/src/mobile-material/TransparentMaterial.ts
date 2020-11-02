import { BlendFunc, DataType, MaterialType, RenderState } from "../base/Constant";
import { Engine } from "../Engine";
import { Texture2D } from "../texture/Texture2D";
import { CommonMaterial } from "./CommonMaterial";
import FRAG_SHADER from "./shader/Texture.glsl";

/**
 * 支持透明的无光照贴图材质
 */
export class TransparentMaterial extends CommonMaterial {
  static TECH_NAME = "Transparent";

  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor(engine: Engine, name) {
    super(engine, name || "TransparentMaterial");
  }

  _generateTechnique() {
    this.renderStates = {
      enable: [RenderState.BLEND],
      disable: [RenderState.CULL_FACE],
      functions: {
        blendFunc: [BlendFunc.SRC_ALPHA, BlendFunc.ONE_MINUS_SRC_ALPHA],
        depthMask: [false]
      }
    };
    this.renderType = MaterialType.TRANSPARENT;

    this._internalGenerate("Transparent", FRAG_SHADER);
  }

  /**
   * 纹理贴图
   * @member {Texture2D}
   */
  set texture(v) {
    this.setValue("u_diffuse", v);
  }

  get texture() {
    return this.getValue("u_diffuse");
  }

  /**
   * 添加 uniform 定义
   * @private
   */
  _generateFragmentUniform() {
    const uniforms: any = {};
    if (this.texture instanceof Texture2D) {
      uniforms.u_diffuse = {
        name: "u_diffuse",
        paramName: "_MainTex",
        type: DataType.SAMPLER_2D
      };
    }
    return {
      ...super._generateFragmentUniform(),
      ...uniforms
    };
  }

  _generateMacros() {
    const macros = super._generateMacros();

    if (this.texture instanceof Texture2D) macros.push("O3_DIFFUSE_TEXTURE");

    return macros;
  }
}
