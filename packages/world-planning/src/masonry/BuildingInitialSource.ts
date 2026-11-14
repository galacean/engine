import type { IslandPlan } from "../semantic-study/IslandPlanModel";
import type { ConstructionTerrainGrid } from "@galacean/engine-building/building/runtime/TerrainField";
import type { BuildingUnitAssets } from "@galacean/engine-building/building/runtime/BuildingUnitAssets";
import { initialBuildingDrafts } from "./BuildingInitialDraft";
import { designBuildingCore, expandUnits, type BuildingCoreDraft } from "@galacean/engine-building/building/core/index";
import {
  buildingFootprints,
  createBuildingTypeRegistry,
  MOUNTED_PART_TYPES,
  placeBuildingGroup
} from "@galacean/engine-building/building/partTypes/index";
import { coreBuildingEnvironment } from "@galacean/engine-building/building/render/CoreBuilding";
import {
  buildingDraftSource,
  type BuildingSourceOptions
} from "@galacean/engine-building/building/parts/architecture/BuildingSource";
import { prepareBuildingTerrain } from "@galacean/engine-building/building/parts/architecture/BuildingTerrain";

const registry = createBuildingTypeRegistry();

/** One-shot creation from published planning intent. Style builders publish parts
 * directly; mounted parts that the design does not lay, such as a window inside a
 * neighbouring house, are never saved as objects. */
export async function initialBuildingSource(
  plan: IslandPlan,
  terrain: ConstructionTerrainGrid,
  assets: BuildingUnitAssets,
  library: string,
  signal?: AbortSignal
) {
  const result: ReturnType<typeof buildingDraftSource> = { rootEntities: [], entities: [], components: [] };
  for (const group of initialBuildingDrafts(plan)) {
    signal?.throwIfAborted();
    const height = prepareBuildingTerrain(terrain, { position: group.position, rotationY: 0 }).height;
    const environment = coreBuildingEnvironment(height, assets);
    const design = designBuildingCore(group.draft, registry, { environment });
    // Keep only the mounted parts the design lays; a part whose geometry failed is not among
    // the design's parts at all.
    const mounts = new Set<string>(MOUNTED_PART_TYPES);
    const laid = new Set(
      design.parts.flatMap((p) =>
        p.identity.kind === "author" && mounts.has(p.type) && expandUnits(p, registry, { environment }).length
          ? [p.identity.id]
          : []
      )
    );
    const parts = group.draft.parts.filter((p) => !mounts.has(p.type) || laid.has(p.id));
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
    const source = buildingDraftSource(local, {
      id: "building-group:" + group.id,
      name: "建筑组",
      position: group.position,
      groupTransforms,
      assetLibrary: library
    });
    result.rootEntities.push(...source.rootEntities);
    result.entities.push(...source.entities);
    result.components.push(...source.components);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  signal?.throwIfAborted();
  return result;
}
