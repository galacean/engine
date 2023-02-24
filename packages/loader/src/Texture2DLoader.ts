import {
  AssetPromise,
  AssetType,
  ContentRestorer,
  Loader,
  LoadItem,
  request,
  resourceLoader,
  ResourceManager,
  Texture2D,
  TextureFormat
} from "@oasis-engine/core";
import { RequestConfig } from "@oasis-engine/core/types/asset/request";

@resourceLoader(AssetType.Texture2D, ["png", "jpg", "webp", "jpeg"])
class Texture2DLoader extends Loader<Texture2D> {
  /**
   * @override
   */
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

          texture.setImageSource(image);
          texture.generateMipmaps();

          if (url.indexOf("data:") !== 0) {
            const index = url.lastIndexOf("/");
            texture.name = url.substring(index + 1);
          }

          resourceManager.addContentRestorer(new Texture2DContentRestorer(texture, url, requestConfig));
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

class Texture2DContentRestorer extends ContentRestorer<Texture2D> {
  constructor(resource: Texture2D, public url: string, public requestConfig: RequestConfig) {
    super(resource);
  }

  /**
   * @override
   */
  restoreContent(): AssetPromise<Texture2D> {
    return request<HTMLImageElement>(this.url, this.requestConfig).then((image) => {
      const resource = this.resource;
      resource.setImageSource(image);
      resource.generateMipmaps();
      return resource;
    });
  }
}
