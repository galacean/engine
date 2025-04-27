import {
  AssetPromise,
  AssetType,
  ContentRestorer,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  Texture2D
} from "@galacean/engine-core";
import { parseSingleKTX } from "./compressed-texture";

@resourceLoader(AssetType.KTX, ["ktx"])
export class KTXLoader extends Loader<Texture2D> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    return new AssetPromise((resolve, reject) => {
      const request = this.request;
      request<ArrayBuffer>(item.url, {
        ...item,
        type: "arraybuffer"
      })
        .then((bin) => {
          const parsedData = parseSingleKTX(bin);
          const { width, height, mipmaps, engineFormat } = parsedData;
          const mipmap = mipmaps.length > 1;
          const texture = new Texture2D(resourceManager.engine, width, height, engineFormat, mipmap);

          for (let miplevel = 0; miplevel < mipmaps.length; miplevel++) {
            const { width, height, data } = mipmaps[miplevel];
            texture.setPixelBuffer(data, miplevel, 0, 0, width, height);
          }
          resourceManager.addContentRestorer(
            new (class extends ContentRestorer<Texture2D> {
              restoreContent() {
                return new AssetPromise<Texture2D>((resolve, reject) => {
                  request<ArrayBuffer>(item.url, {
                    ...item,
                    type: "arraybuffer"
                  })
                    .then((bin) => {
                      const mipmaps = parseSingleKTX(bin).mipmaps;
                      const texture = this.resource;
                      for (let miplevel = 0; miplevel < mipmaps.length; miplevel++) {
                        const { width, height, data } = mipmaps[miplevel];
                        texture.setPixelBuffer(data, miplevel, 0, 0, width, height);
                      }
                      resolve(texture);
                    })
                    .catch((e) => {
                      reject(e);
                    });
                });
              }
            })(texture)
          );
          resolve(texture);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
