import {
  AmbientLight,
  AssetPromise,
  AssetType,
  ContentRestorer,
  DiffuseMode,
  Engine,
  LoadItem,
  Loader,
  ResourceManager,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode,
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
      const engine = resourceManager.engine;
      const request = this.request;
      request<ArrayBuffer>(item.url, { ...item, type: "arraybuffer" })
        .then((arraybuffer) => {
          const texture = EnvLoader._setTextureByBuffer(engine, arraybuffer);
          engine.resourceManager.addContentRestorer(
            new (class extends ContentRestorer<TextureCube> {
              override restoreContent(): AssetPromise<TextureCube> {
                return new AssetPromise((resolve, reject) => {
                  request<ArrayBuffer>(item.url, { ...item, type: "arraybuffer" })
                    .then((buffer) => {
                      EnvLoader._setTextureByBuffer(engine, buffer, texture);
                      resolve(texture);
                    })
                    .catch(reject);
                });
              }
            })(texture)
          );
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
