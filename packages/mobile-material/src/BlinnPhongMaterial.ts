import { DataType, LightFeature } from "@alipay/o3-core";
import { Texture2D } from "@alipay/o3-material";
import { Vector4 } from "@alipay/o3-math";
import { CommonMaterial } from "./CommonMaterial";
import BlinnPhongShader from "./shader/BlinnPhong.glsl";

/**
 * 实现 Blinn 光照模型的材质
 * https://dl.acm.org/citation.cfm?id=563893
 * color = <emission> + <ambient> * al + <diffuse> * max(N * L, 0) + <specular> * max(H * N, 0)^<shininess>
 */
export class BlinnPhongMaterial extends CommonMaterial {
  private _directLightCount;
  private _spotLightCount;
  private _pointLightCount;

  /**
   * 实现 Blinn 光照模型的材质
   * @param {String} name 名称
   */
  constructor(name) {
    super(name);

    this._directLightCount = 0;
    this._pointLightCount = 0;
    this._spotLightCount = 0;

    this.diffuse = new Vector4(1, 1, 1, 1);

    this.specular = new Vector4(1, 1, 1, 1);

    this.shininess = 16.0;
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
   * 高光反射颜色
   * @member {Vector4|Texture2D}
   */
  get specular() {
    return this.getValue("u_specular");
  }

  set specular(val) {
    this.setValue("u_specular", val);
  }

  /**
   * 高光系数，值越大高光效果越聚拢
   * @member {float}
   */
  get shininess() {
    return this.getValue("u_shininess");
  }

  set shininess(val) {
    this.setValue("u_shininess", val);
  }

  /**
   * 生成内部的 Technique 对象
   * @private
   */
  _generateTechnique() {
    this._internalGenerate("BlinnPhongMaterial", BlinnPhongShader);
  }

  /**
   * 获取宏
   * @private
   */
  _generateMacros() {
    const macros = super._generateMacros();

    macros.push("O3_NEED_WORLDPOS");

    if (this.diffuse instanceof Texture2D) macros.push("O3_DIFFUSE_TEXTURE");
    if (this.specular instanceof Texture2D) macros.push("O3_SPECULAR_TEXTURE");
    if (this._directLightCount > 0) macros.push(`O3_DIRECT_LIGHT_COUNT ${this._directLightCount}`);
    if (this._pointLightCount > 0) macros.push(`O3_POINT_LIGHT_COUNT ${this._pointLightCount}`);
    if (this._spotLightCount > 0) macros.push(`O3_SPOT_LIGHT_COUNT ${this._spotLightCount}`);

    return macros;
  }

  /**
   * 重写基类方法，添加方向光计算
   * @private
   */
  prepareDrawing(context, component, primitive) {
    const camera = context.camera;
    const scene = camera.scene;
    const lightMgr = scene.findFeature(LightFeature);
    const { directLightCount, pointLightCount, spotLightCount } = lightMgr.lightSortAmount;

    if (
      this._technique === null ||
      this._directLightCount != directLightCount ||
      this._pointLightCount != pointLightCount ||
      this._spotLightCount != spotLightCount
    ) {
      this._directLightCount = directLightCount;
      this._pointLightCount = pointLightCount;
      this._spotLightCount = spotLightCount;

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

    if (this.specular instanceof Texture2D) {
      uniforms.u_specular = {
        name: "u_specular",
        type: DataType.SAMPLER_2D
      };
    } else {
      uniforms.u_specular = {
        name: "u_specular",
        type: DataType.FLOAT_VEC4
      };
    }

    uniforms.u_shininess = {
      name: "u_shininess",
      type: DataType.FLOAT
    };

    const baseUniforms = super._generateFragmentUniform();
    return Object.assign(baseUniforms, uniforms);
  }
}
