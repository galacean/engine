import { buildingPlacementAlgorithms } from "../BuildingAlgorithms";
import "./ProfilePlacementAlgorithms";
import type { BuildingConstraint } from "./BuildingDesignRules";
import { validateBuildingDraft, type BuildingDraft, type BuildingBasePart } from "./BuildingDraft";
import { profileShape, publishProfileWall, profileRoofGeometry } from "../../runtime/ProfileGeometry";
import { profileWallEnvelope } from "../../runtime/ConstructionWallEnvelope";
import { unitFootprintScale } from "../../runtime/MaterialFootprint";
import {
  normalizeProfileFootprint,
  normalizeProfileHeight,
  normalizeProfileRoof,
  normalizeProfileFoundation,
  normalizeProfileFloors,
  normalizeProfileFinish
} from "../../runtime/ProfileParameters";
import { parseUnitPlacement } from "../../runtime/UnitPlacement";
import type { TerrainHeight } from "../../runtime/PublishedWallProfile";

/** Resolve the profile supports from part geometry and explicit relations.
 * No ConstructionBuilding, ConstructionSource or whole-house parser is involved.
 * Numeric identity order preserves native contact/seed ordering; part IDs remain
 * the references for bindings and connections. */
export function resolveBuildingProfileSupports(
  draft: BuildingDraft,
  constraints: readonly BuildingConstraint[],
  terrain: TerrainHeight
) {
  validateBuildingDraft(draft);
  const byId = new Map(draft.parts.map((p) => [p.id, p]));
  const parts = [...draft.parts].filter((p) => ["wallProfile", "wallStrip"].includes(p.support.generator));
  if (new Set(parts.map((p) => p.group)).size !== parts.length)
    throw Error("Profile solver requires one perimeter or strip per group");
  parts.sort(
    (a, b) => draft.groups.findIndex((g) => g.id === a.group) - draft.groups.findIndex((g) => g.id === b.group)
  );
  const bindingFor = (part: BuildingBasePart) => {
    const { basis } = buildingPlacementAlgorithms.profile(part.algorithm.type);
    const native = basis === "nativeMasonry";
    const surface = basis === "foundationSurface";
    if (
      (native && part.support.generator !== "wallProfile") ||
      (surface && part.support.generator !== "foundationProfile")
    )
      throw Error("Algorithm does not accept this profile support: " + part.algorithm.type);
    if ((native || surface) && part.unit !== "brick") throw Error("Native masonry geometry requires the brick Unit");
    return parseUnitPlacement(
      {
        id: part.id + "/placement",
        geometry_id: part.id,
        rule: { ...part.algorithm, type: native || surface ? "staggered_rows" : basis },
        unit_id: part.unit,
        footprint: part.params.footprint,
        seed: part.params.seed,
        variationKey: part.params.variationKey
      },
      { boundary: part.support.generator === "roofProfile", strip: part.support.generator === "wallStrip" }
    );
  };
  return parts.map((part, index) => {
    const group = draft.groups.find((g) => g.id === part.group)!;
    if (group.wallColor > 12) throw Error("Wall color outside original palette");
    if (group.woodColor > 10) throw Error("Wood color outside original palette");
    const roofRelations = constraints.filter((r) => r.from === part.id && r.kind === "wallRoofJoint");
    if (roofRelations.length > 1) throw Error("Ambiguous roof constraint for " + part.id);
    const roofPart = roofRelations[0] ? byId.get(roofRelations[0].to) : undefined;
    const foundationRelations = constraints.filter((r) => r.to === part.id && r.kind === "foundationContact");
    if (foundationRelations.length > 1) throw Error("Ambiguous foundation constraint for " + part.id);
    const foundationPart = foundationRelations[0] ? byId.get(foundationRelations[0].from) : undefined;
    const footprint = normalizeProfileFootprint(part.support.params),
      shape = profileShape(footprint);
    const height = normalizeProfileHeight(part.support.params.height);
    const wallBinding = bindingFor(part),
      roofBinding = roofPart ? bindingFor(roofPart) : undefined;
    const roofParameters = roofPart
      ? normalizeProfileRoof({
          ...roofPart.support.params.roof,
          ...(roofPart.appearance ? { color: roofPart.appearance.roofColor } : {})
        })
      : undefined;
    const foundationParameters = foundationPart ? normalizeProfileFoundation(foundationPart.support.params) : undefined;
    const structure = part.support.params.structureMaterial ?? "masonry";
    if (structure !== "masonry" && structure !== "timber") throw Error("Unknown wall structure material");
    const wallEnvelope = profileWallEnvelope(footprint, wallBinding.footprint);
    const profile = publishProfileWall(
      { shape, height, roof: roofParameters, foundation: foundationParameters },
      terrain,
      true,
      wallEnvelope
    );
    const seed = BigInt(group.seed);
    return {
      part,
      group,
      roofPart,
      foundationPart,
      wallBinding,
      wallPlacement: buildingPlacementAlgorithms.profile(part.algorithm.type).basis !== "nativeMasonry",
      foundationPlacement:
        !!foundationPart &&
        buildingPlacementAlgorithms.profile(foundationPart.algorithm.type).basis !== "foundationSurface",
      structureMaterial: structure === "timber" ? (1 as const) : (0 as const),
      roofBinding,
      foundationBinding: foundationPart ? bindingFor(foundationPart) : undefined,
      roofParameters,
      foundationParameters,
      floors: part.support.params.floors ? normalizeProfileFloors(part.support.params.floors) : undefined,
      finish: part.support.params.plaster ? normalizeProfileFinish(part.support.params.plaster) : undefined,
      id: group.id,
      variationKey: group.variationKey,
      height,
      nativeId: BigInt(index + 1),
      seed,
      slot: index,
      wallSeed: wallBinding.seed === "source" ? seed : BigInt(wallBinding.seed),
      unitScale: unitFootprintScale(wallBinding.footprint),
      roofUnitScale: unitFootprintScale(roofBinding?.footprint),
      roofSeed: roofBinding && roofBinding.seed !== "source" ? BigInt(roofBinding.seed) : undefined,
      wallEnvelope,
      shape,
      profile,
      wallRoofJoint: profile.wallRoofJoint,
      roof: roofParameters
        ? profileRoofGeometry(shape, roofParameters, profile.topY, wallEnvelope.finishOuter)
        : undefined
    };
  });
}
