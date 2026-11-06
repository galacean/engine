import { type ConstructionDecorationMeshes } from "./ConstructionDecorationMeshes";
import { resolvePitchedRoofAttachment, type PitchedRoofAttachment } from "./ConstructionPitchedRoofAttachment";
import { constructionDecorationRecipe } from "./ConstructionDecorationRecipe";
import { cottageRoofClearance } from "./RecoveredCottageRoofClearance";
import { RecoveredCottageRoofSampler } from "./RecoveredCottageRoofSampler";
import { gothicRoofIntersection, gothicRoofProfilePeak } from "./GothicRoofTiles";
import { gothicForward, type GothicCollisionBounds } from "./GothicBlueprint";
import { f32, add, sub, mul, div, sqrt, type RoofSurface, type RoofFootprint } from "./RecoveredRoofMath";
import type { GothicSupportMesh } from "./GothicHostSurface";
import type { ConstructionDecorationSpec } from "./ConstructionDecorations";
import type { ConstructionDecorationIssueCode } from "./ConstructionDecorationCatalog";

/** Subtype 8 location_valid + check_if_dormer_ridge_is_within_roof_bounds.
 * Arbitrary public dimensions are an extension: scale the same authored peak
 * used by strips and the Gothic collider dimensions, never Cottage assets.
 * Static evidence ev_fa3ee7d94a797c44861a9a606e8a7591b4644a8a83fa18db2c398e7584370fb1.
 */
export function gothicRoofInstallation(
  assets: ConstructionDecorationMeshes | undefined,
  spec: ConstructionDecorationSpec,
  surface: RoofSurface,
  footprint: RoofFootprint,
  bounds: GothicCollisionBounds,
  support?: GothicSupportMesh
):
  | { ok: true; attachment: PitchedRoofAttachment; scale: [number, number, number] }
  | { ok: false; code: ConstructionDecorationIssueCode; reason: string } {
  const resolved = resolvePitchedRoofAttachment(surface, footprint, spec.uv!, spec.bottom, support);
  if (!resolved.ok)
    return {
      ok: false,
      code: resolved.reason === "outside-roof" ? "INSUFFICIENT_SPACE" : "UNSUPPORTED_ATTACHMENT",
      reason: `Gothic dormer requires a roof slope (${resolved.reason})`
    };
  const { attachment } = resolved;
  if (!("radius" in footprint) && f32(surface.ridge_parameter) === 1 && attachment.meshUV[1] < f32(1.9)) {
    for (const side of [surface.axis, surface.axis + 2]) {
      if (attachment.meshUV[0] >= side / 4 && attachment.meshUV[0] < (side + 1) / 4)
        return { ok: false, code: "UNSUPPORTED_ATTACHMENT", reason: "A Gothic dormer cannot attach to a gable end" };
    }
  }
  const rank = spec.rank ?? 1;
  const recipe = constructionDecorationRecipe(assets, "dormer-gothic", rank)!;
  const scale: [number, number, number] = [
    spec.width / recipe.installationSize[0],
    spec.height / recipe.installationSize[1],
    1
  ];
  const sampler = new RecoveredCottageRoofSampler(surface, footprint);
  const clearance = cottageRoofClearance(
    attachment.transform.position,
    rank,
    sampler,
    mul([0.72, 1.2, 1.54][rank - 1], scale[0]),
    mul(sub(bounds.max[1], bounds.min[1]), scale[1])
  );
  if (!clearance.valid)
    return {
      ok: false,
      code: clearance.reason === "roof-corner" ? "CROSSES_CORNER" : "INSUFFICIENT_SPACE",
      reason:
        clearance.reason === "roof-corner"
          ? "Gothic installation spans a roof-section corner"
          : `Gothic installation requires clearance to ${clearance.topY} metres; roof permits ${clearance.limitY}`
    };
  if (!("radius" in footprint)) {
    const p = attachment.transform.position;
    const peak = [p[0], add(p[1], gothicRoofProfilePeak(rank, scale[1])), p[2]];
    const back = gothicRoofIntersection(surface, footprint, peak[1], peak);
    if (!back || peak[1] > sub(add(surface.base_height, sampler.height), 0.1))
      return { ok: false, code: "INSUFFICIENT_SPACE", reason: "Gothic ridge exceeds the host roof" };
    const dx = sub(peak[0], back[0]),
      dz = sub(peak[2], back[2]);
    const inv = div(1, sqrt(add(mul(dx, dx), mul(dz, dz))));
    const forward = gothicForward(attachment.transform.quaternion);
    const alignment = add(mul(mul(forward[0], dx), inv), mul(mul(forward[2], dz), inv));
    // Native rejects strictly below .993 (including its zero-length NaN behavior).
    if (alignment < f32(0.993))
      return { ok: false, code: "CROSSES_CORNER", reason: "Gothic ridge crosses a differently facing roof section" };
  }
  return { ok: true, attachment, scale };
}
