import { AssetType, GLCapabilityType, ResourceManager } from "@oasis-engine/core";
import { Oasis } from "../Oasis";
import { AssetConfig } from "../types";
import { SchemaResource } from "./SchemaResource";

const imageOrderMap = {
  px: 0,
  nx: 1,
  py: 2,
  ny: 3,
  pz: 4,
  nz: 5
};

export class TextureCubeMapResource extends SchemaResource {
  load(resourceManager: ResourceManager, assetConfig: AssetConfig, oasis: Oasis): Promise<TextureCubeMapResource> {
    return new Promise((resolve, reject) => {
      const imageUrls = [];
      let type = AssetType.TextureCube;
      if (this.resourceManager.useCompressedTexture && assetConfig?.props?.compression?.compressions.length) {
        const rhi = oasis.engine._hardwareRenderer;
        const compressions = assetConfig.props.compression.compressions;
        for (let i = 0; i < compressions.length; i++) {
          const compression = compressions[i];
          if (compression.container === "ktx" && rhi.canIUse(GLCapabilityType[compression.type])) {
            for (const key in compression.files) {
              if (compression.files.hasOwnProperty(key)) {
                const image = compression.files[key];
                imageUrls[imageOrderMap[key]] = image.url;
              }
            }
            console.warn(compression.type);
            type = AssetType.KTX;
            break;
          }
        }
      }

      if (type === AssetType.TextureCube) {
        for (const key in assetConfig.props.images) {
          if (assetConfig.props.images.hasOwnProperty(key)) {
            const image = assetConfig.props.images[key];
            imageUrls[imageOrderMap[key]] = image.url;
          }
        }
      }

      resourceManager
        .load({
          urls: imageUrls,
          type: type
        })
        .then((res) => {
          this._resource = res;
          resolve(this);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }

  setMeta() {
    if (this.resource) {
      this.meta.name = this.resource.name;
    }
  }
}
