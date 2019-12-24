import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3-plus";
import { ResourceLoader } from "@alipay/o3";
import { LoadAttachedResourceResult, AssetConfig } from "../types";

export class ScriptResource extends SchemaResource {
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<ScriptResource> {
    // todo
    return new Promise(resolve => {
      this._resource = { name: assetConfig.name };
      this.setMeta();
      resolve(this);
    });
  }

  loadWithAttachedResources(
    resourceLoader: ResourceLoader,
    assetConfig: AssetConfig
  ): Promise<LoadAttachedResourceResult> {
    return new Promise(resolve => {
      this.load(resourceLoader, assetConfig).then(() => {
        resolve({
          resources: [this],
          structure: {
            index: 0,
            props: {}
          }
        });
      });
    });
  }

  setMeta() {
    if (this.resource) {
      this._meta.name = this.resource.name;
    }
  }
}
