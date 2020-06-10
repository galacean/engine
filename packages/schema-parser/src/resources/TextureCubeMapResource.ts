import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { TextureResource } from "./TextureResource";
import { AssetConfig } from "../types";

const imageOrderMap = {
  px: 0,
  nx: 1,
  py: 2,
  ny: 3,
  pz: 4,
  nz: 5
};

export class TextureCubeMapResource extends SchemaResource {
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<TextureCubeMapResource> {
    return new Promise((resolve, reject) => {
      const imageUrls = [];
      for (const key in assetConfig.props) {
        if (assetConfig.props.hasOwnProperty(key)) {
          const element = assetConfig.props[key];
          imageUrls[imageOrderMap[key]] = element.url;
        }
      }
      resourceLoader.load(
        new o3.Resource(assetConfig.name, {
          type: "cubemap",
          urls: imageUrls
        }),
        (err, res) => {
          if (err) {
            reject(err);
          } else {
            this._resource = res.asset;
            this.setMeta();
            resolve(this);
          }
        }
      );
    });
  }

  setMeta() {
    if (this.resource) {
      this.meta.name = this.resource.name;
    }
  }
}
