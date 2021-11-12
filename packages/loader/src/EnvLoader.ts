import {
  AmbientLight,
  AssetPromise,
  AssetType,
  DiffuseMode,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  TextureCubeFace,
  TextureCubeMap
} from "@oasis-engine/core";
import { SphericalHarmonics3 } from "@oasis-engine/math";

@resourceLoader(AssetType.Env, ["env"])
class EnvLoader extends Loader<AmbientLight> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AmbientLight> {
    return new AssetPromise((resolve, reject) => {
      resourceManager
        .load<ArrayBuffer>({
          type: AssetType.Buffer,
          url: item.url
        })
        .then((arraybuffer) => {
          const shArray = new Float32Array(arraybuffer, 0, 27);
          const shByteLength = 27 * 4;
          const size = new Uint16Array(arraybuffer, shByteLength, 1)?.[0];

          const texture = new TextureCubeMap(resourceManager.engine, size);
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

          const ambientLight = new AmbientLight();
          const sh = new SphericalHarmonics3();

          ambientLight.diffuseMode = DiffuseMode.SphericalHarmonics;
          sh.setValueByArray(shArray);
          ambientLight.diffuseSphericalHarmonics = sh;
          ambientLight.specularTexture = texture;

          resolve(ambientLight);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
