import type { AssetSeedColor } from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";

/** Renderer-independent artist control contract, shared by offline authoring, UI, and world edits. */
export const INSTANCED_BIRCH_VARIATION_LIMITS = Object.freeze({
  horizontalScale: [0.1, 3] as const,
  verticalScale: [0.1, 3] as const,
  yawDegrees: [-180, 180] as const,
  branchLengthScale: [0.1, 3] as const,
  leafDensity: [0, 1] as const,
  leafSizeScale: [0.1, 5] as const,
  trunkThicknessScale: [1, 2] as const,
  branchDensity: [0, 1] as const,
  branchCurvatureDegreesPerMeter: [0, 90] as const
});

export interface InstancedBirchVariationControls {
  readonly horizontalScale: number;
  readonly verticalScale: number;
  readonly yawDegrees: number;
  readonly branchLengthScale: number;
  readonly leafDensity: number;
  readonly leafSizeScale: number;
  /** Main-trunk radial scale; branch centerlines stay unchanged. */
  readonly trunkThicknessScale?: number;
  readonly branchDensity: number;
  readonly branchCurvatureDegreesPerMeter: number;
  readonly leafColorRgb: AssetSeedColor;
  readonly barkColorRgb: AssetSeedColor;
}
