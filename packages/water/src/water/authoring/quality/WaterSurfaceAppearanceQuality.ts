import type { WaterQualityLevelV2, WaterQualityPlanV2 } from "./WaterQualityPlan";
import type { WaterSurfaceAppearanceAssetV2, WaterSurfaceFoamOctaves } from "../surface/WaterSurfaceAppearanceTypes";
import { validateWaterSurfaceAppearanceV2Asset } from "../../compiler/surface/WaterSurfaceAppearanceV2Validator";

export interface WaterSurfaceAppearanceQualityBudget {
  readonly maximumDetailLayers: 1 | 2;
  readonly maximumPatternOctaves: 1 | 2 | 3;
}

/** Shared by CPU derivation and the fail-closed runtime binding guard. */
export function getWaterSurfaceAppearanceQualityBudget(
  level: WaterQualityLevelV2
): WaterSurfaceAppearanceQualityBudget {
  switch (level) {
    case "low":
      return { maximumDetailLayers: 1, maximumPatternOctaves: 1 };
    case "medium":
      return { maximumDetailLayers: 2, maximumPatternOctaves: 2 };
    case "high":
      return { maximumDetailLayers: 2, maximumPatternOctaves: 3 };
    default:
      throw new TypeError(`Unsupported surface shading quality '${level}'.`);
  }
}

/** Quality changes implementation cost, never depth providers, refraction or authored Look intent. */
export function resolveWaterSurfaceAppearanceForQuality(
  appearance: WaterSurfaceAppearanceAssetV2,
  quality: Pick<WaterQualityPlanV2, "surfaceShading">
): WaterSurfaceAppearanceAssetV2 {
  const validation = validateWaterSurfaceAppearanceV2Asset(appearance);
  if (!validation.valid || !validation.value)
    throw new TypeError(
      validation.diagnostics.map((diagnostic) => diagnostic.message).join("; ") || "Invalid Water surface appearance."
    );
  const { maximumDetailLayers, maximumPatternOctaves } = getWaterSurfaceAppearanceQualityBudget(quality.surfaceShading);
  return {
    ...appearance,
    detailLayers: appearance.detailLayers.slice(0, maximumDetailLayers),
    boundaryEffects: appearance.boundaryEffects.map((effect) => {
      const pattern = effect.pattern;
      if (!pattern || pattern.octaves.count <= maximumPatternOctaves) return effect;
      const retained = pattern.octaves.weights.slice(0, maximumPatternOctaves);
      // Retain a valid signal even if all authored energy is in discarded octaves.
      const hasEnergy = retained.some((weight) => weight > 0);
      const weights = retained.map((weight, index) =>
        hasEnergy ? weight : index === 0 ? Math.max(...pattern.octaves.weights) : 0
      );
      const octaves: WaterSurfaceFoamOctaves =
        maximumPatternOctaves === 1
          ? { count: 1, weights: [weights[0]] }
          : maximumPatternOctaves === 2
            ? { count: 2, weights: [weights[0], weights[1]] }
            : { count: 3, weights: [weights[0], weights[1], weights[2]] };
      return { ...effect, pattern: { ...pattern, octaves } };
    })
  };
}
