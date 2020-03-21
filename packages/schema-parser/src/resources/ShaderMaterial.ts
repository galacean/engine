import * as o3 from "@alipay/o3";
import { union } from "../utils";
import { EnableConfig, DisableConfig, FunctionConfig, TechniqueStates } from "../types";

export class ShaderMatrial extends o3.Material {
  public vertexShader: string = "";
  public fragmentShader: string = "";
  public isValid: boolean = true;
  public attributes = {};
  private _uniforms = ShaderMatrial.commonUniforms;
  private _renderStates: TechniqueStates = {
    enable: [],
    disable: [],
    functions: {}
  };
  private _enableConfig: EnableConfig = [];
  private _disableConfig: DisableConfig = [];
  private _functionsConfig: FunctionConfig = {
    blendFunc: [o3.BlendFunc.SRC_ALPHA, o3.BlendFunc.ONE_MINUS_SRC_ALPHA]
  };

  constructor(name) {
    super(name);
  }

  prepareDrawing(camera, component, primitive) {
    if (!this._technique) {
      const tech = this._generateTechnique(camera, component, primitive);
      this._technique = tech;
    }
    super.prepareDrawing(camera, component, primitive);
  }

  // 更新technique
  updateTechnique() {
    this._technique = null;
  }

  _generateTechnique(camera, component, primitive) {
    const tech = new o3.RenderTechnique("ShaderMaterial");

    tech.isValid = this.isValid;
    tech.uniforms = this.uniforms;
    tech.attributes = this.attributes;
    tech.states = this.renderStates;
    tech.vertexShader = this.vertexShader;
    tech.fragmentShader = this.fragmentShader;
    return tech;
  }

  addState(key: string, state: Array<any>) {
    this.renderStates[key] = union(this.renderStates[key], state);
  }

  removeState(key: string, state: any) {
    this.renderStates[key] = this.renderStates[key].filter(value => value !== state);
  }

  get renderStates() {
    return this._renderStates;
  }

  set renderStates(value) {
    const { enable = [], disable = [], functions = {} } = value;
    // 为了防止冲突，把预置的几个属性放在_enableConfig里面，此处需过滤掉
    const enableState = enable.filter(value => ShaderMatrial.commonEnable.indexOf(value) < 0);
    const disableState = disable.filter(value => ShaderMatrial.commonDisable.indexOf(value) < 0);
    this._renderStates.enable = union(enableState, this._enableConfig);
    this._renderStates.disable = union(disableState, this._disableConfig);
    this._renderStates.functions = Object.assign({}, functions, this._functionsConfig);
  }

  get uniforms() {
    return this._uniforms;
  }

  set uniforms(value) {
    this._uniforms = Object.assign({}, ShaderMatrial.commonUniforms, value);
  }

  set blend(value: boolean) {
    if (value) {
      this._enableConfig = union(this._enableConfig, [o3.RenderState.BLEND]);
    } else {
      this._enableConfig = this._enableConfig.filter(state => state !== o3.RenderState.BLEND);
      this.removeState("enable", o3.RenderState.BLEND);
    }
    this.renderStates = this._renderStates;
  }

  set blendSrcFactor(value: string) {
    this._functionsConfig.blendFunc[0] = value;
    this.renderStates = this._renderStates;
  }

  set blendDstFactor(value: string) {
    this._functionsConfig.blendFunc[1] = value;
    this.renderStates = this._renderStates;
  }

  set doubleSide(value: boolean) {
    if (value) {
      this._disableConfig = union(this._disableConfig, [o3.RenderState.CULL_FACE]);
    } else {
      this._disableConfig = this._disableConfig.filter(state => state !== o3.RenderState.CULL_FACE);
      this.removeState("disable", o3.RenderState.CULL_FACE);
    }
    this.renderStates = this._renderStates;
  }

  set depthTest(value: boolean) {
    if (!value) {
      this._disableConfig = union(this._disableConfig, [o3.RenderState.DEPTH_TEST]);
    } else {
      this._disableConfig = this._disableConfig.filter(state => state !== o3.RenderState.DEPTH_TEST);
      this.removeState("disable", o3.RenderState.DEPTH_TEST);
    }
    this.renderStates = this._renderStates;
  }

  static commonUniforms = {
    matModelViewProjection: {
      name: "matModelViewProjection",
      semantic: o3.UniformSemantic.MODELVIEWPROJECTION,
      type: o3.DataType.FLOAT_MAT4
    },
    matModelView: {
      name: "matModelView",
      semantic: o3.UniformSemantic.MODELVIEW,
      type: o3.DataType.FLOAT_MAT4
    }
  };

  static commonEnable = [o3.RenderState.BLEND];
  static commonDisable = [o3.RenderState.CULL_FACE, o3.RenderState.DEPTH_TEST];
}
