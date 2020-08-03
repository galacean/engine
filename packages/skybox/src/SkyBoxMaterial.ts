import { DataType, RenderState, CompFunc } from "@alipay/o3-base";
import { Material, RenderTechnique } from "@alipay/o3-material";
import { Matrix4x4 } from "@alipay/o3-math";
import vs from "./skybox.vs.glsl";
import fs from "./skybox.fs.glsl";

/**
 * 天空盒材质
 * @class
 * @private
 */
export class SkyBoxMaterial extends Material {
  private _cacheMat1: Matrix4x4;
  private _cacheMat2: Matrix4x4;
  private modelMatrix: Matrix4x4;

  constructor(name = SkyBoxMaterial.defaultName) {
    super(name);
  }

  public setModel(modelMatrix: Matrix4x4) {
    this.modelMatrix = modelMatrix;
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
      this._cacheMat1 = new Matrix4x4();
      this._cacheMat2 = new Matrix4x4();
    }
    const view = camera.viewMatrix;
    const proj = camera.projectionMatrix;

    Matrix4x4.multiply(view, this.modelMatrix, this._cacheMat1);
    const e = this._cacheMat1.elements;
    e[12] = e[13] = e[14] = 0;
    Matrix4x4.multiply(proj, this._cacheMat1, this._cacheMat2);
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
