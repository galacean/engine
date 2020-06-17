import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";
import { Oasis } from "../Oasis";

// https://github.com/BabylonJS/Babylon.js/blob/d780145531ac1b1cee85cbfba4d836dcc24ab58e/src/Engines/Extensions/engine.textureSelector.ts#L70
// Intelligently add supported compressed formats in order to check for.
// Check for ASTC support first as it is most powerful and to be very cross platform.
// Next PVRTC & DXT, which are probably superior to ETC1/2.
// Likely no hardware which supports both PVR & DXT, so order matters little.
// ETC2 is newer and handles ETC1 (no alpha capability), so check for first.
const loadOrder = {
  astc: 1,
  s3tc: 2,
  pvrtc: 3,
  etc: 4,
  etc1: 5
};

export class TextureResource extends SchemaResource {
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig, oasis: Oasis): Promise<TextureResource> {
    return new Promise((resolve, reject) => {
      let resource;
      let url;
      if (this.resourceManager.useCompressedTexture && assetConfig?.props?.compression?.compressions.length) {
        const rhi = oasis.engine.getRHI(oasis.canvas);
        const compressions = assetConfig.props.compression.compressions;
        compressions.sort((a, b) => {
          return loadOrder[a.type] - loadOrder[b.type];
        });
        for (let i = 0; i < compressions.length; i++) {
          const compression = compressions[i];
          if (compression.container === "ktx" && rhi.canIUse(o3.GLCapabilityType[compression.type])) {
            url = compression.url;
            resource = new o3.Resource(assetConfig.name, { type: compression.container, url: compression.url });
            break;
          }
        }
      }

      if (!resource) {
        url = assetConfig.url;
        resource = new o3.Resource(assetConfig.name, { type: assetConfig.type as any, url: assetConfig.url });
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
