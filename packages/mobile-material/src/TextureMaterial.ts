import { RenderState, DataType } from "@alipay/o3-base";
import { CommonMaterial } from "./CommonMaterial";
import { Texture2D, Texture, CompressedTexture2D } from "@alipay/o3-material";
import FRAG_SHADER from "./shader/Texture.glsl";

/**
 * 无光照贴图材质
 */
export class TextureMaterial extends CommonMaterial {
  static TECH_NAME = "Texture";
  static DISABLE_SHARE = true;

  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor(name) {
    super(name || "TextureMaterial");
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
    console.log("gen", this.texture);
    const uniforms: any = {};
    const fuck = new CompressedTexture2D("a");
    console.log("fuck", fuck);
    console.log("fuck instanceof texture", fuck instanceof Texture);
    console.log("fuck instanceof texture2d", fuck instanceof Texture2D);

    console.log("fuck instanceof compressedtexture2d", fuck instanceof CompressedTexture2D);

    console.log("this.texture", this.texture);
    console.log("instanceof texture", this.texture instanceof Texture);
    console.log("instanceof texture2d", this.texture instanceof Texture2D);

    console.log("instanceof compressedtexture2d", this.texture instanceof CompressedTexture2D);

    if (this.texture instanceof Texture2D) {
      console.log("this.texture", this.texture);
      uniforms.u_diffuse = {
        name: "u_diffuse",
        paramName: "_MainTex",
        type: DataType.SAMPLER_2D
      };
      console.log("uniforms", uniforms);
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
