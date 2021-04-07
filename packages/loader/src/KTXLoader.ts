import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  Texture,
  Texture2D,
  TextureCubeFace,
  TextureCubeMap
} from "@oasis-engine/core";
import { khronosTextureContainerParser } from "./compressed-texture/KhronosTextureContainer";

@resourceLoader(AssetType.KTX, ["ktx"])
export class KTXLoader extends Loader<Texture> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture> {
    return new AssetPromise((resolve, reject) => {
      this.request<ArrayBuffer>(item.url, {
        ...item,
        type: "arraybuffer"
      })
        .then((bin) => {
          const engine = resourceManager.engine;
          const parsedData = khronosTextureContainerParser.parse(bin);
          const { pixelWidth, pixelHeight, numberOfFaces, mipmaps, engineFormat, numberOfMipmapLevels } = parsedData;
          const useMipmap = numberOfMipmapLevels > 1;

          if (numberOfFaces === 1) {
            const texture = new Texture2D(engine, pixelWidth, pixelHeight, engineFormat, useMipmap);

            for (let miplevel = 0; miplevel < numberOfMipmapLevels; miplevel++) {
              const { width, height, data } = mipmaps[miplevel];
              texture.setPixelBuffer(data, miplevel, 0, 0, width, height);
            }

            resolve(texture);
          } else if (numberOfFaces === 6) {
            const texture = new TextureCubeMap(engine, pixelWidth, engineFormat, useMipmap);

            for (let miplevel = 0; miplevel < numberOfMipmapLevels; miplevel++) {
              for (let face = 0; face < 6; face++) {
                const { data, width, height } = mipmaps[miplevel * 6 + face];
                texture.setPixelBuffer(TextureCubeFace.PositiveX + face, data, miplevel, 0, 0, width, height);
              }
            }

            resolve(texture);
          }
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
