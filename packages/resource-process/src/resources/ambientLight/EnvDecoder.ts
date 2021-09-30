import { AmbientLight, DiffuseMode, Engine, TextureCubeFace, TextureCubeMap } from "@oasis-engine/core";
import { SphericalHarmonics3 } from "@oasis-engine/math";
import { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";

@decoder("AmbientLight")
export class EnvDecoder {
  static decode(
    engine: Engine,
    arraybuffer: ArrayBuffer,
    byteOffset?: number,
    byteLength?: number
  ): Promise<AmbientLight> {
    return new Promise((resolve, reject) => {
      const bufferReader = new BufferReader(arraybuffer, byteOffset, byteLength);
      const ambientLight = new AmbientLight(engine.sceneManager.activeScene);

      const objectId = bufferReader.nextStr();
      const diffuseMode = bufferReader.nextUint8();

      if (diffuseMode == DiffuseMode.SolidColor) {
        const r = bufferReader.nextFloat32();
        const g = bufferReader.nextFloat32();
        const b = bufferReader.nextFloat32();
        const a = bufferReader.nextFloat32();
        ambientLight.diffuseSolidColor.setValue(r, g, b, a);
      } else if (diffuseMode == DiffuseMode.SphericalHarmonics) {
        const sh = new SphericalHarmonics3();
        const floatArray = bufferReader.nextFloat32Array(27);
        sh.setValueByArray(floatArray);
        ambientLight.diffuseSphericalHarmonics = sh;
      }

      const diffuseIntensity = bufferReader.nextFloat32();
      const specularIntensity = bufferReader.nextFloat32();
      const hasSpecularTexture = !!bufferReader.nextUint8();
      if (hasSpecularTexture) {
        const size = bufferReader.nextUint16();
        const mipCount = bufferReader.nextUint8();
        const imagesData = bufferReader.nextImagesData(mipCount);

        const textureCube = new TextureCubeMap(engine, size);
        for (let i = 1; i < mipCount; i++) {
          for (let j = 0; j < 6; j++) {
            const pixelBuffer = new Uint8Array(imagesData[6 * i + j].buffer);
            textureCube.setPixelBuffer(TextureCubeFace.PositiveX + i, pixelBuffer);
          }
        }
        ambientLight.specularTexture = textureCube;
      }

      ambientLight.diffuseMode = diffuseMode;
      ambientLight.diffuseIntensity = diffuseIntensity;
      ambientLight.specularIntensity = specularIntensity;

      // @ts-ignore
      engine.resourceManager._objectPool[objectId] = ambientLight;

      resolve(ambientLight);
    });
  }
}
