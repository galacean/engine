import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";
import { Oasis } from "../Oasis";
import { compressedTextureLoadOrder } from "../utils";

export class TextureResource extends SchemaResource {
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig, oasis: Oasis): Promise<TextureResource> {
    return new Promise((resolve, reject) => {
      let resource;
      let url;
      if (this.resourceManager.useCompressedTexture && assetConfig?.props?.compression?.compressions.length) {
        const rhi = oasis.engine._rhi;
        const compressions = assetConfig.props.compression.compressions;
        compressions.sort((a, b) => {
          return compressedTextureLoadOrder[a.type] - compressedTextureLoadOrder[b.type];
        });
        for (let i = 0; i < compressions.length; i++) {
          const compression = compressions[i];
          if (compression.container === "ktx" && rhi.canIUse(o3.GLCapabilityType[compression.type])) {
            url = compression.url;
            resource = new o3.Resource(assetConfig.name, { type: "ktxNew", url: compression.url });
            break;
          }
        }
      }

      if (!resource) {
        url = assetConfig.url;
        resource = new o3.Resource(assetConfig.name, { type: "textureNew", url: assetConfig.url });
      }
      resourceLoader.load(
        resource,
        (err, res) => {
          if (err) {
            reject(err);
          } else {
            this._resource = res.asset;
            this._meta.url = url;
            this.setMeta();
            resolve(this);
          }
        },
        oasis.options.timeout
      );
    });
  }

  setMeta() {
    if (this.resource) {
      this._meta.name = this.resource.name;
      if (this.resource.image) {
        this._meta.url = this.resource.image.src;
      }
    }
  }
}
