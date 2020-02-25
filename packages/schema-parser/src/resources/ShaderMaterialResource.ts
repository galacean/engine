import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";

interface IResourceShaderDefine {
  vertexShader?: string;
  fragmentShader?: string;
  states?: object;
  uniforms?: object;
  attributes?: object;
}

export class ShaderMaterialResource extends SchemaResource {
  private shaderDefine: IResourceShaderDefine = {};

  private initShaderDefines(assetConfig) {
    return new Promise(resolve => {
      if (!this.resourceManager.isLocal) {
        const config = assetConfig as any;
        const name = config.props.scripts[0].name;
        const scriptDom = document.createElement("script");
        scriptDom.crossOrigin = "anonymous";
        this.setMeta(assetConfig);
        scriptDom.onload = () => {
          const scripts = (window as any).o3Scripts;
          this.shaderDefine = scripts && scripts[name];
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
    const { vertexShader, fragmentShader, states, uniforms, attributes } = this.shaderDefine;

    const tech = new o3.RenderTechnique("my_tech");
    tech.isValid = true;
    tech.uniforms = Object.assign({}, ShaderMaterialResource.commonUniforms, uniforms);
    tech.attributes = attributes || {};
    tech.vertexShader = vertexShader || "";
    tech.fragmentShader = fragmentShader || "";
    tech.states = states || {};
    return tech;
  }

  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<ShaderMaterialResource> {
    return this.initShaderDefines(assetConfig).then(
      () =>
        new Promise((resolve, reject) => {
          try {
            this.createMaterial();
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
    if (key === "isValid") {
      this._resource.technique[key] = value;
    } else {
      this._resource[key] = value;
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
