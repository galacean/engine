import { vec2, vec4 } from "@alipay/r3-math";
import { DataType, MaterialType } from "@alipay/r3-base";
import { Texture2D } from "@alipay/r3-material";
import { CommonMaterial } from "@alipay/r3-mobile-material";
import RfuiShader from "./shader/fragment.glsl";

/**
 * RfuiMaterial Rfui材质 color = （<emission> + <ambient> * al + <diffuse> * max(N * L, 0)）* opacity
 * @extends CommonMaterial
 */
export class RfuiMaterial extends CommonMaterial {
  private _diffuse;
  private _opacity;
  private _uvOffset;
  private _maskUvOffset;
  private _mask;
  private _uvVelocity;

  /**
   * @constructor
   * @param {String} name 名称
   */
  constructor(name: string) {
    super(name);
    this.emission = vec4.fromValues(0, 0, 0, 0);
    this.ambient = vec4.fromValues(0, 0, 0, 0);
    this.transparent = true;
    this.renderType = MaterialType.TRANSPARENT;

    this._diffuse = vec4.fromValues(1, 1, 1, 1);
    this._opacity = 1;
    this._uvOffset = vec2.fromValues(0, 0);
    this._maskUvOffset = vec2.fromValues(0, 0);
  }

  /**
   * 获取环境光反射颜色
   * @return {vec4|Texture2D} 反射颜色
   */
  get diffuse() {
    return this._diffuse;
  }

  /**
   * 设置境光反射颜色
   * @param {vec4|Texture2D} 反射颜色
   */
  set diffuse(val) {
    this._diffuse = val;
    this.setValue("u_diffuse", val);
  }

  /**
   * 获取材质透明度
   * @return {number} 透明度
   */
  get opacity() {
    return this._opacity;
  }

  /**
   * 设置材质透明度
   * @param {number} 透明度
   */
  set opacity(val) {
    this._opacity = val;
    this.setValue("u_opacity", val);
  }

  /**
   * 获取材质透明度
   * @return {number} 透明度
   */
  get uvOffset() {
    return this._uvOffset;
  }

  /**
   * 设置材质透明度
   * @param {number} 透明度
   */
  set uvOffset(val) {
    this._uvOffset = val;
    this.setValue("u_uvOffset", val);
  }

  /**
   * 获取材质透明度
   * @return {number} 透明度
   */
  get maskUvOffset() {
    return this._maskUvOffset;
  }

  /**
   * 设置材质透明度
   * @param {number} 透明度
   */
  set maskUvOffset(val) {
    this._maskUvOffset = val;
    this.setValue("u_maskUvOffset", val);
  }

  /**
   * 获取遮罩贴图
   * @return {Texture2D} 遮罩贴图
   */
  get mask() {
    return this._mask;
  }

  /**
   * 设置遮罩贴图
   * @param {Texture2D} 遮罩贴图
   */
  set mask(val) {
    this._mask = val;
    this.setValue("u_mask", val);
  }

  /**
   * 获取uv动画速度
   * @return {Vec2} uv动画速度
   */
  get uvVelocity() {
    return this._uvVelocity;
  }

  /**
   * 设置uv动画速度
   * @param {Vec2} uv动画速度
   */
  set uvVelocity(val) {
    this._uvVelocity = val;
    this.setValue("u_uvVelocity", val);
  }

  /**
   * 生成内部的 Technique 对象
   * @private
   */
  _generateTechnique() {
    this._internalGenerate("RfuiMaterial", RfuiShader);
    this.setValue("u_diffuse", this._diffuse);
    this.setValue("u_opacity", this._opacity);
    this.setValue("u_uvOffset", this._uvOffset);
    this.setValue("u_maskUvOffset", this._maskUvOffset);
    if (this._mask) {
      this.setValue("u_mask", this._mask);
    }
    if (this._uvVelocity) {
      this.setValue("u_uvVelocity", this._uvVelocity);
    }
  }

  /**
   * 添加 uniform 定义
   * @private
   */
  _generateFragmentUniform() {
    const uniforms: any = {
      u_opacity: {
        name: "u_opacity",
        type: DataType.FLOAT
      },
      u_uvOffset: {
        name: "u_uvOffset",
        type: DataType.FLOAT_VEC2
      },
      u_maskUvOffset: {
        name: "u_maskUvOffset",
        type: DataType.FLOAT_VEC2
      }
    };

    if (this._diffuse instanceof Texture2D) {
      uniforms.u_diffuse = {
        name: "u_diffuse",
        type: DataType.SAMPLER_2D
      };
    } else {
      uniforms.u_diffuse = {
        name: "u_diffuse",
        type: DataType.FLOAT_VEC4
      };
    }

    if (this._mask) {
      uniforms.u_mask = {
        name: "u_mask",
        type: DataType.SAMPLER_2D
      };
    }
    if (this._uvVelocity) {
      uniforms.u_uvVelocity = {
        name: "u_uvVelocity",
        type: DataType.FLOAT_VEC2
      };
    }

    const baseUniforms = super._generateFragmentUniform();
    return Object.assign(baseUniforms, uniforms);
  }

  /**
   * 添加宏定义
   * @private
   */
  _generateMacros() {
    const macros = super._generateMacros();

    if (this._diffuse instanceof Texture2D) macros.push("R3_DIFFUSE_TEXTURE");
    if (this._mask) macros.push("R3_MASK_TEXTURE");
    if (this._uvVelocity) macros.push("R3_UV_ANIMATE");

    return macros;
  }
}
