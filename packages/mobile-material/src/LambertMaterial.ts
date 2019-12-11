import { vec4 } from "@alipay/o3-math";
import { DataType } from "@alipay/o3-base";
import { Texture2D } from "@alipay/o3-material";
import { CommonMaterial } from "./CommonMaterial";
import { LightFeature, ADirectLight } from "@alipay/o3-lighting";
import LambertShader from "./shader/Lambert.glsl";

/**
 * 实现 Lambert 光照模型的材质
 * color = <emission> + <ambient> * al + <diffuse> * max(N * L, 0)
 */
export class LambertMaterial extends CommonMaterial {
  private _directLightCount;
  private _diffuse;

  /**
   * Lambert 光照模型材质
   * @param {String} name 名称
   */
  constructor(name) {
    super(name);

    this._directLightCount = 0;

    this._diffuse = vec4.fromValues(1, 1, 1, 1);
  }

  /**
   * 环境光反射颜色
   * @member {vec4|Texture2D}
   */
  get diffuse() {
    return this._diffuse;
  }

  set diffuse(val) {
    this._diffuse = val;
    this.setValue("u_diffuse", val);
  }

  clone(name?: string) {
    let newMaterial = super.clone(name);
    newMaterial.cloneVal("diffuse", this.diffuse);

    return newMaterial;
  }

  /**
   * 生成内部的 Technique 对象
   * @private
   */
  _generateTechnique() {
    this._internalGenerate("LambertMaterial", LambertShader);
    this.setValue("u_diffuse", this._diffuse);
  }

  /**
   * 重写基类方法，添加方向光计算
   * @private
   */
  prepareDrawing(camera, component, primitive) {
    let directLightCount = 0;

    const scene = camera.scene;
    const lightMgr = scene.findFeature(LightFeature);
    if (lightMgr) {
      const lights = lightMgr.visibleLights;

      for (let i = 0, len = lights.length; i < len; i++) {
        const lgt = lights[i];
        if (lgt instanceof ADirectLight) {
          const name = `u_directLights[${directLightCount}]`;
          lgt.bindMaterialValues(this, name);
          directLightCount++;
        }
      } // end of for
    } // end of if

    if (this._technique === null || this._directLightCount != directLightCount) {
      this._directLightCount = directLightCount;
      this._generateTechnique();
    }

    super.prepareDrawing(camera, component, primitive);
  }

  /**
   * 添加方向光相关的 uniform 定义
   * @private
   */
  _generateFragmentUniform() {
    let uniforms: any = {};
    for (let i = 0; i < this._directLightCount; i++) {
      const name = `u_directLights[${i}]`;
      const lgtUniforms = ADirectLight.getUniformDefine(name);
      uniforms = { ...uniforms, ...lgtUniforms };
    } // end of for

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

    if (this._diffuse instanceof Texture2D) macros.push("O3_DIFFUSE_TEXTURE");

    return macros;
  }
}
