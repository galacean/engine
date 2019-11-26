import { vec3, vec4 } from "@alipay/o3-math";
import { DataType } from "@alipay/o3-base";
import { RenderTechnique, Texture2D, Material } from "@alipay/o3-material";
import { LightFeature, AAmbientLight, ADirectLight, APointLight, ASpotLight } from "@alipay/o3-lighting";
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
  private _diffuse;
  private _specular;
  private _shininess;

  /**
   * 实现 Blinn 光照模型的材质
   * @param {String} name 名称
   */
  constructor(name) {
    super(name);

    this._directLightCount = 0;
    this._pointLightCount = 0;
    this._spotLightCount = 0;

    this._diffuse = vec4.fromValues(1, 1, 1, 1);

    this._specular = vec4.fromValues(1, 1, 1, 1);

    this._shininess = 16.0;
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

  /**
   * 高光反射颜色
   * @member {vec4|Texture2D}
   */
  get specular() {
    return this._specular;
  }

  set specular(val) {
    this._specular = val;
    this.setValue("u_specular", val);
  }

  /**
   * 高光系数，值越大高光效果越聚拢
   * @member {float}
   */
  get shininess() {
    return this._shininess;
  }

  set shininess(val) {
    this._shininess = val;
    this.setValue("u_shininess", val);
  }

  /**
   * 生成内部的 Technique 对象
   * @private
   */
  _generateTechnique() {
    this._internalGenerate("BlinnPhongMaterial", BlinnPhongShader);
    this.setValue("u_diffuse", this._diffuse);
    this.setValue("u_specular", this._specular);
    this.setValue("u_shininess", this._shininess);
  }

  /**
   * 获取宏
   * @private
   */
  _generateMacros() {
    const macros = super._generateMacros();

    macros.push("O3_NEED_WORLDPOS");

    if (this._diffuse instanceof Texture2D) macros.push("O3_DIFFUSE_TEXTURE");
    if (this._specular instanceof Texture2D) macros.push("O3_SPECULAR_TEXTURE");
    if (this._directLightCount > 0) macros.push(`O3_DIRECT_LIGHT_COUNT ${this._directLightCount}`);
    if (this._pointLightCount > 0) macros.push(`O3_POINT_LIGHT_COUNT ${this._pointLightCount}`);
    if (this._spotLightCount > 0) macros.push(`O3_SPOT_LIGHT_COUNT ${this._spotLightCount}`);

    return macros;
  }

  /**
   * 重写基类方法，添加方向光计算
   * @private
   */
  prepareDrawing(camera, component, primitive) {
    let directLightCount = 0;
    let pointLightCount = 0;
    let spotLightCount = 0;

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
        } else if (lgt instanceof APointLight) {
          const name = `u_pointLights[${pointLightCount}]`;
          lgt.bindMaterialValues(this, name);
          pointLightCount++;
        } else if (lgt instanceof ASpotLight) {
          const name = `u_spotLights[${spotLightCount}]`;
          lgt.bindMaterialValues(this, name);
          spotLightCount++;
        }
      } // end of for
    } // end of if

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

    for (let i = 0; i < this._pointLightCount; i++) {
      const name = `u_pointLights[${i}]`;
      const lgtUniforms = APointLight.getUniformDefine(name);
      uniforms = { ...uniforms, ...lgtUniforms };
    } // end of for

    for (let i = 0; i < this._spotLightCount; i++) {
      const name = `u_spotLights[${i}]`;
      const lgtUniforms = ASpotLight.getUniformDefine(name);
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

    if (this._specular instanceof Texture2D) {
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
