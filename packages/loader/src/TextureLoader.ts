import {
  AssetPromise,
  AssetType,
  ContentRestorer,
  Engine,
  LoadItem,
  Loader,
  RequestConfig,
  ResourceManager,
  Texture,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  resourceLoader
} from "@galacean/engine-core";
import { decode } from "./resource-deserialize";
import { FileHeader } from "./resource-deserialize/utils/FileHeader";
import { HDRDecoder } from "./HDRDecoder";
import { ImageDecoder } from "./ImageDecoder";

@resourceLoader(AssetType.Texture, ["tex", "png", "jpg", "webp", "jpeg", "hdr"])
class TextureLoader extends Loader<Texture> {
  override load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture> {
    const url = item.url!;
    const remoteUrl = resourceManager._getRemoteUrl(url);
    const requestConfig = <RequestConfig>{ ...item, type: "arraybuffer" };
    return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress) => {
      resourceManager
        ._requestByRemoteUrl<ArrayBuffer>(remoteUrl, requestConfig)
        .onProgress(setTaskCompleteProgress, setTaskDetailProgress)
        .then((buffer) => decodeTexture(resourceManager.engine, buffer, url, item.params as Partial<TextureParams>))
        .then((texture) => {
          resourceManager.addContentRestorer(new TextureContentRestorer(texture, url, remoteUrl, requestConfig));
          resolve(texture);
        })
        .catch(reject);
    });
  }
}

class TextureContentRestorer extends ContentRestorer<Texture> {
  constructor(
    resource: Texture,
    public url: string,
    public remoteUrl: string,
    public requestConfig: RequestConfig
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<Texture> {
    const engine = this.resource.engine;
    return engine.resourceManager
      ._requestByRemoteUrl<ArrayBuffer>(this.remoteUrl, this.requestConfig)
      .then((buffer) => decodeTexture(engine, buffer, this.url, undefined, this.resource));
  }
}

function decodeTexture(
  engine: Engine,
  buffer: ArrayBuffer,
  url: string,
  params?: Partial<TextureParams>,
  restoredTexture?: Texture
): AssetPromise<Texture> {
  if (FileHeader.checkMagic(buffer)) {
    return decode<Texture>(buffer, engine, restoredTexture);
  }

  const getTexture = (width: number, height: number, format: TextureFormat, isSRGBColorSpace: boolean): Texture2D => {
    if (restoredTexture) {
      return restoredTexture as Texture2D;
    }
    const { mipmap = true, anisoLevel, wrapModeU, wrapModeV, filterMode } = params ?? {};
    const generateMipmap = mipmap && engine._hardwareRenderer.supportsGenerateMipmaps(format, isSRGBColorSpace);
    const texture = new Texture2D(engine, width, height, format, generateMipmap, isSRGBColorSpace);
    if (anisoLevel !== undefined) texture.anisoLevel = anisoLevel;
    if (filterMode !== undefined) texture.filterMode = filterMode;
    if (wrapModeU !== undefined) texture.wrapModeU = wrapModeU;
    if (wrapModeV !== undefined) texture.wrapModeV = wrapModeV;
    if (url.indexOf("data:") !== 0) {
      texture.name = url.substring(url.lastIndexOf("/") + 1);
    }
    return texture;
  };

  const bufferView = new Uint8Array(buffer);
  if (bufferView[0] === 0x23 && bufferView[1] === 0x3f) {
    return new AssetPromise((resolve) => {
      const { width, height, pixels } = HDRDecoder.decode(bufferView);
      const texture = getTexture(width, height, TextureFormat.R16G16B16A16_SFloat, false);
      texture.setPixelBuffer(pixels);
      texture.generateMipmaps();
      resolve(texture);
    });
  }

  return ImageDecoder._decode(buffer, url).then((img) => {
    const { format = TextureFormat.R8G8B8A8_UNorm, isSRGBColorSpace = true } = params ?? {};
    const texture = getTexture(img.width, img.height, format, isSRGBColorSpace);
    texture.setImageSource(img);
    texture.generateMipmaps();
    return texture;
  });
}

/**
 * Texture loader params interface.
 */
export interface TextureParams {
  /** Texture format. default `TextureFormat.R8G8B8A8_UNorm` */
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
