import manifest from "./assets/ktx2-manifest.json";
import {
  WaterBodyResourceSchemaVersion,
  type WaterResourceAssetDescriptorV1
} from "../../authoring/body/WaterBodyAuthoringTypes";

export const FARMLANDS_WAVE_RESOURCE: WaterResourceAssetDescriptorV1 = Object.freeze({
  schemaVersion: WaterBodyResourceSchemaVersion.V1,
  id: "farmlands-wave-large-normal",
  kind: "texture",
  contentHash: manifest.textures.wave.sha256,
  ownership: "shared",
  fallbackPolicy: "required"
});
export const FARMLANDS_CAUSTICS_RESOURCE: WaterResourceAssetDescriptorV1 = Object.freeze({
  schemaVersion: WaterBodyResourceSchemaVersion.V1,
  id: "farmlands-caustics-color",
  kind: "texture",
  contentHash: manifest.textures.caustics.sha256,
  ownership: "shared",
  fallbackPolicy: "required"
});
