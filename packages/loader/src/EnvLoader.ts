import {
  AmbientLight,
  AssetPromise,
  AssetType,
  DiffuseMode,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode
} from "@galacean/engine-core";
import { SphericalHarmonics3 } from "@galacean/engine-math";

@resourceLoader(AssetType.Env, ["env"])
class EnvLoader extends Loader<AmbientLight> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AmbientLight> {
    return new AssetPromise((resolve, reject) => {
      resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(item.url, { ...item, type: "arraybuffer" })
        .then((arraybuffer) => {
          const shArray = new Float32Array(arraybuffer, 0, 27);
          const shByteLength = 27 * 4;
          const size = new Uint16Array(arraybuffer, shByteLength, 1)?.[0];

          const { engine } = resourceManager;
          const texture = new TextureCube(engine, size);
          texture.filterMode = TextureFilterMode.Trilinear;
          const mipmapCount = texture.mipmapCount;
          let offset = shByteLength + 2;

          for (let mipLevel = 0; mipLevel < mipmapCount; mipLevel++) {
            const mipSize = size >> mipLevel;

            for (let face = 0; face < 6; face++) {
              const dataSize = mipSize * mipSize * 4;
              const data = new Uint8Array(arraybuffer, offset, dataSize);
              offset += dataSize;
              texture.setPixelBuffer(TextureCubeFace.PositiveX + face, data, mipLevel);
            }
          }

          const ambientLight = new AmbientLight(engine);
          const sh = new SphericalHarmonics3();

          ambientLight.diffuseMode = DiffuseMode.SphericalHarmonics;
          sh.copyFromArray(shArray);
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
