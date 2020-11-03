import { DataType, RenderState } from "../base/Constant";
import { Engine } from "../Engine";
import { Texture2D } from "../texture/Texture2D";
import { CommonMaterial } from "./CommonMaterial";
import FRAG_SHADER from "./shader/Texture.glsl";

/**
 * 无光照贴图材质
 */
export class TextureMaterial extends CommonMaterial {
  static TECH_NAME = "Texture";

  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor(engine: Engine, name) {
    super(engine, name || "TextureMaterial");
  }

  _generateTechnique() {
    this._internalGenerate("Texture", FRAG_SHADER);
  }

  /**
   * 设定材质参数值
   * @param {string} name 参数名称
   * @param {*} value 参数值
   */
  setValue(name, value) {
    if (name === "doubleSided") {
      this._setDoubleSidedDisplay(value);
    }

    super.setValue(name, value);
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
   * 是否双面显示
   * @member {boolean}
   */
  set doubleSided(v) {
    this.setValue("doubleSided", v);
  }
  get doubleSided() {
    return this.getValue("doubleSided");
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

  /**
   * 设置材质是否双面显示
   * @private
   */
  _setDoubleSidedDisplay(value) {
    this._technique.states.disable = [];

    if (value) {
      this._technique.states.disable.push(RenderState.CULL_FACE);
    }
  }
}
