import type { Engine } from "@galacean/engine-core";
import { builtinWaterTextureFactory } from "../../native/WaterBuiltinAssets";
import { LAKE_NORMAL_RESOURCE } from "./LakeNormalAssetIdentity";

export function createLakeNormalResourceFactory(engine: Engine) {
  return builtinWaterTextureFactory(engine, LAKE_NORMAL_RESOURCE, `Water/Textures/${LAKE_NORMAL_RESOURCE.id}.ktx2`);
}
