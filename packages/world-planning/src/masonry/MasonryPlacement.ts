import type { RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";
import type { ConstructionTerrainSource } from "@galacean/engine-building/tiny-glade/runtime/TerrainField";
import type { ConstructionGroundMesh } from "@galacean/engine-building/tiny-glade/runtime/ConstructionGroundSupports";
import {
  SEED_WORLD_HEIGHT_RANGE,
  seedWorldOriginX,
  seedWorldOriginZ,
  type SeedWorldFields
} from "../runtime/SeedWorldFields.ts";
const rockSupports = new WeakMap<RockFormationMesh, ConstructionGroundMesh>();
function rockSupport(formation: RockFormationMesh): ConstructionGroundMesh {
  let support = rockSupports.get(formation);
  if (!support) {
    // Own world-space snapshots, retaining identity for unchanged immutable meshes.
    support = {
      positions: formation.mesh.positions.map((v, i) => v + formation.origin[i % 3]),
      indices: formation.mesh.indices.slice()
    };
    rockSupports.set(formation, support);
  }
  return support;
}

/** Replace rock supports while retaining the accepted canonical terrain snapshot. */
export function masonryRockTerrainSource(
  previous: ConstructionTerrainSource,
  formations: readonly RockFormationMesh[],
  revision: string | number
): ConstructionTerrainSource {
  return { revision, grid: { ...previous.grid, supports: formations.map(rockSupport) } };
}

/** Immutable terrain input; independent of scene publication and its runtime owners. */
export interface MasonryTerrainSnapshot {
  readonly revision: number;
  readonly data: { readonly fields: SeedWorldFields };
}
/** Capture only the published final R16 field, never the mutable transition or live buffer. */
export function masonryTerrainSource(
  published: MasonryTerrainSnapshot,
  formations: readonly RockFormationMesh[] = []
): ConstructionTerrainSource {
  const fields = published.data.fields;
  return {
    revision: published.revision,
    grid: {
      samples: fields.heightSamples.slice(),
      supports: formations.map(rockSupport),
      resolution: fields.heightResolution,
      origin: [seedWorldOriginX(fields), seedWorldOriginZ(fields)],
      size: fields.sizeMetres,
      decode: {
        offset: fields.heightDecode?.offset ?? SEED_WORLD_HEIGHT_RANGE.minimum,
        scale: fields.heightDecode?.scale ?? SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum
      }
    }
  };
}
/** Spawn belongs to the published IslandPlan, not its renderer data.plan projection. */
export function masonryPlacementAnchors(
  published: { readonly plan: { readonly spawn?: { readonly x: number; readonly z: number } } },
  view: { x: number; z: number }
): [number, number][] {
  const spawn = published.plan.spawn;
  if (!spawn || ![spawn.x, spawn.z, view.x, view.z].every(Number.isFinite))
    throw Error("已发布规划缺少有效出生点或当前观察位置");
  return [
    [view.x, view.z],
    [spawn.x, spawn.z]
  ];
}
