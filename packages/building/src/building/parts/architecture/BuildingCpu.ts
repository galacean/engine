// CPU side of the building runtime: design a core draft and prepare what the main thread
// draws. The same functions run in the Worker and, for tests and custom terrain, on the main
// thread. Inputs and outputs are plain data.
import { designBuildingCore, type BuildingCoreDraft, type HostRef } from "../../core";
import { buildingDraftRegion, createBuildingTypeRegistry } from "../../partTypes";
import {
  coreBuildingEnvironment,
  coreBuildingFocus,
  coreBuildingGrounding,
  coreBuildingLayout,
  coreBuildingPalette,
  coreBuildingRenderInput,
  coreBuildingView,
  coreBuildingDiagnostics
} from "../../render/CoreBuilding";
import { groundSupportsInRegion, type ConstructionGrounding } from "../../runtime/TerrainField";
import type { ConstructionTerrainGrid } from "../../runtime/TerrainField";
import { ConstructionSurfaceQuery } from "../../runtime/ConstructionSurfaceQuery";
import type { BuildingUnitAssets } from "../../runtime/BuildingUnitAssets";
import type { TerrainHeight } from "../../runtime/PublishedWallProfile";
import { prepareBuildingTerrain, type BuildingPlacementFrame } from "./BuildingTerrain";

const registry = createBuildingTypeRegistry();

/** A draft is plain data: groups, parts and connections. */
export function validateBuildingDraft(draft: BuildingCoreDraft): void {
  if (!draft || !Array.isArray(draft.groups) || !Array.isArray(draft.parts))
    throw Error("A building draft has groups and parts");
  if (draft.connections !== undefined && !Array.isArray(draft.connections))
    throw Error("Building draft connections must be a list");
  for (const [name, items] of [
    ["group", draft.groups],
    ["part", draft.parts],
    ["connection", draft.connections ?? []]
  ] as const) {
    const ids = items.map((x) => x.id);
    if (ids.some((id) => typeof id !== "string" || !id) || new Set(ids).size !== ids.length)
      throw Error(`Invalid or duplicate building ${name} identity`);
  }
  const groups = new Set(draft.groups.map((g) => g.id)),
    parts = new Set(draft.parts.map((p) => p.id));
  for (const part of draft.parts) if (!groups.has(part.group)) throw Error(`Missing group for ${part.id}`);
  for (const c of draft.connections ?? [])
    for (const id of c.kind === "attach" ? [c.guest, ...c.hosts.map((h: HostRef) => h.part)] : c.parts)
      if (!parts.has(id)) throw Error(`Missing connection endpoint "${id}" in ${c.id}`);
}
export interface BuildingCpuOptions {
  frame?: BuildingPlacementFrame;
  /** Fail when any part or connection reports a diagnostic. Default: true. */
  requireAllParts?: boolean;
}
/** The ground a draft stands on in world coordinates, [minX, minZ, maxX, maxZ]: the
 * region around its footprints, through the frame. */
export function buildingWorldRegion(
  draft: BuildingCoreDraft,
  frame: BuildingPlacementFrame = { position: [0, 0, 0], rotationY: 0 }
): number[] {
  const local = buildingDraftRegion(draft) ?? [0, 0, 0, 0];
  const c = Math.cos(frame.rotationY),
    s = Math.sin(frame.rotationY);
  const region = [Infinity, Infinity, -Infinity, -Infinity];
  for (const x of [local[0], local[2]])
    for (const z of [local[1], local[3]]) {
      const wx = frame.position[0] + c * x + s * z,
        wz = frame.position[2] - s * x + c * z;
      region[0] = Math.min(region[0], wx);
      region[1] = Math.min(region[1], wz);
      region[2] = Math.max(region[2], wx);
      region[3] = Math.max(region[3], wz);
    }
  return region;
}
/** The ground a draft samples: the terrain grid around its footprints, in the frame. */
export function buildingGround(
  draft: BuildingCoreDraft,
  terrain: ConstructionTerrainGrid,
  frame: BuildingPlacementFrame = { position: [0, 0, 0], rotationY: 0 }
) {
  const region = buildingWorldRegion(draft, frame);
  return prepareBuildingTerrain({ ...terrain, supports: groundSupportsInRegion(terrain, region) }, frame);
}
/** Designs a draft on a ground and prepares the distance view, structure queries, palette
 * and focus poses. The design stays in the result for the later detail. */
export function prepareBuildingOnGround(
  draft: BuildingCoreDraft,
  ground: { height: TerrainHeight; grounding: ConstructionGrounding },
  assets: BuildingUnitAssets,
  options: Pick<BuildingCpuOptions, "requireAllParts"> = {}
) {
  validateBuildingDraft(draft);
  const environment = coreBuildingEnvironment(ground.height, assets);
  const result = designBuildingCore(draft, registry, { environment });
  if (options.requireAllParts !== false && result.diagnostics.length)
    throw Error(result.diagnostics.map((d) => d.source + ": " + d.message).join("\n"));
  const layout = coreBuildingLayout(result, registry, { environment });
  const preview = coreBuildingView(layout, {
    assets,
    includeAppearance: true,
    includeStructure: true,
    retainDecorationParts: true
  });
  const structure =
    preview.structuralParts && new ConstructionSurfaceQuery(preview.structuralParts, [0, 0, 0], (id) => id).snapshot();
  return {
    prepared: { layout, preview, ground, assets },
    preview,
    structure,
    appearance: coreBuildingPalette(layout),
    focus: coreBuildingFocus(layout),
    diagnostics: [...result.diagnostics, ...coreBuildingDiagnostics(layout)]
  };
}
export async function prepareBuildingCpu(
  draft: BuildingCoreDraft,
  terrain: ConstructionTerrainGrid,
  assets: BuildingUnitAssets,
  options: BuildingCpuOptions = {}
) {
  return prepareBuildingOnGround(draft, buildingGround(draft, terrain, options.frame), assets, options);
}
export type BuildingCpuPreparation = ReturnType<typeof prepareBuildingOnGround>;
/** The resident detail of a prepared design: render input and ground contact. */
export async function compileBuildingCpu(prepared: BuildingCpuPreparation["prepared"]) {
  const { layout, preview, ground, assets } = prepared;
  return {
    renderInput: await coreBuildingRenderInput(layout, preview, assets),
    grounding: coreBuildingGrounding(layout, preview, ground)
  };
}
