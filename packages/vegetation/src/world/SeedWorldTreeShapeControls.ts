import {
  INSTANCED_BIRCH_VARIATION_LIMITS,
  type InstancedBirchVariationControls
} from "../asset-assembly/ProceduralTreeVariationControls";
import type { InstancedBirchPopulationVariation } from "../asset-assembly/InstancedBirchVariationRow";

/** Absolute artist controls shared by the panel and AI recipe-effect edits. */
export type SeedWorldTreeShapePatch = Readonly<Partial<InstancedBirchVariationControls>>;

/** Identifies one of the recipe's existing seven editable effect slots. */
export function treeVariationKey(recipeId: string, variationIndex: number): string {
  return JSON.stringify([recipeId, variationIndex]);
}

export function validateSeedWorldTreeShapePatch(patch: SeedWorldTreeShapePatch): void {
  const entries = Object.entries(patch);
  if (entries.length === 0) throw new RangeError("Tree shape patch must contain at least one control");
  for (const [key, value] of entries) {
    if (key === "leafColorRgb" || key === "barkColorRgb") {
      if (!Array.isArray(value) || value.length !== 3 || value.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) {
        throw new RangeError(`${key} must contain three sRGB bytes`);
      }
    } else {
      const limits = INSTANCED_BIRCH_VARIATION_LIMITS[key as keyof typeof INSTANCED_BIRCH_VARIATION_LIMITS];
      if (!limits || typeof value !== "number" || !Number.isFinite(value) || value < limits[0] || value > limits[1]) {
        throw new RangeError(`Invalid tree shape control '${key}'`);
      }
    }
  }
}

export function detachSeedWorldTreeShapePatch(patch: SeedWorldTreeShapePatch): SeedWorldTreeShapePatch {
  validateSeedWorldTreeShapePatch(patch);
  return Object.freeze({
    ...patch,
    ...(patch.leafColorRgb ? { leafColorRgb: Object.freeze([...patch.leafColorRgb] as [number, number, number]) } : {}),
    ...(patch.barkColorRgb ? { barkColorRgb: Object.freeze([...patch.barkColorRgb] as [number, number, number]) } : {})
  });
}

/** Projection only: no new tree seed, geometry, placement, or shared recipe mutation. */
export function applySeedWorldTreeShapePatch(
  base: InstancedBirchPopulationVariation,
  patch: SeedWorldTreeShapePatch
): InstancedBirchPopulationVariation {
  validateSeedWorldTreeShapePatch(patch);
  const { yawDegrees, branchCurvatureDegreesPerMeter, barkColorRgb, ...direct } = patch;
  return Object.freeze({
    ...base,
    ...direct,
    ...(yawDegrees !== undefined ? { yawRadians: (yawDegrees * Math.PI) / 180 } : {}),
    ...(branchCurvatureDegreesPerMeter !== undefined
      ? { branchCurvatureRadiansPerMeter: (branchCurvatureDegreesPerMeter * Math.PI) / 180 }
      : {}),
    ...(barkColorRgb ? { barkColorMultiplier: barkColorRgb.map(srgb8ToLinear) as [number, number, number] } : {})
  });
}

/** Readback uses exactly the artist units accepted by the shared patch contract. */
export function readSeedWorldTreeShapeControls(
  value: InstancedBirchPopulationVariation
): InstancedBirchVariationControls {
  return Object.freeze({
    horizontalScale: value.horizontalScale,
    verticalScale: value.verticalScale,
    yawDegrees: (value.yawRadians * 180) / Math.PI,
    branchLengthScale: value.branchLengthScale,
    leafDensity: value.leafDensity,
    leafSizeScale: value.leafSizeScale,
    trunkThicknessScale: value.trunkThicknessScale,
    branchDensity: value.branchDensity,
    branchCurvatureDegreesPerMeter: (value.branchCurvatureRadiansPerMeter * 180) / Math.PI,
    leafColorRgb: Object.freeze([...value.leafColorRgb] as [number, number, number]),
    barkColorRgb: Object.freeze(value.barkColorMultiplier.map(linearToSrgb8) as [number, number, number])
  });
}

function srgb8ToLinear(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb8(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
}
