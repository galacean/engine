import type { BuildingUnitTemplate } from "../BuildingAlgorithms";
import { copyBuildingValue } from "../BuildingAlgorithms";
import type { Entity, PrefabResource } from "@galacean/engine";
import type { ProfileFootprint } from "../../runtime/ProfileParameters";
import type { ConstructionDecorationSpec } from "../../runtime/ConstructionDecorations";
import type { UnitPlacementBinding as MasonryBinding, UnitPlacementOverride } from "../../runtime/UnitPlacement";
import type { MaterialUnit } from "../../runtime/UnitPlacementStyle";
export type BuildingPartRegion = Omit<UnitPlacementOverride, "binding_id">;

export interface BuildingAttachmentUnit {
  nativeAttachment: Pick<ConstructionDecorationSpec, "kind" | "type" | "rank" | "frameMaterial">;
}

/** Explicit source mesh from the selected native asset library. */
export interface BuildingLibraryMeshUnit {
  libraryMesh: "roofSpire";
}

/** Author data only. No generated meshes, placements, children or recursive recipes. */
export interface BuildingBasePart {
  id: string;
  type: string;
  group: string;
  support: {
    generator: string;
    params: Record<string, any>;
  };
  algorithm: { type: string; boundary?: MasonryBinding["rule"]["boundary"] };
  unit:
    | MaterialUnit
    | Entity
    | PrefabResource
    | BuildingUnitTemplate
    | BuildingAttachmentUnit
    | BuildingLibraryMeshUnit;
  /** Stable local UV edits applied after placement; never generated geometry. */
  regions?: BuildingPartRegion[];
  transform?: number[];
  params: Record<string, any>;
  /** Native roof material palette; independent of geometry and placement. */
  appearance?: { roofColor: number };
}
export interface BuildingRelation {
  id: string;
  from: { part: string; boundary: string };
  to: { part: string; boundary: string };
  rule: string;
}
/** Groups carry identity/palette only; geometry lives exclusively on parts. */
export interface BuildingGroup {
  id: string;
  /** Stable appearance namespace, independent of copied Scene identities. */
  variationKey?: string;
  seed: number;
  wallColor: number;
  woodColor: number;
}
export interface BuildingDraft {
  groups: BuildingGroup[];
  parts: BuildingBasePart[];
  relations: BuildingRelation[];
}
export type BuildingFootprint = ProfileFootprint;
export interface SurfaceStyle {
  /** Preserve material variation when giving a part a new identity. */
  variationKey?: string;
  regions?: BuildingPartRegion[];
  appearance?: BuildingBasePart["appearance"];
  algorithm?: BuildingBasePart["algorithm"];
  unit?: BuildingBasePart["unit"];
  footprint?: MasonryBinding["footprint"];
  seed?: MasonryBinding["seed"];
}
export function emptyBuildingDraft(): BuildingDraft {
  return { groups: [], parts: [], relations: [] };
}
export function combineBuildingDrafts(...drafts: readonly BuildingDraft[]): BuildingDraft {
  const result = copyBuildingValue({
    groups: drafts.flatMap((d) => d.groups),
    parts: drafts.flatMap((d) => d.parts),
    relations: drafts.flatMap((d) => d.relations)
  });
  validateBuildingDraft(result);
  return result;
}
/** Validate IDs within one author collection; resolved identities are validated separately. */
export function validateBuildingIdentities(name: string, items: readonly { id: string }[]): void {
  const ids = items.map((x) => x.id);
  if (ids.some((id) => typeof id !== "string" || !id) || new Set(ids).size !== ids.length)
    throw Error(`Invalid or duplicate building ${name} identity`);
}
export function validateBuildingAppearance(appearance: BuildingBasePart["appearance"]): void {
  if (appearance && (!Number.isInteger(appearance.roofColor) || appearance.roofColor < 0 || appearance.roofColor > 12))
    throw Error("Roof color requires a native palette index from 0 to 12");
}
export function validateBuildingDraft(d: BuildingDraft): void {
  for (const [name, items] of [
    ["group", d.groups],
    ["part", d.parts],
    ["relation", d.relations]
  ] as const) {
    validateBuildingIdentities(name, items);
  }
  for (const value of [...d.groups.map((g) => g.variationKey), ...d.parts.map((p) => p.params.variationKey)])
    if (value !== undefined && (typeof value !== "string" || !value))
      throw Error("Nonempty material variation key required");
  for (const group of d.groups) {
    if (!Number.isInteger(group.seed) || group.seed < 0 || group.seed > 0xffffffff)
      throw Error("Building group seed requires uint32");
    if (![group.wallColor, group.woodColor].every((n) => Number.isInteger(n) && n >= 0))
      throw Error("Invalid building palette");
  }
  const groups = new Set(d.groups.map((g) => g.id)),
    parts = new Set(d.parts.map((p) => p.id));
  for (const p of d.parts) {
    if (!groups.has(p.group)) throw Error(`Missing group for ${p.id}`);
    validateBuildingAppearance(p.appearance);
    if (["identity", "selection", "localId"].some((key) => key in p))
      throw Error("Design identities cannot be stored as author data: " + p.id);
    if ("publication" in p) throw Error("Resolved publication metadata cannot be stored as author data: " + p.id);
  }
  for (const r of d.relations)
    if (!parts.has(r.from.part) || !parts.has(r.to.part)) throw Error(`Missing relation endpoint: ${r.id}`);
}

export const profileSupportGenerators = new Set([
  "wallProfile",
  "roofProfile",
  "foundationProfile",
  "wallStrip",
  "attachmentMount"
]);
