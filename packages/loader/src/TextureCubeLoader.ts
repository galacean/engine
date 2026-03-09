import {
  AssetPromise,
  AssetType,
  ContentRestorer,
  LoadItem,
  Loader,
  RequestConfig,
  ResourceManager,
  SystemInfo,
  TextureCube,
  TextureCubeFace,
  TextureFormat,
  TextureUtils,
  request,
  resourceLoader
} from "@galacean/engine-core";
import { HDRDecoder } from "./HDRDecoder";

@resourceLoader(AssetType.TextureCube, ["texCube", "hdr"])
class TextureCubeLoader extends Loader<TextureCube> {
  override load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<TextureCube> {
    if (item.urls) {
      return this._loadCubeFaces(item, resourceManager);
    } else {
      return this._loadHDR(item, resourceManager);
    }
  }

  private _loadHDR(item: LoadItem, resourceManager: ResourceManager): AssetPromise<TextureCube> {
    return new AssetPromise((resolve, reject) => {
      const engine = resourceManager.engine;
      const url = item.url;
      const requestConfig = { ...item, type: "arraybuffer" } as RequestConfig;
      resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(url, requestConfig)
        .then((buffer) => {
          if (!SystemInfo.supportsTextureFormat(engine, TextureFormat.R16G16B16A16)) {
            reject(new Error("TextureCubeLoader: HDR texture requires half float support."));
            return;
          }
          const { mipmap = true, anisoLevel, wrapModeU, wrapModeV, filterMode } = item.params ?? {};
          const { cubeSize, faceBuffers } = HDRDecoder.decode(buffer);
          const texture = new TextureCube(engine, cubeSize, TextureFormat.R16G16B16A16, mipmap, false);
          for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            texture.setPixelBuffer(TextureCubeFace.PositiveX + faceIndex, faceBuffers[faceIndex], 0);
          }
          if (mipmap) {
            texture.generateMipmaps();
          }
          texture.anisoLevel = anisoLevel ?? texture.anisoLevel;
          texture.filterMode = filterMode ?? texture.filterMode;
          texture.wrapModeU = wrapModeU ?? texture.wrapModeU;
          texture.wrapModeV = wrapModeV ?? texture.wrapModeV;
          resourceManager.addContentRestorer(new HDRContentRestorer(texture, url, requestConfig, mipmap));
          resolve(texture);
        })
        .catch(reject);
    });
  }

  private _loadCubeFaces(item: LoadItem, resourceManager: ResourceManager): AssetPromise<TextureCube> {
    return new AssetPromise((resolve, reject) => {
      const urls = item.urls;
      const requestConfig = <RequestConfig>{
        ...item,
        type: "image"
      };

      // @ts-ignore
      Promise.all(urls.map((url) => resourceManager._request<HTMLImageElement>(url, requestConfig)))
        .then((images) => {
          const {
            format = TextureFormat.R8G8B8A8,
            anisoLevel,
            wrapModeU,
            wrapModeV,
            filterMode,
            isSRGBColorSpace = true,
            mipmap = true
          } = item.params ?? {};
          const { width, height } = images[0];

          if (width !== height) {
            reject(new Error("The cube texture must have the same width and height"));
            return;
          }

          const engine = resourceManager.engine;

          const generateMipmap = TextureUtils.supportGenerateMipmapsWithCorrection(
            engine,
            width,
            height,
            format,
            mipmap,
            isSRGBColorSpace
          );

          const texture = new TextureCube(engine, width, format, generateMipmap, isSRGBColorSpace);

          texture.anisoLevel = anisoLevel ?? texture.anisoLevel;
          texture.filterMode = filterMode ?? texture.filterMode;
          texture.wrapModeU = wrapModeU ?? texture.wrapModeU;
          texture.wrapModeV = wrapModeV ?? texture.wrapModeV;

          for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            texture.setImageSource(TextureCubeFace.PositiveX + faceIndex, images[faceIndex], 0);
          }
          generateMipmap && texture.generateMipmaps();

          resourceManager.addContentRestorer(new CubeFaceContentRestorer(texture, urls, requestConfig, generateMipmap));
          resolve(texture);
        })
        .catch(reject);
    });
  }
}

class HDRContentRestorer extends ContentRestorer<TextureCube> {
  constructor(
    resource: TextureCube,
    public url: string,
    public requestConfig: RequestConfig,
    public mipmap: boolean
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<TextureCube> {
    return new AssetPromise((resolve, reject) => {
      const resource = this.resource;
      resource.engine.resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(this.url, this.requestConfig)
        .then((buffer) => {
          const { faceBuffers } = HDRDecoder.decode(buffer);
          for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            resource.setPixelBuffer(TextureCubeFace.PositiveX + faceIndex, faceBuffers[faceIndex], 0);
          }
          if (this.mipmap) {
            resource.generateMipmaps();
          }
          resolve(resource);
        })
        .catch(reject);
    });
  }
}

class CubeFaceContentRestorer extends ContentRestorer<TextureCube> {
  constructor(
    resource: TextureCube,
    public urls: string[],
    public requestConfig: RequestConfig,
    public mipmap: boolean
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<TextureCube> {
    return new AssetPromise((resolve, reject) => {
      Promise.all(this.urls.map((url) => request<HTMLImageElement>(url, this.requestConfig)))
        .then((images) => {
          const resource = this.resource;
          for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            resource.setImageSource(TextureCubeFace.PositiveX + faceIndex, images[faceIndex], 0);
          }
          if (this.mipmap) {
            resource.generateMipmaps();
          }
          resolve(resource);
        })
        .catch(reject);
    });
  }
}
