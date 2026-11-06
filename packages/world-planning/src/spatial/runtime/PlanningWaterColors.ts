import { WaterBodyAssetRegistry } from "@galacean/engine-water/water/runtime/index";
import { registerLakeWaterLook, LAKE_WATER_LOOK_PRESET_ID } from "@galacean/engine-water/water/presets/lake/index";
import {
  registerRiverWaterBodyPresets,
  registerFarmlandsRiverLook
} from "@galacean/engine-water/water/presets/river/index";
import {
  readSeedWorldWaterColor,
  withSeedWorldWaterColor,
  type SeedWorldWaterColorRgb
} from "@galacean/engine-water/world/SeedWorldWaterColor";
import presentation from "../../planning-data/water-rendering.json";
import { hashRiverStableValue } from "@galacean/engine-water/water/compiler/index";

let defaults: WaterBodyAssetRegistry | undefined;
/** Read the production preset without requiring a published body or allocating GPU resources. */
export function defaultPlanningWaterColor(type: "river" | "water-body"): SeedWorldWaterColorRgb {
  if (!defaults) {
    const assets = new WaterBodyAssetRegistry();
    registerLakeWaterLook(assets);
    registerRiverWaterBodyPresets(assets);
    registerFarmlandsRiverLook(assets);
    defaults = assets;
  }
  const lookId = type === "river" ? presentation.riverLookId : LAKE_WATER_LOOK_PRESET_ID;
  const source = defaults.getLookAuthoringSnapshot(lookId);
  if (!source) throw new Error(`Planning water preset '${lookId}' is unavailable`);
  return readSeedWorldWaterColor(source);
}

/** Prepare an immutable per-body Look as part of candidate publication, before the body exists. */
export function registerPlanningWaterColor(
  assets: WaterBodyAssetRegistry,
  bodyId: string,
  baseLookId: string,
  color: SeedWorldWaterColorRgb | undefined
): string {
  if (!color) return baseLookId;
  const source = assets.getLookAuthoringSnapshot(baseLookId);
  if (!source) throw new Error(`Planning water preset '${baseLookId}' is unavailable`);
  const edited = withSeedWorldWaterColor(source, color);
  const id = `planning-water-color-${hashRiverStableValue({ bodyId, baseLookId, color })}`;
  if (assets.getLookAuthoringSnapshot(id)) return id;
  const appearanceId = `${id}:appearance`,
    opticsId = `${id}:optics`;
  assets.registerAppearancePreset({
    ...edited.appearance,
    id: appearanceId,
    appearance: { ...edited.appearance.appearance, id: appearanceId }
  });
  assets.registerOpticsPreset({ ...edited.optics, id: opticsId });
  assets.registerLookPreset({ ...edited.look, id, appearanceAssetId: appearanceId, opticalProfileId: opticsId });
  return id;
}
