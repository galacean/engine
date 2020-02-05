import { DataType, RenderState, CompFunc } from "@alipay/o3-base";
import { Material, RenderTechnique } from "@alipay/o3-material";
import { mat4 } from "@alipay/o3-math";
import vs from "./skybox.vs.glsl";
import fs from "./skybox.fs.glsl";

/**
 * 天空盒材质
 * @class
 * @private
 */
export class SkyBoxMaterial extends Material {
  private _cacheMat1;
  private _cacheMat2;

  constructor(name = SkyBoxMaterial.defaultName) {
    super(name);
  }

  /**
   * 渲染前调用
   * @private
   */
  prepareDrawing(camera, component) {
    if (this._technique === null) {
      this._generateTechnique();
    }

    if (!this._cacheMat1) {
      this._cacheMat1 = mat4.create();
      this._cacheMat2 = mat4.create();
    }
    const view = camera.viewMatrix;
    const proj = camera.projectionMatrix;
    mat4.copy(this._cacheMat1, view);
    this._cacheMat1[12] = this._cacheMat1[13] = this._cacheMat1[14] = 0;
    mat4.mul(this._cacheMat2, proj, this._cacheMat1);
    this.setValue("u_mvpNoscale", this._cacheMat2);

    super.prepareDrawing(camera, component, undefined);
  }

  /**
   * 创建Technique
   * @private
   */
  _generateTechnique() {
    const tech = new RenderTechnique(SkyBoxMaterial.techniqueName);
    tech.isValid = true;
    tech.uniforms = SkyBoxMaterial.techniqueConfig.uniforms;
    tech.attributes = SkyBoxMaterial.techniqueConfig.attributes;
    tech.states = SkyBoxMaterial.techniqueConfig.states;
    tech.vertexShader = SkyBoxMaterial.vertexShader;
    tech.fragmentShader = SkyBoxMaterial.fragmentShader;

    this._technique = tech;
  }

  static defaultName = "SKY_BOX_MATERIAL";
  static techniqueName = "SKY_BOX_TECHNIQUE";
  static vertexShader = vs;
  static fragmentShader = fs;
  static techniqueConfig = {
    attributes: {},
    uniforms: {
      u_mvpNoscale: {
        name: "u_mvpNoscale",
        type: DataType.FLOAT_MAT4
      },
      u_cube: {
        name: "u_cube",
        type: DataType.SAMPLER_CUBE
      }
    },
    states: {
      disable: [RenderState.CULL_FACE],
      functions: {
        depthFunc: CompFunc.LEQUAL
      }
    }
  };
}
