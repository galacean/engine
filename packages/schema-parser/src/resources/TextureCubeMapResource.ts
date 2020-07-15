import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";
import { Oasis } from "../Oasis";
import { compressedTextureLoadOrder } from "../utils";

const imageOrderMap = {
  px: 0,
  nx: 1,
  py: 2,
  ny: 3,
  pz: 4,
  nz: 5
};

export class TextureCubeMapResource extends SchemaResource {
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig, oasis: Oasis): Promise<TextureCubeMapResource> {
    return new Promise((resolve, reject) => {
      const imageUrls = [];
      let resource;
      if (this.resourceManager.useCompressedTexture && assetConfig?.props?.compression?.compressions.length) {
        const rhi = oasis.engine._rhi;
        const compressions = assetConfig.props.compression.compressions;
        compressions.sort((a, b) => {
          return compressedTextureLoadOrder[a.type] - compressedTextureLoadOrder[b.type];
        });
        for (let i = 0; i < compressions.length; i++) {
          const compression = compressions[i];
          if (compression.container === "ktx" && rhi.canIUse(o3.GLCapabilityType[compression.type])) {
            for (const key in compression.files) {
              if (compression.files.hasOwnProperty(key)) {
                const image = compression.files[key];
                imageUrls[imageOrderMap[key]] = image.url;
              }
            }
            resource = new o3.Resource(assetConfig.name, {
              type: "ktxNew",
              urls: imageUrls
            });
            break;
          }
        }
      }
      if (!resource) {
        for (const key in assetConfig.props.images) {
          if (assetConfig.props.images.hasOwnProperty(key)) {
            const image = assetConfig.props.images[key];
            imageUrls[imageOrderMap[key]] = image.url;
          }
        }
        resource = new o3.Resource(assetConfig.name, {
          type: "cubemapNew",
          urls: imageUrls
        });
      }

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
      this.meta.name = this.resource.name;
    }
  }
}
