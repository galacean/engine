import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";

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

  setMeta() {
    if (this.resource) {
      this._meta.name = this.resource.name;
      this._meta.url = this.resource.image.src;
    }
  }
}
