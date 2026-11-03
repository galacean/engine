import type { MasonryDocument } from "./MasonryDocument";
import { constructionShape } from "./ConstructionSource";
import { publishLevelWallProfile } from "./PublishedWallProfile";
import { prepareConstructionTerrain } from "./ConstructionTerrain";
import type { ConstructionGrounding, ConstructionTerrainGrid } from "./ConstructionTerrain";

/** Rigid relocation of the currently accepted grounded group. Based on recovered
 * WallGroupTransformCache::target_states: share the mean change of level eaves,
 * then solve each source height. The native UI's unknown min/max height clamps
 * are NOT invented here: invalid positive-height results reject the transaction.
 * Explicit structural/height edits and terrain refreshes follow normal compile.
 * Supports are transient observations; only solved author heights are persisted. */
export function reconcileConstructionRelocation(
  next: MasonryDocument,
  previous: MasonryDocument,
  grounding: ConstructionGrounding | undefined,
  grid: ConstructionTerrainGrid
): MasonryDocument {
  if (
    next.construction.environment.type !== "host_terrain" ||
    previous.construction.environment.type !== "host_terrain"
  )
    return next;
  const a = previous.placement,
    b = next.placement;
  if (!a || !b || (a.position[0] === b.position[0] && a.position[2] === b.position[2] && a.rotationY === b.rotationY))
    return next;
  if (JSON.stringify(next.construction) !== JSON.stringify(previous.construction)) return next;
  const supports = new Map(grounding?.supports?.map((s) => [s.id, s]));
  const terrain = prepareConstructionTerrain(next, grid).height;
  const members = next.construction.buildings.map((building) => {
    const old = supports.get(building.id);
    if (!old) throw Error("移动建筑缺少已发布支撑数据，请先适应当前地形");
    const profile = publishLevelWallProfile(constructionShape(building), building.height, terrain, 0, true);
    return { building, old, profile };
  });
  if (!members.length) return next;
  const delta = members.reduce((sum, m) => sum + m.profile.topY - m.old.topY, 0) / members.length;
  const result = structuredClone(next);
  for (const m of members) {
    const height = Math.fround(m.old.topY + delta - m.profile.maxGround + 0.46);
    if (!(height > 0) || !Number.isFinite(height))
      throw Error("此坡度下无法保持整组檐口关系和正墙高；请单独调整建筑高度或位置");
    result.construction.buildings.find((b) => b.id === m.building.id)!.height = height;
  }
  return result;
}
