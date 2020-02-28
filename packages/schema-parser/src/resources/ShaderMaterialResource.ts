import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";
import { union } from "../utils";
import { DataType } from "@alipay/o3";
import { TechniqueStates, Uniforms, Attributes } from "@alipay/o3-material/types/type";

interface IResourceShaderDefine {
  vertexShader?: string;
  fragmentShader?: string;
  states?: TechniqueStates;
  uniforms?: Uniforms;
  attributes?: Attributes;
  isValid?: boolean;
}

export class ShaderMaterialResource extends SchemaResource {
  private shaderDefine: IResourceShaderDefine = {
    vertexShader: "",
    fragmentShader: "",
    states: {
      enable: [],
      disable: [],
      functions: {
        blendFunc: [o3.BlendFunc.SRC_ALPHA, o3.BlendFunc.ONE_MINUS_SRC_ALPHA]
      }
    },
    uniforms: {},
    attributes: {},
    isValid: true
  };

  private initShaderDefines(assetConfig) {
    const { isValid, blend, blendSrcFactor, blendDstFactor, doubleSide, depthTest } = assetConfig.props;
    this.isValid = isValid;
    this.blend = blend;
    this.blendSrcFactor = blendSrcFactor;
    this.blendDstFactor = blendDstFactor;
    this.doubleSide = doubleSide;
    this.depthTest = depthTest;

    return new Promise(resolve => {
      if (!this.resourceManager.isLocal) {
        const config = assetConfig as any;
        const name = config.props.scripts[0].name;
        const scriptDom = document.createElement("script");
        scriptDom.crossOrigin = "anonymous";
        this.setMeta(assetConfig);
        scriptDom.onload = () => {
          const scripts = (window as any).o3Scripts;
          const shaderMaterialDefine = (scripts && scripts[name]) || {};

          const {
            vertexShader = "",
            fragmentShader = "",
            states = {},
            uniforms = {},
            attributes = {}
          } = shaderMaterialDefine;
          const { enable = [], disable = [], functions = {} } = states;
          states.enable = union(enable, this.shaderDefine.states.enable);
          states.disable = union(disable, this.shaderDefine.states.disable);
          states.functions = Object.assign({}, this.shaderDefine.states.functions, functions);

          this.shaderDefine = {
            vertexShader,
            fragmentShader,
            states,
            uniforms: Object.assign({}, ShaderMaterialResource.commonUniforms, uniforms),
            attributes
          };

          resolve();
        };
        scriptDom.src = assetConfig.url;
        document.body.appendChild(scriptDom);
      } else {
        resolve();
      }
    });
  }

  private createMaterial() {
    const tech = this.createTechnique();
    const material = new o3.Material(this.meta.name || "shader_mtl");
    material.technique = tech;
    this._resource = material;
  }

  private createTechnique() {
    const { vertexShader, fragmentShader, states, uniforms, attributes, isValid } = this.shaderDefine;

    const tech = new o3.RenderTechnique("my_tech");
    tech.isValid = isValid;
    tech.uniforms = uniforms;
    tech.attributes = attributes;
    tech.vertexShader = vertexShader;
    tech.fragmentShader = fragmentShader;
    tech.states = states;
    return tech;
  }

  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<ShaderMaterialResource> {
    return this.initShaderDefines(assetConfig).then(
      () =>
        new Promise((resolve, reject) => {
          try {
            this.createMaterial();
            const { transparent } = assetConfig.props;
            this.transparent = transparent;
            resolve(this);
          } catch {
            reject("[shader material] createTechnique error");
          }
        })
    );
  }

  setMeta(assetConfig?: AssetConfig) {
    if (assetConfig) {
      this._meta.name = assetConfig.name;
      this._meta.url = assetConfig.url;
      this._meta.source = assetConfig.source;
    }
  }

  update(key: string, value: any) {
    const shaderMaterialResource = this;
    shaderMaterialResource[key] = value;
  }

  private _addState(key: string, state: Array<any>) {
    const { states } = this.shaderDefine;
    this.shaderDefine.states[key] = union(states.disable, state);
  }

  private _removeState(key: string, state: any) {
    const { states } = this.shaderDefine;
    this.shaderDefine.states[key] = states.disable.filter(value => value !== state);
  }

  set transparent(value: boolean) {
    this._resource.transparent = value;
  }

  set isValid(value: boolean) {
    this.shaderDefine.isValid = value;
  }

  set blend(value: boolean) {
    if (value) {
      this._addState("enable", [o3.RenderState.BLEND]);
    } else {
      this._removeState("enable", o3.RenderState.BLEND);
    }
  }

  set blendSrcFactor(value: string) {
    this.shaderDefine.states.functions.blendFunc[0] = value;
  }

  set blendDstFactor(value: string) {
    this.shaderDefine.states.functions.blendFunc[1] = value;
  }

  set doubleSide(value: boolean) {
    if (value) {
      this._addState("disable", [o3.RenderState.CULL_FACE]);
    } else {
      this._removeState("disable", o3.RenderState.CULL_FACE);
    }
  }

  set depthTest(value: boolean) {
    if (!value) {
      this._addState("disable", [o3.RenderState.DEPTH_TEST]);
    } else {
      this._removeState("disable", o3.RenderState.DEPTH_TEST);
    }
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
}
