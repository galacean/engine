import {
  WaterBodyResourceSchemaVersion,
  type WaterResourceAssetDescriptorV1
} from "../../authoring/body/WaterBodyAuthoringTypes";

export const FARMLANDS_WAVE_RESOURCE: WaterResourceAssetDescriptorV1 = Object.freeze({
  schemaVersion: WaterBodyResourceSchemaVersion.V1,
  id: "farmlands-wave-large-normal",
  kind: "texture",
  contentHash: "25a717a13b29082b65a62b6ca489412ce9620d8c99ee65a96f626ac153ac3400",
  ownership: "shared",
  fallbackPolicy: "required"
});
export const FARMLANDS_CAUSTICS_RESOURCE: WaterResourceAssetDescriptorV1 = Object.freeze({
  schemaVersion: WaterBodyResourceSchemaVersion.V1,
  id: "farmlands-caustics-color",
  kind: "texture",
  contentHash: "82024c671895a0a84b362cb2d5170d1ae1ab78139a022dcfc9d00f77bfde299f",
  ownership: "shared",
  fallbackPolicy: "required"
});
