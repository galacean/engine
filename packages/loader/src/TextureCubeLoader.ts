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
  resourceLoader
} from "@galacean/engine-core";
import { HDRDecoder } from "./HDRDecoder";

@resourceLoader(AssetType.TextureCube, ["texCube", "hdr"])
class TextureCubeLoader extends Loader<TextureCube> {
  override load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<TextureCube> {
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
          const bufferArray = new Uint8Array(buffer);
          const header = HDRDecoder.parseHeader(bufferArray);
          const texture = new TextureCube(engine, header.height >> 1, TextureFormat.R16G16B16A16, mipmap, false);
          HDRDecoder.decodeFaces(bufferArray, header, (faceIndex, data) => {
            texture.setPixelBuffer(TextureCubeFace.PositiveX + faceIndex, data, 0);
          });
          texture.generateMipmaps();
          texture.anisoLevel = anisoLevel ?? texture.anisoLevel;
          texture.filterMode = filterMode ?? texture.filterMode;
          texture.wrapModeU = wrapModeU ?? texture.wrapModeU;
          texture.wrapModeV = wrapModeV ?? texture.wrapModeV;
          resourceManager.addContentRestorer(new HDRContentRestorer(texture, url, requestConfig));
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
    public requestConfig: RequestConfig
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
          const bufferArray = new Uint8Array(buffer);
          HDRDecoder.decodeFaces(bufferArray, HDRDecoder.parseHeader(bufferArray), (faceIndex, data) => {
            resource.setPixelBuffer(TextureCubeFace.PositiveX + faceIndex, data, 0);
          });
          resource.generateMipmaps();
          resolve(resource);
        })
        .catch(reject);
    });
  }
}
