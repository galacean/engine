import { decorationMeshBounds, type ConstructionDecorationMeshes } from "./ConstructionDecorationMeshes";
import { constructionDecorationRecipe } from "./ConstructionDecorationRecipe";
import { resolvePitchedRoofAttachment, type PitchedRoofAttachment } from "./ConstructionPitchedRoofAttachment";
import { cottageRoofClearance } from "./RecoveredCottageRoofClearance";
import { RecoveredCottageRoofSampler } from "./RecoveredCottageRoofSampler";
import { f32, sub, mul, type RoofSurface, type RoofFootprint } from "./RecoveredRoofMath";
import type { GothicSupportMesh } from "./GothicHostSurface";
import type { ConstructionDecorationSpec } from "./ConstructionDecorations";
import type { ConstructionDecorationIssueCode } from "./ConstructionDecorationCatalog";

export type CottageRoofInstallation =
  | {
      ok: true;
      attachment: PitchedRoofAttachment;
      clearance: { width: number; height: number; topY: number; limitY: number };
    }
  | { ok: false; code: ConstructionDecorationIssueCode; reason: string };

/** Installation geometry only: the caller must also validate the resulting
 * dynamic collider before publishing any body, opening or roof unit.
 * Editor UV addresses the plan-view host chart; native eligibility consumes
 * the resolved position and native mesh UV. Explicit resizing scales native
 * installation dimensions and is our API extension, not an observed game UI.
 */
export function cottageRoofInstallation(
  assets: ConstructionDecorationMeshes | undefined,
  spec: ConstructionDecorationSpec,
  surface: RoofSurface,
  footprint: RoofFootprint,
  preparedSupport?: GothicSupportMesh
): CottageRoofInstallation {
  const resolved = resolvePitchedRoofAttachment(surface, footprint, spec.uv!, spec.bottom, preparedSupport);
  if (!resolved.ok)
    return {
      ok: false,
      code: resolved.reason === "outside-roof" ? "INSUFFICIENT_SPACE" : "UNSUPPORTED_ATTACHMENT",
      reason:
        resolved.reason === "outside-roof"
          ? "Roof UV lies outside the roof surface"
          : resolved.reason === "flat-roof"
            ? "A full Cottage dormer requires a pitched roof; flat roofs support roof hatches"
            : "A full Cottage dormer requires a roof slope, not its horizontal top cap"
    };
  const { attachment } = resolved;
  // location_valid 0x101165a30: native v<1.9 and the two gable-side U
  // intervals (left closed, right open). This is not a normalized editor V test.
  if (!("radius" in footprint) && f32(surface.ridge_parameter) === 1 && attachment.meshUV[1] < f32(1.9)) {
    for (const side of [surface.axis, surface.axis + 2]) {
      if (attachment.meshUV[0] >= side * 0.25 && attachment.meshUV[0] < (side + 1) * 0.25)
        return {
          ok: false,
          code: "UNSUPPORTED_ATTACHMENT",
          reason: "A full Cottage dormer cannot attach to a gable end"
        };
    }
  }
  const rank = spec.rank ?? 1;
  const recipe = constructionDecorationRecipe(assets, "dormer-cottage", rank)!;
  const bounds = decorationMeshBounds(assets, `window_cottage_${rank}x1_full_dormer`);
  const width = mul(sub(bounds.max[0], bounds.min[0]), spec.width / recipe.installationSize[0]);
  const height = mul(sub(bounds.max[1], bounds.min[1]), spec.height / recipe.installationSize[1]);
  const clearance = cottageRoofClearance(
    attachment.transform.position,
    rank,
    new RecoveredCottageRoofSampler(surface, footprint),
    width,
    height
  );
  if (!clearance.valid)
    return {
      ok: false,
      code: clearance.reason === "roof-corner" ? "CROSSES_CORNER" : "INSUFFICIENT_SPACE",
      reason:
        clearance.reason === "roof-corner"
          ? `Dormer installation spans a roof-section corner at height ${clearance.sectionY} metres`
          : `Dormer requires top clearance to ${clearance.topY} metres; the roof permits ${clearance.limitY} metres`
    };
  return { ok: true, attachment, clearance: { width, height, topY: clearance.topY, limitY: clearance.limitY } };
}
