import { AssetPromise, AssetType, Loader, LoadItem, resourceLoader, ResourceManager, Texture2D } from "@alipay/o3-core";
import { parseSingleKTX } from "./compressed-texture";

@resourceLoader(AssetType.KTX, ["ktx"])
export class KTXLoader extends Loader<Texture2D> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    return new AssetPromise((resolve, reject) => {
      this.request<ArrayBuffer>(item.url, {
        ...item,
        type: "arraybuffer"
      })
        .then((bin) => {
          const parsedData = parseSingleKTX(bin);
          const { width, height, mipmaps, engineFormat } = parsedData;
          const texture = new Texture2D(width, height, engineFormat, undefined, resourceManager.engine);

          if (texture._glTexture) {
            for (let miplevel = 0; miplevel < mipmaps.length; miplevel++) {
              const { width, height, data } = mipmaps[miplevel];
              texture.setPixelBuffer(data, miplevel, 0, 0, width, height);
            }
          }
          resolve(texture);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
