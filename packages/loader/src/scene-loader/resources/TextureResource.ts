import { AssetType, GLCapabilityType, ResourceManager } from "@oasis-engine/core";
import { Oasis } from "../Oasis";
import { AssetConfig } from "../types";
import { SchemaResource } from "./SchemaResource";

export class TextureResource extends SchemaResource {
  load(resourceManager: ResourceManager, assetConfig: AssetConfig, oasis: Oasis): Promise<TextureResource> {
    return new Promise((resolve, reject) => {
      let url: string;
      let assetType = AssetType.Texture2D;
      if (this.resourceManager.useCompressedTexture && assetConfig?.props?.compression?.compressions.length) {
        const rhi = oasis.engine._hardwareRenderer;
        const compressions = assetConfig.props.compression.compressions;
        for (let i = 0; i < compressions.length; i++) {
          const compression = compressions[i];
          if (compression.container === "ktx" && rhi.canIUse(GLCapabilityType[compression.type])) {
            url = compression.url;
            assetType = AssetType.KTX;
            break;
          }
        }
      }

      url = url ?? assetConfig.url;

      resourceManager
        .load({ url, type: assetType })
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
      this._meta.name = this.resource.name;
    }
  }
}
