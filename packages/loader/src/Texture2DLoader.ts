import {
  AssetPromise,
  AssetType,
  ContentRestoreInfo,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
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

          this.addContentRestoreInfo(texture, new Texture2DContentRestorer(url, requestConfig));
          resolve(texture);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }

  restore(host: Texture2D, restoreContentInfo: Texture2DContentRestorer): AssetPromise<Texture2D> {
    return new AssetPromise((resolve, reject) => {
      this.request<HTMLImageElement>(restoreContentInfo.url, restoreContentInfo.requestConfig)
        .then((image) => {
          host.setImageSource(image);
          host.generateMipmaps();
          resolve(host);
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

class Texture2DContentRestorer extends ContentRestoreInfo {
  constructor(public url: string, public requestConfig: RequestConfig) {
    super();
  }
}
