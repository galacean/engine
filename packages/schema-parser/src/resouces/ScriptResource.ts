import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";

export class ScriptResource extends SchemaResource {
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<ScriptResource> {
    // todo
    return new Promise(resolve => {
      this._resource = { name: assetConfig.name };
      this.setMeta();
      resolve(this);
    });
  }

  setMeta() {
    if (this.resource) {
      this._meta.name = this.resource.name;
    }
  }
}
