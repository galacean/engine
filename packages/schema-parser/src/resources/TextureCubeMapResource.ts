import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";
import { Oasis } from "../Oasis";
import _ from "lodash";
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
        const rhi = oasis.engine.getRHI(oasis.canvas);
        const compressions = assetConfig.props.compression.compressions;
        compressions.sort((a, b) => {
          return compressedTextureLoadOrder[a.type] - compressedTextureLoadOrder[b.type];
        });
        for (let i = 0; i < compressions.length; i++) {
          const compression = compressions[i];
          if (compression.container === "ktx" && rhi.canIUse(o3.GLCapabilityType[compression.type])) {
            _.forEach(compression.files, (image, key) => {
              imageUrls[imageOrderMap[key]] = image.url;
            });
            resource = new o3.Resource(assetConfig.name, {
              type: compression.container,
              urls: imageUrls
            });
            break;
          }
        }
      }
      if (!resource) {
        _.forEach(assetConfig.props.images, (image, key) => {
          imageUrls[imageOrderMap[key]] = image.url;
        });
        resource = new o3.Resource(assetConfig.name, {
          type: "cubemap",
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
