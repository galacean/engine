import {
  AssetPromise,
  AssetType,
  ContentRestorer,
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
import { decode } from "./resource-deserialize";
import { FileHeader } from "./resource-deserialize/utils/FileHeader";

function loadImageFromBuffer(buffer: ArrayBuffer): AssetPromise<HTMLImageElement> {
  return new AssetPromise((resolve, reject) => {
    const blob = new Blob([buffer]);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

@resourceLoader(AssetType.Texture2D, ["png", "jpg", "webp", "jpeg", "tex"])
class Texture2DLoader extends Loader<Texture2D> {
  override load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    const url = item.url;
    const requestConfig = <RequestConfig>{ ...item, type: "arraybuffer" };
    return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress) => {
      resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(url, requestConfig)
        .onProgress(setTaskCompleteProgress, setTaskDetailProgress)
        .then((buffer) => {
          if (FileHeader.checkMagic(buffer)) {
            decode<Texture2D>(buffer, resourceManager.engine).then((texture) => {
              resourceManager.addContentRestorer(new Texture2DContentRestorer(texture, url, requestConfig));
              resolve(texture);
            }, reject);
          } else {
            loadImageFromBuffer(buffer).then((img) => {
              const texture = this._createTexture(img, item, resourceManager);
              resourceManager.addContentRestorer(new Texture2DContentRestorer(texture, url, requestConfig));
              resolve(texture);
            }, reject);
          }
        })
        .catch(reject);
    });
  }

  private _createTexture(img: HTMLImageElement, item: LoadItem, resourceManager: ResourceManager): Texture2D {
    const {
      format = TextureFormat.R8G8B8A8,
      anisoLevel,
      wrapModeU,
      wrapModeV,
      filterMode,
      isSRGBColorSpace = true,
      mipmap = true
    } = (item.params as Partial<Texture2DParams>) ?? {};
    const { width, height } = img;
    const engine = resourceManager.engine;

    const generateMipmap = TextureUtils.supportGenerateMipmapsWithCorrection(
      engine,
      width,
      height,
      format,
      mipmap,
      isSRGBColorSpace
    );

    const texture = new Texture2D(engine, width, height, format, generateMipmap, isSRGBColorSpace);
    texture.anisoLevel = anisoLevel ?? texture.anisoLevel;
    texture.filterMode = filterMode ?? texture.filterMode;
    texture.wrapModeU = wrapModeU ?? texture.wrapModeU;
    texture.wrapModeV = wrapModeV ?? texture.wrapModeV;
    texture.setImageSource(img);
    generateMipmap && texture.generateMipmaps();

    const url = item.url;
    if (url.indexOf("data:") !== 0) {
      texture.name = url.substring(url.lastIndexOf("/") + 1);
    }

    return texture;
  }
}

class Texture2DContentRestorer extends ContentRestorer<Texture2D> {
  constructor(
    resource: Texture2D,
    public url: string,
    public requestConfig: RequestConfig
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<Texture2D> {
    const texture = this.resource;
    const engine = texture.engine;
    return (
      engine.resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(this.url, this.requestConfig)
        .then((buffer) => {
          if (FileHeader.checkMagic(buffer)) {
            return decode<Texture2D>(buffer, engine, texture);
          } else {
            return loadImageFromBuffer(buffer).then((img) => {
              texture.setImageSource(img);
              texture.generateMipmaps();
              return texture;
            });
          }
        })
    );
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
