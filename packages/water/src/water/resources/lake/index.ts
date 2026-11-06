/** Public Water entry. Internal modules retain direct imports. */
export { LAKE_NORMAL_ASSET_ID, LAKE_NORMAL_CONTENT_HASH, LAKE_NORMAL_RESOURCE } from "./LakeNormalAssetIdentity";
export { LAKE_NORMAL_HEIGHT, LAKE_NORMAL_WIDTH, LakeNormalAssetLoader } from "./LakeNormalAssetLoader";
export type { LakeNormalAssetSource } from "./LakeNormalAssetLoader";
export { createLakeNormalResourceFactory } from "./LakeNormalRuntimeResource";
export { digestSha256Hex } from "../sha256";
