import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  RequestConfig,
  ResourceManager,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureUtils,
  TextureWrapMode,
  resourceLoader
} from "@galacean/engine-core";
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
        // @ts-ignore
        ._request<HTMLImageElement>(url, requestConfig)
        .onProgress(setTaskCompleteProgress, setTaskDetailProgress)
        .then((image) => {
          const { format, anisoLevel, wrapModeU, wrapModeV, filterMode, isSRGBColorSpace, mipmap } =
            (item.params as Partial<Texture2DParams>) ?? {};
          const { width, height } = image;
          // @ts-ignore
          const isWebGL2 = resourceManager.engine._hardwareRenderer._isWebGL2;

          const generateMipmap = TextureUtils.supportGenerateMipmapsWithCorrection(
            width,
            height,
            format,
            mipmap,
            isSRGBColorSpace,
            isWebGL2
          );

          const texture = new Texture2D(
            resourceManager.engine,
            width,
            height,
            format,
            generateMipmap,
            isSRGBColorSpace
          );

          texture.anisoLevel = anisoLevel ?? texture.anisoLevel;
          texture.filterMode = filterMode ?? texture.filterMode;
          texture.wrapModeU = wrapModeU ?? texture.wrapModeU;
          texture.wrapModeV = wrapModeV ?? texture.wrapModeV;

          texture.setImageSource(image);
          generateMipmap && texture.generateMipmaps();

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
  /** Whether the texture data is in sRGB color space, otherwise is linear color space. @defaultValue `true` */
  isSRGBColorSpace: boolean;
}
