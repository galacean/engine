import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";
import { RequestConfig } from "@galacean/engine-core/types/asset/request";
import { Texture2DContentRestorer } from "./Texture2DContentRestorer";

@resourceLoader(AssetType.Texture2D, ["png", "jpg", "webp", "jpeg"])
class Texture2DLoader extends Loader<Texture2D> {
  override load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress) => {
      const url = item.url;
      const requestConfig = <RequestConfig>{
        ...item,
        type: "image"
      };
      resourceManager
        .request<HTMLImageElement>(url, requestConfig)
        .onProgress(setTaskCompleteProgress, setTaskDetailProgress)
        .then((image) => {
          const { format, mipmap, anisoLevel, wrapModeU, wrapModeV, filterMode } =
            (item.params as Partial<Texture2DParams>) ?? {};

          const texture = new Texture2D(resourceManager.engine, image.width, image.height, format, mipmap);

          texture.anisoLevel = anisoLevel ?? texture.anisoLevel;
          texture.filterMode = filterMode ?? texture.filterMode;
          texture.wrapModeU = wrapModeU ?? texture.wrapModeU;
          texture.wrapModeV = wrapModeV ?? texture.wrapModeV;

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
  /** Wrapping mode for texture coordinate S. */
  wrapModeU: TextureWrapMode;
  /** Wrapping mode for texture coordinate T. */
  wrapModeV: TextureWrapMode;
  /** Filter mode for texture. */
  filterMode: TextureFilterMode;
  /** Anisotropic level for texture. */
  anisoLevel: number;
}
