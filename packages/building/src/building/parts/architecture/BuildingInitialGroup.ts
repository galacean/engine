import type { BuildingCoreDraft } from "../../core/index";
import { designBuildingCore, expandUnits } from "../../core/index";
import {
  buildingFootprints,
  createBuildingTypeRegistry,
  MOUNTED_PART_TYPES,
  placeBuildingGroup
} from "../../partTypes/index";
import { coreBuildingEnvironment } from "../../render/CoreBuilding";
import type { BuildingUnitAssets } from "../../runtime/BuildingUnitAssets";
import type { ConstructionTerrainGrid } from "../../runtime/TerrainField";
import { buildingDraftSource, type BuildingSourceOptions } from "./BuildingSource";
import { prepareBuildingTerrain } from "./BuildingTerrain";

export interface InitialBuildingGroupInput {
  readonly id: string;
  readonly draft: BuildingCoreDraft;
  readonly position: [number, number, number];
}

export type InitialBuildingGroupOutput = ReturnType<typeof buildingDraftSource>;

const registry = createBuildingTypeRegistry();
const mountedTypes = new Set<string>(MOUNTED_PART_TYPES);

/**
 * Pure CPU design + mount-filtering + local-frame normalization for one initial building group.
 * Shared identically by the main thread and `BuildingWorker` so startup can fan out across cores.
 */
export function designInitialBuildingGroup(
  group: InitialBuildingGroupInput,
  terrain: ConstructionTerrainGrid,
  assets: BuildingUnitAssets,
  library: string,
  layoutKey?: string
): InitialBuildingGroupOutput {
  const height = prepareBuildingTerrain(terrain, { position: group.position, rotationY: 0 }).height;
  const environment = coreBuildingEnvironment(height, assets);
  const design = designBuildingCore(group.draft, registry, { environment });
  // Keep only the mounted parts the design lays; a part whose geometry failed is not among
  // the design's parts at all.
  const laid = new Set(
    design.parts.flatMap((p) =>
      p.identity.kind === "author" && mountedTypes.has(p.type) && expandUnits(p, registry, { environment }).length
        ? [p.identity.id]
        : []
    )
  );
  const parts = group.draft.parts.filter((p) => !mountedTypes.has(p.type) || laid.has(p.id));
  const ids = new Set(parts.map((p) => p.id));
  const draft: BuildingCoreDraft = {
    ...group.draft,
    parts,
    connections: (group.draft.connections ?? []).filter((c) =>
      (c.kind === "attach" ? [c.guest, ...c.hosts.map((h) => h.part)] : c.parts).every((id) => ids.has(id))
    )
  };
  // Scene nodes own position and orientation. Keep each group's footprints in its node's
  // local coordinates, exactly as when a user moves that group in the editor.
  const groupTransforms: NonNullable<BuildingSourceOptions["groupTransforms"]> = {};
  const local = {
    groups: [] as BuildingCoreDraft["groups"][number][],
    parts: [] as BuildingCoreDraft["parts"][number][],
    connections: draft.connections
  };
  for (const g of draft.groups) {
    const own = draft.parts.filter((p) => p.group === g.id);
    const shape = buildingFootprints(g, own)[0];
    const placed = shape?.rectangle ?? shape?.circle;
    if (!placed) {
      local.groups.push(g);
      local.parts.push(...own);
      continue;
    }
    const angle = shape!.rectangle ? shape!.rectangle.rotation : (shape!.circle!.phase ?? 0);
    groupTransforms[g.id] = {
      position: [placed.center[0], 0, placed.center[1]],
      rotation: [0, (-angle * 180) / Math.PI, 0]
    };
    // The inverse of the node's transform brings the footprints to the node's origin.
    const c = Math.cos(angle),
      s = Math.sin(angle),
      [x, z] = placed.center;
    const inverse = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, -(c * x + s * z), 0, s * x - c * z, 1];
    const moved = placeBuildingGroup(g, own, inverse);
    local.groups.push(moved.group);
    local.parts.push(...moved.parts);
  }
  return buildingDraftSource(local, {
    id: "building-group:" + (layoutKey === undefined ? group.id : JSON.stringify([layoutKey, group.id])),
    name: "建筑组",
    position: group.position,
    groupTransforms,
    assetLibrary: library
  });
}
