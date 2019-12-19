import { SchemaResource } from "./SchemaResource";
import { ResourceManager } from "../ResourceManager";
import * as o3 from "@alipay/o3";

export class TextureResource extends SchemaResource {
  load(resourceLoader: o3.ResourceLoader): Promise<TextureResource> {
    const assetConfig = this.assetConfig;
    return new Promise((resolve, reject) => {
      const resource = new o3.Resource(assetConfig.name, { type: assetConfig.type as any, url: assetConfig.url });
      resourceLoader.load(resource, (err, res) => {
        if (err) {
          reject(err);
        } else {
          this._resource = res;
          resolve(this);
        }
      });
    });
  }
}
