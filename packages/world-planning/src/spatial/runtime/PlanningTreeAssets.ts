import type { ProceduralTreeRuntimeAuthoringProfile } from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeAuthoringState";
import { getTreeSpeciesGeometryBounds } from "@galacean/engine-vegetation/asset-assembly/TreeSpeciesGeometryBounds";

/** Fits the measured, root-pivoted source inside a planned volume without moving its ground anchor.
 * Horizontal dimensions enclose asymmetric source bounds around the existing root; height measures
 * the visible top above that root. Tiny authored roots below zero remain embedded in the terrain.
 */
export function planningTreeAssetScale(
  assetRecipeId: string,
  width: number,
  height: number,
  depth: number
): [number, number, number] {
  const bounds = getTreeSpeciesGeometryBounds(assetRecipeId);
  const spans = [
    2 * Math.max(Math.abs(bounds.minimum[0]), Math.abs(bounds.maximum[0])),
    bounds.maximum[1],
    2 * Math.max(Math.abs(bounds.minimum[2]), Math.abs(bounds.maximum[2]))
  ];
  if (![width, height, depth, ...spans].every((value) => Number.isFinite(value) && value > 0))
    throw new RangeError(`Tree recipe ${assetRecipeId} cannot fit the planned volume`);
  return [width / spans[0], height / spans[1], depth / spans[2]];
}

/** Derives a planning-owned presentation profile; published spatial dimensions and yaw stay authoritative.
 * Keep recipe geometry, materials and color variation, but remove the Asset Assembly demonstration's
 * extra transform/branch deformation. Those variations have no matching planner collision envelope.
 * Never modify the shared catalog/profile: other Seed and Asset Assembly consumers retain their settings.
 */
export function constrainPlanningTreeProfile(
  profile: ProceduralTreeRuntimeAuthoringProfile
): ProceduralTreeRuntimeAuthoringProfile {
  return Object.freeze({
    ...profile,
    token: { ...profile.token, sizePercent: 100 },
    sizeScale: 1,
    lodGroup: profile.recipe.lodGroup,
    variationControls: Object.freeze(
      profile.variationControls.map((control) =>
        Object.freeze({
          ...control,
          horizontalScale: 1,
          verticalScale: 1,
          yawDegrees: 0,
          branchLengthScale: 1,
          leafSizeScale: 1,
          trunkThicknessScale: 1,
          branchDensity: 1,
          branchCurvatureDegreesPerMeter: 0
        })
      )
    ),
    variations: Object.freeze(
      profile.variations.map((variation) =>
        Object.freeze({
          ...variation,
          horizontalScale: 1,
          verticalScale: 1,
          yawRadians: 0,
          branchLengthScale: 1,
          leafSizeScale: 1,
          trunkThicknessScale: 1,
          branchDensity: 1,
          branchCurvatureRadiansPerMeter: 0,
          branchDirectionSeed: 0
        })
      )
    )
  });
}
