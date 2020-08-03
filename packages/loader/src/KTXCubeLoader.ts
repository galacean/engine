import { resourceLoader, Loader, AssetPromise, AssetType, LoadItem, ResourceManager } from "@alipay/o3-core";
import { Texture2D, TextureCubeMap } from "@alipay/o3-material";
import { TextureCubeFace } from "@alipay/o3-core";
import { parseCubeKTX } from "./compressed-texture";

@resourceLoader(AssetType.KTXCube, [])
class KTXCubeLoader extends Loader<TextureCubeMap> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<TextureCubeMap> {
    return new AssetPromise((resolve, reject) => {
      Promise.all(
        item.urls.map((url) =>
          this.request<ArrayBuffer>(url, {
            ...item,
            type: "arraybuffer"
          })
        )
      )
        .then((data) => {
          const parsedData = parseCubeKTX(data);
          const { width, mipmapsFaces, engineFormat } = parsedData;
          const texture = new TextureCubeMap(width, engineFormat, true, resourceManager.engine);

          if (!texture._glTexture) return;

          for (let face = 0; face < 6; face++) {
            const length = mipmapsFaces[face].length;

            for (let miplevel = 0; miplevel < length; miplevel++) {
              const { data, width, height } = mipmapsFaces[face][miplevel];

              texture.setPixelBuffer(TextureCubeFace.PositiveX + face, data, miplevel, 0, 0, width, height);
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
