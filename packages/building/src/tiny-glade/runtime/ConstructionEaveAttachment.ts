import { halfDormerCrossesEave } from "./RecoveredHalfDormer.ts";
import { RecoveredCottageRoofSection } from "./RecoveredCottageRoofSampler.ts";
import { closestWallCurveCoordinate, sampleWallArclength } from "./RecoveredWallSpace.ts";
import { add, sub, mul, f32, type RoofCurve, type RoofFootprint } from "./RecoveredRoofMath.ts";
import { isFlatRoofHeight } from "./RoofMode.ts";
import type { DecorationSurfaceOwner } from "./DecorationSurfaceOwner";
import type { PublishedWallProfile } from "./PublishedWallProfile.ts";
import type { WallConnectionShape } from "./WallConnectionTypes.ts";

/** Shared native eave selector. Ordinary body collision bounds decide crossing;
 * family-specific half meshes/roof profiles are generated only after acceptance. */
export function constructionEaveAttachment(
  building: DecorationSurfaceOwner,
  shape: WallConnectionShape,
  profile: PublishedWallProfile,
  curve: RoofCurve,
  footprint: RoofFootprint,
  pivotU: number,
  pivotY: number,
  minY: number,
  maxY: number
) {
  if (isFlatRoofHeight(building.roof.surface.height_parameter))
    return { ok: false as const, reason: "An eave window requires a pitched roof" };
  const point = sampleWallArclength(curve, pivotU);
  const tangent = curve.tangent(pivotU / curve.length);
  if (shape.type === "rectangle" && f32(building.roof.surface.ridge_parameter) === 1) {
    const edge = new RecoveredCottageRoofSection(footprint).closestRectangleEdge(point[0], point[1]).edge;
    if (edge === building.roof.surface.axis || edge === building.roof.surface.axis + 2)
      return { ok: false as const, reason: "An eave window cannot attach to a gable-end wall" };
  }
  const { index, t } = closestWallCurveCoordinate(profile.projected, point);
  const wallTop = add(profile.top[index], mul(t, sub(profile.top[index + 1], profile.top[index])));
  if (!halfDormerCrossesEave(pivotY, minY, maxY, wallTop))
    return { ok: false as const, reason: "The window must cross the host eave; its top is at or below the wall top" };
  return { ok: true as const, point, tangent, wallTop };
}
