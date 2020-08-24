import { BlendFunc, DataType, RenderState, UniformSemantic } from "../base/Constant";
import { Material } from "../material/Material";
import { RenderTechnique } from "../material/RenderTechnique";
import { TechniqueStates } from "../material/type";
import { DisableConfig, EnableConfig, FunctionConfig } from "./type";

export class ShaderMaterial extends Material {
  // Vertex Shader 代码
  public vertexShader: string = "";
  // Fragment Shader 代码
  public fragmentShader: string = "";
  // 是否可用
  public isValid: boolean = true;
  // Attribute记录对象
  public attributes = {};
  // Unifrom记录数组
  private _uniforms = ShaderMaterial.commonUniforms;
  // 渲染状态控制对象
  private _renderStates: TechniqueStates = {
    enable: [],
    disable: [],
    functions: {}
  };
  // 渲染状态控制对象中的 enable 配置项
  private _enableConfig: EnableConfig = [];
  // 渲染状态控制对象中的 disable 配置项
  private _disableConfig: DisableConfig = [];
  // 渲染状态控制对象中的 function 配置项
  private _functionsConfig: FunctionConfig = {
    blendFunc: [BlendFunc.SRC_ALPHA, BlendFunc.ONE_MINUS_SRC_ALPHA]
  };

  constructor(name) {
    super(name);
  }

  // 开始渲染指定对象
  prepareDrawing(context, component, primitive) {
    const camera = context.camera;
    if (!this._technique) {
      const tech = this._generateTechnique(camera, component, primitive);
      this._technique = tech;
    }
    super.prepareDrawing(context, component, primitive);
  }

  // 更新technique
  updateTechnique() {
    this._technique = null;
  }

  // 生成内部的 Technique 对象
  _generateTechnique(camera, component, primitive) {
    const tech = new RenderTechnique("ShaderMaterial");

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
    this.renderStates[key] = this.renderStates[key].filter((value) => value !== state);
  }

  get renderStates() {
    return this._renderStates;
  }

  set renderStates(value) {
    const { enable = [], disable = [], functions = {} } = value;
    // 为了防止冲突，把预置的几个属性放在_enableConfig里面，此处需过滤掉
    const enableState = enable.filter((value) => ShaderMaterial.commonEnable.indexOf(value) < 0);
    const disableState = disable.filter((value) => ShaderMaterial.commonDisable.indexOf(value) < 0);
    this._renderStates.enable = union(enableState, this._enableConfig);
    this._renderStates.disable = union(disableState, this._disableConfig);
    this._renderStates.functions = Object.assign({}, functions, this._functionsConfig);
  }

  get uniforms() {
    return this._uniforms;
  }

  set uniforms(value) {
    this._uniforms = Object.assign({}, ShaderMaterial.commonUniforms, value);
  }

  // 是否开启片元的颜色融合计算
  set blend(value: boolean) {
    if (value) {
      this._enableConfig = union(this._enableConfig, [RenderState.BLEND]);
    } else {
      this._enableConfig = this._enableConfig.filter((state) => state !== RenderState.BLEND);
      this.removeState("enable", RenderState.BLEND);
    }
    this.renderStates = this._renderStates;
  }

  // 混合源因子
  set blendSrcFactor(value: string) {
    this._functionsConfig.blendFunc[0] = value;
    this.renderStates = this._renderStates;
  }

  // 混合目标因子
  set blendDstFactor(value: string) {
    this._functionsConfig.blendFunc[1] = value;
    this.renderStates = this._renderStates;
  }

  // 是否双面显示
  set doubleSide(value: boolean) {
    if (value) {
      this._disableConfig = union(this._disableConfig, [RenderState.CULL_FACE]);
    } else {
      this._disableConfig = this._disableConfig.filter((state) => state !== RenderState.CULL_FACE);
      this.removeState("disable", RenderState.CULL_FACE);
    }
    this.renderStates = this._renderStates;
  }

  // 是否开启深度测试
  set depthTest(value: boolean) {
    if (!value) {
      this._disableConfig = union(this._disableConfig, [RenderState.DEPTH_TEST]);
    } else {
      this._disableConfig = this._disableConfig.filter((state) => state !== RenderState.DEPTH_TEST);
      this.removeState("disable", RenderState.DEPTH_TEST);
    }
    this.renderStates = this._renderStates;
  }

  static commonUniforms = {
    matModelViewProjection: {
      name: "matModelViewProjection",
      semantic: UniformSemantic.MODELVIEWPROJECTION,
      type: DataType.FLOAT_MAT4
    },
    matModelView: {
      name: "matModelView",
      semantic: UniformSemantic.MODELVIEW,
      type: DataType.FLOAT_MAT4
    }
  };

  static commonEnable = [RenderState.BLEND];
  static commonDisable = [RenderState.CULL_FACE, RenderState.DEPTH_TEST];
}

export function union(arr1: Array<any>, arr2: Array<any>): Array<any> {
  return arr1.concat(arr2.filter((v) => !(arr1.indexOf(v) > -1)));
}
