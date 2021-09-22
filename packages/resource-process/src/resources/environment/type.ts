import { DiffuseMode } from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";

export interface IEnvAsset {
  objectId: string;
  diffuseMode: DiffuseMode;
  diffuseSolidColor: Color;
  diffuseSphericalHarmonics: Float32Array;
  diffuseIntensity: number;
  specularIntensity: number;
  specularTexture: {
    path: string;
    objectId: string;
  };
}
