import { Vector4 } from "@oasis-engine/math";
import { DataType } from "../base/Constant";
import { Engine } from "../Engine";
import { LightFeature } from "../lighting/LightFeature";
import { Texture2D } from "../texture/Texture2D";
import { CommonMaterial } from "./CommonMaterial";
import LambertShader from "./shader/Lambert.glsl";

/**
 * 实现 Lambert 光照模型的材质
 * color = <emission> + <ambient> * al + <diffuse> * max(N * L, 0)
 */
export class LambertMaterial extends CommonMaterial {
  private _directLightCount;

  /**
   * Lambert 光照模型材质
   * @param {String} name 名称
   */
  constructor(engine: Engine, name) {
    super(engine, name);

    this._directLightCount = 0;

    this.diffuse = new Vector4(1, 1, 1, 1);
  }

  /**
   * 环境光反射颜色
   * @member {Vector4|Texture2D}
   */
  get diffuse() {
    return this.getValue("u_diffuse");
  }

  set diffuse(val) {
    this.setValue("u_diffuse", val);
  }

  /**
   * 生成内部的 Technique 对象
   * @private
   */
  _generateTechnique() {
    this._internalGenerate("LambertMaterial", LambertShader);
  }

  /**
   * 重写基类方法，添加方向光计算
   * @private
   */
  prepareDrawing(context, component, primitive) {
    const camera = context.camera;
    const scene = camera.scene;
    const lightMgr = scene.findFeature(LightFeature);
    const { directLightCount } = lightMgr.lightSortAmount;

    if (this._technique === null || this._directLightCount != directLightCount) {
      this._directLightCount = directLightCount;
      this._generateTechnique();
      this.bindLightUniformDefine(camera);
    }

    super.prepareDrawing(context, component, primitive);
  }

  /**
   * 添加方向光相关的 uniform 定义
   * @private
   */
  _generateFragmentUniform() {
    let uniforms: any = {};

    if (this.diffuse instanceof Texture2D) {
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

    const baseUniforms = super._generateFragmentUniform();
    return Object.assign(baseUniforms, uniforms);
  }

  /**
   * 根据方向光的个数，添加相应的宏定义
   * @private
   */
  _generateMacros() {
    const macros = super._generateMacros();

    macros.push("O3_NEED_WORLDPOS");

    if (this._directLightCount > 0) macros.push(`O3_DIRECT_LIGHT_COUNT ${this._directLightCount}`);

    if (this.diffuse instanceof Texture2D) macros.push("O3_DIFFUSE_TEXTURE");

    return macros;
  }
}
