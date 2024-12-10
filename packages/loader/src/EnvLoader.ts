import {
  AmbientLight,
  AssetPromise,
  AssetType,
  ContentRestorer,
  DiffuseMode,
  Engine,
  LoadItem,
  Loader,
  RequestConfig,
  ResourceManager,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode,
  request,
  resourceLoader
} from "@galacean/engine-core";
import { SphericalHarmonics3 } from "@galacean/engine-math";

@resourceLoader(AssetType.Env, ["env"])
class EnvLoader extends Loader<AmbientLight> {
  /**
   * @internal
   */
  static _setTextureByBuffer(engine: Engine, buffer: ArrayBuffer, texture?: TextureCube) {
    const shByteLength = 27 * 4;
    const size = new Uint16Array(buffer, shByteLength, 1)?.[0];
    texture ||= new TextureCube(engine, size);
    texture.filterMode = TextureFilterMode.Trilinear;
    const mipmapCount = texture.mipmapCount;
    let offset = shByteLength + 2;

    for (let mipLevel = 0; mipLevel < mipmapCount; mipLevel++) {
      const mipSize = size >> mipLevel;

      for (let face = 0; face < 6; face++) {
        const dataSize = mipSize * mipSize * 4;
        const data = new Uint8Array(buffer, offset, dataSize);
        offset += dataSize;
        texture.setPixelBuffer(TextureCubeFace.PositiveX + face, data, mipLevel);
      }
    }
    return texture;
  }

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AmbientLight> {
    return new AssetPromise((resolve, reject) => {
      const requestConfig = { ...item, type: "arraybuffer" } as RequestConfig;
      const engine = resourceManager.engine;
      resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(item.url, requestConfig)
        .then((arraybuffer) => {
          const texture = EnvLoader._setTextureByBuffer(engine, arraybuffer);
          engine.resourceManager.addContentRestorer(new EnvContentRestorer(texture, item.url, requestConfig));
          const ambientLight = new AmbientLight(engine);
          const sh = new SphericalHarmonics3();
          ambientLight.diffuseMode = DiffuseMode.SphericalHarmonics;
          sh.copyFromArray(new Float32Array(arraybuffer, 0, 27));
          ambientLight.diffuseSphericalHarmonics = sh;
          ambientLight.specularTexture = texture;
          ambientLight.specularTextureDecodeRGBM = true;
          resolve(ambientLight);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}

/**
 * @internal
 */
class EnvContentRestorer extends ContentRestorer<TextureCube> {
  constructor(
    resource: TextureCube,
    public url: string,
    public requestConfig: RequestConfig
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<TextureCube> {
    return new AssetPromise((resolve, reject) => {
      request<ArrayBuffer>(this.url, this.requestConfig)
        .then((buffer) => {
          EnvLoader._setTextureByBuffer(this.resource.engine, buffer, this.resource);
          resolve(this.resource);
        })
        .catch(reject);
    });
  }
}
