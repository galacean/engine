import {
  AssetPromise,
  AssetType,
  ContentRestorer,
  LoadItem,
  Loader,
  RequestConfig,
  ResourceManager,
  SystemInfo,
  Texture,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureUtils,
  TextureWrapMode,
  resourceLoader
} from "@galacean/engine-core";
import { decode } from "./resource-deserialize";
import { FileHeader } from "./resource-deserialize/utils/FileHeader";
import { HDRDecoder } from "./HDRDecoder";

@resourceLoader(AssetType.Texture, ["tex", "png", "jpg", "webp", "jpeg", "hdr"])
class TextureLoader extends Loader<Texture> {
  override load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture> {
    const url = item.url;
    const requestConfig = <RequestConfig>{ ...item, type: "arraybuffer" };
    return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress) => {
      resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(url, requestConfig)
        .onProgress(setTaskCompleteProgress, setTaskDetailProgress)
        .then((buffer) => {
          this._decode(buffer, item, resourceManager).then((texture) => {
            resourceManager.addContentRestorer(new TextureContentRestorer(texture, url, requestConfig));
            resolve(texture);
          }, reject);
        })
        .catch(reject);
    });
  }

  private _decode(buffer: ArrayBuffer, item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture> {
    if (FileHeader.checkMagic(buffer)) {
      return decode<Texture>(buffer, resourceManager.engine);
    }

    const bufferView = new Uint8Array(buffer);
    const isHDR = bufferView[0] === 0x23 && bufferView[1] === 0x3f;

    if (isHDR) {
      return this._decodeHDR(bufferView, item, resourceManager);
    }
    return this._decodeImage(buffer, item, resourceManager);
  }

  private _decodeHDR(buffer: Uint8Array, item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    return new AssetPromise((resolve, reject) => {
      const engine = resourceManager.engine;
      if (!SystemInfo.supportsTextureFormat(engine, TextureFormat.R16G16B16A16)) {
        reject(new Error("TextureLoader: HDR texture requires half float support."));
        return;
      }
      const { width, height, pixels } = HDRDecoder.decode(buffer);
      const { mipmap = true } = (item.params as Partial<TextureParams>) ?? {};

      const texture = new Texture2D(engine, width, height, TextureFormat.R16G16B16A16, mipmap, false);
      texture.setPixelBuffer(pixels);
      mipmap && texture.generateMipmaps();
      this._applyParams(texture, item);
      resolve(texture);
    });
  }

  private _decodeImage(buffer: ArrayBuffer, item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    return decodeImage(buffer, item.url!).then((img) => {
      const {
        format = TextureFormat.R8G8B8A8,
        isSRGBColorSpace = true,
        mipmap = true
      } = (item.params as Partial<TextureParams>) ?? {};

      const engine = resourceManager.engine;
      const { width, height } = img;
      const generateMipmap = TextureUtils.supportGenerateMipmapsWithCorrection(
        engine,
        width,
        height,
        format,
        mipmap,
        isSRGBColorSpace
      );

      const texture = new Texture2D(engine, width, height, format, generateMipmap, isSRGBColorSpace);
      texture.setImageSource(img);
      generateMipmap && texture.generateMipmaps();
      this._applyParams(texture, item);
      return texture;
    });
  }

  private _applyParams(texture: Texture2D, item: LoadItem): void {
    const { anisoLevel, wrapModeU, wrapModeV, filterMode } = (item.params as Partial<TextureParams>) ?? {};
    texture.anisoLevel = anisoLevel ?? texture.anisoLevel;
    texture.filterMode = filterMode ?? texture.filterMode;
    texture.wrapModeU = wrapModeU ?? texture.wrapModeU;
    texture.wrapModeV = wrapModeV ?? texture.wrapModeV;

    const url = item.url;
    if (url.indexOf("data:") !== 0) {
      texture.name = url.substring(url.lastIndexOf("/") + 1);
    }
  }
}

class TextureContentRestorer extends ContentRestorer<Texture> {
  constructor(
    resource: Texture,
    public url: string,
    public requestConfig: RequestConfig
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<Texture> {
    return (
      this.resource.engine.resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(this.url, this.requestConfig)
        .then((buffer) => {
          if (FileHeader.checkMagic(buffer)) {
            return decode<Texture>(buffer, this.resource.engine, this.resource);
          }

          const bufferView = new Uint8Array(buffer);
          const texture = this.resource as Texture2D;

          if (bufferView[0] === 0x23 && bufferView[1] === 0x3f) {
            const { pixels } = HDRDecoder.decode(bufferView);
            texture.setPixelBuffer(pixels);
            texture.mipmapCount > 1 && texture.generateMipmaps();
            return texture;
          }

          return decodeImage(buffer, this.url).then((img) => {
            texture.setImageSource(img);
            texture.mipmapCount > 1 && texture.generateMipmaps();
            return texture;
          });
        })
    );
  }
}

function decodeImage(buffer: ArrayBuffer, url: string): AssetPromise<HTMLImageElement> {
  return new AssetPromise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(new Blob([buffer]));
    const image = new Image();
    const releaseObjectUrl = () => URL.revokeObjectURL(objectUrl);
    image.onload = () => {
      releaseObjectUrl();
      resolve(image);
    };
    image.onerror = () => {
      releaseObjectUrl();
      reject(new Error(`TextureLoader: failed to decode texture "${url}" (${buffer.byteLength} bytes).`));
    };
    image.src = objectUrl;
  });
}

/**
 * Texture loader params interface.
 */
export interface TextureParams {
  /** Texture format. default `TextureFormat.R8G8B8A8` */
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
  /** Whether the texture data is in sRGB color space. @defaultValue `true` */
  isSRGBColorSpace: boolean;
}
