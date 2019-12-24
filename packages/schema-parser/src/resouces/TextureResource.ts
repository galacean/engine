import { SchemaResource } from "./SchemaResource";
import { ResourceManager } from "../ResourceManager";
import * as o3 from "@alipay/o3";
import { AssetConfig, LoadAttachedResourceResult } from "../types";
import { ResourceLoader } from "@alipay/o3";

export class TextureResource extends SchemaResource {
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<TextureResource> {
    return new Promise((resolve, reject) => {
      const resource = new o3.Resource(assetConfig.name, { type: assetConfig.type as any, url: assetConfig.url });
      resourceLoader.load(resource, (err, res) => {
        if (err) {
          reject(err);
        } else {
          this._resource = res.asset;
          this.setMeta();
          resolve(this);
        }
      });
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
      this._meta.url = this.resource.image.src;
    }
    console.log("meta", this._meta);
  }
}
