import { DiffuseMode } from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
import { encoder } from "../..";
import { BufferWriter } from "../../utils/BufferWriter";
import { IEnvAsset } from "./type";

@encoder("Environment")
export class EnvEncoder {
  static encode(bufferWriter: BufferWriter, data: IEnvAsset) {
    const {
      objectId,
      diffuseMode = DiffuseMode.SolidColor,
      diffuseSolidColor = new Color(0.212, 0.227, 0.259),
      diffuseSphericalHarmonics,
      diffuseIntensity = 1,
      specularIntensity = 1,
      specularTexture
    } = data;

    bufferWriter.writeStr(objectId);
    bufferWriter.writeUint8(diffuseMode);

    if (diffuseMode == DiffuseMode.SolidColor) {
      bufferWriter.writeFloat32(diffuseSolidColor.r);
      bufferWriter.writeFloat32(diffuseSolidColor.g);
      bufferWriter.writeFloat32(diffuseSolidColor.b);
      bufferWriter.writeFloat32(diffuseSolidColor.a);
    } else if (diffuseMode == DiffuseMode.SphericalHarmonics) {
      bufferWriter.writeFloat32Array(diffuseSphericalHarmonics);
    }

    bufferWriter.writeFloat32(diffuseIntensity);
    bufferWriter.writeFloat32(specularIntensity);

    bufferWriter.writeUint8(specularTexture ? 1 : 0);

    if (specularTexture) {
      bufferWriter.writeStr(specularTexture.path);
      bufferWriter.writeStr(specularTexture.objectId);
    }

    return bufferWriter.buffer;
  }
}
