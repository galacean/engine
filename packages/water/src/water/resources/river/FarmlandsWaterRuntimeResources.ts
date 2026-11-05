import type { Engine } from "@galacean/engine-core";
import { FARMLANDS_WAVE_RESOURCE, FARMLANDS_CAUSTICS_RESOURCE } from "./FarmlandsWaterAssets";
import { FARMLANDS_DROP_ASSETS } from "./FarmlandsDropAssets";
import { builtinWaterTextureFactory } from "../../native/WaterBuiltinAssets";

/** Leases borrow native resources; ResourceManager owns loading and context restoration. */
export function createFarmlandsWaterResourceFactories(engine: Engine) {
  return [
    FARMLANDS_WAVE_RESOURCE,
    FARMLANDS_CAUSTICS_RESOURCE,
    ...Object.values(FARMLANDS_DROP_ASSETS).map((asset) => asset.descriptor)
  ].map((descriptor) => builtinWaterTextureFactory(engine, descriptor, `Water/Textures/${descriptor.id}.png`));
}
