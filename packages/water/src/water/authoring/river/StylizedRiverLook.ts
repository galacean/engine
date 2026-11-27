import { WaterBodyAssetRegistry } from "../../runtime/body/WaterBodyAssetRegistry";
import { RIVER_CANONICAL_LOOK_PRESET_ID } from "./RiverWaterBodyAuthoring";
import { createWaterLookPresetV1 } from "../surface/WaterLookPreset";
import {
  WaterDepthResponseCombineV2,
  WaterSurfaceDepthResponseModelV2,
  WaterSurfacePrimaryColorClosure
} from "../surface/WaterSurfaceAppearanceTypes";
import {
  WaterFieldProviderKind,
  WaterFieldConsumerActivation,
  WaterFieldFallback,
  WaterFieldRequirement,
  WaterFieldUnit,
  WaterFieldSemantic
} from "../surface/WaterSurfaceFieldTypes";

// The PCG pools are metres deep; RiverDemo's short, shallow water columns need
// different extinction distances. Keep camera-ray and bed-normal terms distinct.
export const STYLIZED_RIVER_DEPTH_COEFFICIENTS = Object.freeze({ sceneRay: 0.32, surfaceNormal: 0.3 });
export const STYLIZED_RIVER_DEEP_OPACITY = 0.8;

export const STYLIZED_RIVER_LOOK_ID = "stylized-river-look-v1";

/** Reusable RiverDemo-inspired appearance, independent of the centerline and terrain. */
export function registerStylizedRiverLook(registry: WaterBodyAssetRegistry): void {
  const base = registry.getLookAuthoringSnapshot(RIVER_CANONICAL_LOOK_PRESET_ID);
  if (!base) throw new Error("Register River water body presets before its stylized Look.");
  const appearanceId = "stylized-river-appearance-v1";
  const opticsId = "stylized-river-optics-v1";
  registry.registerAppearancePreset({
    ...base.appearance,
    id: appearanceId,
    fieldDependencies: {
      ...base.appearance.fieldDependencies!,
      id: "stylized-river-fields-v1",
      bindings: [
        ...base.appearance.fieldDependencies!.bindings,
        {
          consumerId: "surface-normal-depth",
          semantic: WaterFieldSemantic.SurfaceNormalDepth,
          providers: [WaterFieldProviderKind.CameraDepth],
          activation: WaterFieldConsumerActivation.Always,
          requirement: WaterFieldRequirement.Required,
          fallback: WaterFieldFallback.FailActivation,
          unit: WaterFieldUnit.Meter
        }
      ]
    },
    appearance: {
      ...base.appearance.appearance,
      id: appearanceId,
      primaryColorClosure: WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp,
      flowNormalStrength: 0.467,
      depthResponse: {
        model: WaterSurfaceDepthResponseModelV2.CompositeExponential,
        // Calibrated for the 1–2.4 metre pools in the PCG example.
        terms: [
          { field: WaterFieldSemantic.SceneRayDepth, coefficientPerMeter: STYLIZED_RIVER_DEPTH_COEFFICIENTS.sceneRay },
          {
            field: WaterFieldSemantic.SurfaceNormalDepth,
            coefficientPerMeter: STYLIZED_RIVER_DEPTH_COEFFICIENTS.surfaceNormal
          }
        ],
        combine: WaterDepthResponseCombineV2.Maximum,
        // RiverDemo's [HDR] color properties are already stored in linear RGB.
        // The shallow alpha is deliberately zero; density alone is not opacity.
        shallowColor: [0, 1, 0.98136926, 0],
        deepColor: [0, 0.16451614, 0.34, STYLIZED_RIVER_DEEP_OPACITY]
      }
    }
  });
  registry.registerOpticsPreset({
    ...base.optics,
    id: opticsId,
    profile: { ...base.optics.profile, roughness: 0.5, reflectionIntensity: 1 }
  });
  registry.registerLookPreset(
    createWaterLookPresetV1({
      ...base.look,
      id: STYLIZED_RIVER_LOOK_ID,
      appearanceAssetId: appearanceId,
      opticalProfileId: opticsId,
      foam: { enabled: true, intensity: 1, color: "#ffffff" }
    })
  );
}
