import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  RestoreContentInfo,
  Texture2D,
  TextureFormat
} from "@oasis-engine/core";
import { RequestConfig } from "@oasis-engine/core/types/asset/request";

@resourceLoader(AssetType.Texture2D, ["png", "jpg", "webp", "jpeg"])
class Texture2DLoader extends Loader<Texture2D> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    return new AssetPromise((resolve, reject) => {
      const url = item.url;
      const requestConfig = <RequestConfig>{
        ...item,
        type: "image"
      };
      this.request<HTMLImageElement>(url, requestConfig)
        .then((image) => {
          const params = item.params;
          const texture = new Texture2D(
            resourceManager.engine,
            image.width,
            image.height,
            params?.format,
            params?.mipmap
          );
          // @ts-ignore
          if (!texture._platformTexture) return;

          texture.setImageSource(image);
          texture.generateMipmaps();

          if (url.indexOf("data:") !== 0) {
            const splitPath = url.split("/");
            texture.name = splitPath[splitPath.length - 1];
          }

          // @ts-ignore
          resourceManager._addRestoreContentInfo(new Texture2DContentRestorer(texture, url, requestConfig));

          resolve(texture);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}

class Texture2DContentRestorer extends RestoreContentInfo {
  constructor(public texture: Texture2D, public url: string, public requestConfig: RequestConfig) {
    super(texture);
  }

  restoreContent(): AssetPromise<Texture2D> {
    return new AssetPromise((resolve, reject) => {
      this.request<HTMLImageElement>(this.url, this.requestConfig)
        .then((image) => {
          const texture = this.texture;
          texture.setImageSource(image);
          texture.generateMipmaps();
          resolve(texture);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}

/**
 * Texture2D loader params interface.
 */
export interface Texture2DParams {
  /** Texture format. default  `TextureFormat.R8G8B8A8` */
  format: TextureFormat;
  /** Whether to use multi-level texture, default is true. */
  mipmap: boolean;
}
