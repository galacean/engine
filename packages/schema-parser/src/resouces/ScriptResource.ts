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
        const scriptDom = document.createElement("script");
        this.setMeta();
        scriptDom.onload = () => {
          document.body.appendChild(scriptDom);
          resolve(this);
        };
        scriptDom.src = assetConfig.url;
      }
    });
  }

  setMeta() {
    if (this.resource) {
      this._meta.name = this.resource.name;
    }
  }
}
