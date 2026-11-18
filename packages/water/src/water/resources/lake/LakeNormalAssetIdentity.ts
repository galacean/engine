import {
  WaterBodyResourceSchemaVersion,
  type WaterResourceAssetDescriptorV1
} from "../../authoring/body/WaterBodyAuthoringTypes";
/** Stable source identity shared by V1/V2; runtime derivatives may use a smaller mobile resolution. */
export const LAKE_NORMAL_ASSET_ID = "grasslands-water-normal-1024";
export const LAKE_NORMAL_CONTENT_HASH = "af03f8e85a378367fc5e6a9f93faae1b1d83f4bd109a9ad247a864a506661f44";

export const LAKE_NORMAL_RESOURCE: WaterResourceAssetDescriptorV1 = Object.freeze({
  schemaVersion: WaterBodyResourceSchemaVersion.V1,
  id: LAKE_NORMAL_ASSET_ID,
  kind: "texture",
  contentHash: LAKE_NORMAL_CONTENT_HASH,
  ownership: "shared",
  fallbackPolicy: "required"
});
