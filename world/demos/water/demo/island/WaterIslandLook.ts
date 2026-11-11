import { createWaterLookPresetV1, WaterSurfaceDepthResponseModelV2 } from "@galacean/engine-water/water/index";
import type { WaterBodyAssetRegistry } from "@galacean/engine-water/water/runtime/index";

/** Scene-owned variants; canonical single-water and SeedWorld presets retain their authored values. */
export function registerWaterIslandLook(
  registry: WaterBodyAssetRegistry,
  baseId: string,
  kind: "lake" | "river" | "ocean"
): string {
  const id = `water-island-${kind}-look`;
  if (registry.getLookPreset(id)) return id;
  const base = registry.getLookAuthoringSnapshot(baseId)!;
  const appearanceId = `${id}-appearance`,
    opticsId = `${id}-optics`;
  const source = base.appearance.appearance;
  const depth = source.depthResponse;
  registry.registerAppearancePreset({
    ...base.appearance,
    id: appearanceId,
    appearance: {
      ...source,
      id: appearanceId,
      depthResponse:
        kind === "ocean" && depth.model === WaterSurfaceDepthResponseModelV2.CompositeExponential
          ? {
              ...depth,
              terms: depth.terms[1]
                ? [
                    { ...depth.terms[0], coefficientPerMeter: depth.terms[0].coefficientPerMeter * 0.25 },
                    { ...depth.terms[1], coefficientPerMeter: depth.terms[1].coefficientPerMeter * 0.25 }
                  ]
                : [{ ...depth.terms[0], coefficientPerMeter: depth.terms[0].coefficientPerMeter * 0.25 }],
              shallowColor: [0, 0.65, 0.67, 0.08]
            }
          : depth,
      boundaryEffects: source.boundaryEffects.map((effect) => ({
        ...effect,
        rangeMeters: kind === "ocean" ? 0.65 : effect.rangeMeters
      }))
    }
  });
  registry.registerOpticsPreset({
    ...base.optics,
    id: opticsId,
    profile: {
      ...base.optics.profile,
      ...(kind === "river"
        ? {
            absorptionCoefficient: [0.35, 0.09, 0.04] as const,
            maximumSurfaceOpticalDistance: 8
          }
        : {})
    }
  });
  registry.registerLookPreset(
    createWaterLookPresetV1({
      ...base.look,
      id,
      appearanceAssetId: appearanceId,
      opticalProfileId: opticsId,
      foam: { ...base.look.foam, intensity: kind === "river" ? 0.35 : (base.look.foam?.intensity ?? 0.35) }
    })
  );
  return id;
}
