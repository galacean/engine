import { ShaderMaterial } from "@oasis-engine/core";
import { Oasis } from "../Oasis";
import { AssetConfig } from "../types";
import { SchemaResource } from "./SchemaResource";
type ShaderMaterialDefine = {
  vertexShader: string;
  fragmentShader: string;
  states: object;
  uniforms: object;
  attributes: object;
};
export class ShaderMaterialResource extends SchemaResource {
  private scripts: Array<any>;

  private loadShaderDefine(oasis?: Oasis) {
    return new Promise((resolve) => {
      const name = this.scripts[0].name;
      if (this.resourceManager.isLocal) {
        resolve(oasis.options?.scripts[name] ?? {});
      } else {
        const oldScriptDom = document.getElementById(name);
        if (oldScriptDom) {
          document.body.removeChild(oldScriptDom);
        }

        const scriptDom = document.createElement("script");
        scriptDom.crossOrigin = "anonymous";
        scriptDom.onload = () => {
          const scripts = (window as any).o3Scripts;
          resolve((scripts && scripts[name]) ?? {});
        };
        scriptDom.id = name;
        scriptDom.src = this._meta.url;
        document.body.appendChild(scriptDom);
      }
    }).then((shaderMaterialDefine: ShaderMaterialDefine) => {
      const {
        vertexShader = "",
        fragmentShader = "",
        states = {},
        uniforms = {},
        attributes = {}
      } = shaderMaterialDefine;
      this._resource.uniforms = uniforms;
      this._resource.attributes = attributes;
      this._resource.vertexShader = vertexShader;
      this._resource.fragmentShader = fragmentShader;
      this._resource.renderStates = states;
    });
  }

  private createMaterial() {
    const material = new ShaderMaterial(this.meta.name || "shader_mtl");
    this._resource = material;
  }

  load(resourceLoader: any, assetConfig: AssetConfig, oasis: Oasis): Promise<ShaderMaterialResource> {
    this.setMeta(assetConfig);
    this.scripts = assetConfig.props.scripts;
    this.createMaterial();

    return this.loadShaderDefine(oasis).then(
      () =>
        new Promise((resolve, reject) => {
          try {
            for (let k in assetConfig.props) {
              this._resource[k] = assetConfig.props[k];
            }
            this._resource.updateTechnique();
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

  updateMeta(key: string, value: any) {
    super.updateMeta(key, value);
    if (key === "url") {
      this.loadShaderDefine().then(() => {
        try {
          this._resource.updateTechnique();
        } catch {
          console.error("[shader material] createTechnique error");
        }
      });
    }
  }

  update(key: string, value: any) {
    this._resource[key] = value;
    this._resource.updateTechnique();
  }
}
