import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";

export const scriptAbility = {};
export function script(name: string) {
  return (target: any) => {
    scriptAbility[name] = target;
  };
}
export class ScriptResource extends SchemaResource {
  private isInit = false;

  private initScriptContext() {
    if (this.isInit) {
      return;
    }
    this.isInit = true;
    (window as any).__r3_script_context__ = {
      r3: o3,
      script: (name: string) => {
        return (target: any) => {
          scriptAbility[name] = target;
        };
      }
    };
  }

  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<ScriptResource> {
    this.initScriptContext();
    return new Promise(resolve => {
      if (!this.resourceManager.isLocal) {
        const config = assetConfig as any;
        const name = config.props.scripts[0].name;
        const scriptDom = document.createElement("script");
        scriptDom.crossOrigin = "anonymous";
        this.setMeta(assetConfig);
        scriptDom.onload = () => {
          const scripts = (window as any).o3Scripts;
          this._resource = scripts && scripts[name];
          scriptAbility[name] = this._resource;
          resolve(this);
        };
        scriptDom.src = assetConfig.url;
        document.body.appendChild(scriptDom);
      } else {
        resolve(this);
      }
    });
  }

  setMeta(assetConfig?: AssetConfig) {
    if (assetConfig) {
      this._meta.name = assetConfig.name;
      this._meta.url = assetConfig.url;
      this._meta.source = assetConfig.source;
    }
  }
}
