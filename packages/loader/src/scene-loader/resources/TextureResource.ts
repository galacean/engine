import { GLCapabilityType, ResourceManager } from "@oasis-engine/core";
import { Oasis } from "../Oasis";
import { AssetConfig } from "../types";
import { compressedTextureLoadOrder } from "../utils";
import { SchemaResource } from "./SchemaResource";

export class TextureResource extends SchemaResource {
  load(resourceManager: ResourceManager, assetConfig: AssetConfig, oasis: Oasis): Promise<TextureResource> {
    return new Promise((resolve, reject) => {
      let url: string;
      if (this.resourceManager.useCompressedTexture && assetConfig?.props?.compression?.compressions.length) {
        const rhi = oasis.engine._hardwareRenderer;
        const compressions = assetConfig.props.compression.compressions;
        compressions.sort((a: any, b: any) => compressedTextureLoadOrder[a.type] - compressedTextureLoadOrder[b.type]);
        for (let i = 0; i < compressions.length; i++) {
          const compression = compressions[i];
          if (compression.container === "ktx" && rhi.canIUse(GLCapabilityType[compression.type])) {
            url = compression.url;
            break;
          }
        }
      }

      url = url ?? assetConfig.url;

      resourceManager
        .load(url)
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
      if (this.resource.image) {
        this._meta.url = this.resource.image.src;
      }
    }
  }
}
