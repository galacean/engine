import type { WaterBodyAssetRegistry } from "../../runtime/body/WaterBodyAssetRegistry";
import { createWaterLookPresetV1 } from "../surface/WaterLookPreset";
import {
  WaterSurfaceDepthResponseModelV2,
  WaterSurfacePrimaryColorClosure
} from "../surface/WaterSurfaceAppearanceTypes";
import { WaterFieldSemantic } from "../surface/WaterSurfaceFieldTypes";
import { registerStylizedRiverLook, STYLIZED_RIVER_LOOK_ID } from "./StylizedRiverLook";

export const RIVER_HIGH_LOOK_ID = "stylized-river-high-v1";

/** Explicit opt-in: existing River, Lake and Ocean Looks retain their optical model. */
export function registerRiverHighLook(registry: WaterBodyAssetRegistry): void {
  registerStylizedRiverLook(registry);
  const base = registry.getLookAuthoringSnapshot(STYLIZED_RIVER_LOOK_ID)!;
  const appearanceId = `${RIVER_HIGH_LOOK_ID}-appearance`;
  const opticsId = `${RIVER_HIGH_LOOK_ID}-optics`;
  const reflectionId = `${RIVER_HIGH_LOOK_ID}-reflection`;
  registry.registerReflectionPolicyPreset({ ...base.reflectionPolicy, id: reflectionId });
  registry.registerAppearancePreset({
    ...base.appearance,
    id: appearanceId,
    appearance: {
      ...base.appearance.appearance,
      id: appearanceId,
      primaryColorClosure: WaterSurfacePrimaryColorClosure.PhysicalVolume,
      flowNormalStrength: 0.15,
      depthResponse: {
        model: WaterSurfaceDepthResponseModelV2.BeerLambert,
        field: WaterFieldSemantic.OpticalPath,
        scatteringTint: { coefficientPerMeter: 0.3, shallowColor: [0.1, 1, 0.98, 1], deepColor: [0.03, 0.34, 0.65, 1] }
      }
    }
  });
  registry.registerOpticsPreset({
    ...base.optics,
    id: opticsId,
    profile: {
      ...base.optics.profile,
      absorptionCoefficient: [0.8, 0.11, 0.045],
      indexOfRefraction: 1.333,
      fresnelF0: undefined,
      roughness: 0.28,
      reflectionIntensity: 1
    }
  });
  registry.registerLookPreset(
    createWaterLookPresetV1({
      ...base.look,
      id: RIVER_HIGH_LOOK_ID,
      appearanceAssetId: appearanceId,
      opticalProfileId: opticsId,
      reflectionPolicyId: reflectionId,
      foam: { ...base.look.foam, intensity: 0.65 }
    })
  );
}
