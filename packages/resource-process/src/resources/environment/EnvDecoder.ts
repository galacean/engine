import { AmbientLight, AssetType, DiffuseMode, Engine } from "@oasis-engine/core";
import { SphericalHarmonics3 } from "@oasis-engine/math";
import { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";

@decoder("Environment")
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
        const path = bufferReader.nextStr();
        const objectId = bufferReader.nextStr();
        engine.resourceManager
          .load({
            url: path,
            type: AssetType.Oasis
          })
          .then(() => {
            // @ts-ignore
            ambientLight.specularTexture = engine.resourceManager._objectPool[objectId];
          });
      }

      ambientLight.diffuseMode = diffuseMode;
      ambientLight.diffuseIntensity = diffuseIntensity;
      ambientLight.specularIntensity = specularIntensity;

      // @ts-ignore
      engine.resourceManager._objectPool[objectId] = texture2D;

      resolve(ambientLight);
    });
  }
}
