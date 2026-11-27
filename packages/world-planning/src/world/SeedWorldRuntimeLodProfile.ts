import { SEED_WORLD_SURFACE_DETAIL_TERMINAL_DISTANCE_MULTIPLIER } from "./SeedWorldAssetPlacementProfile";
import { SEED_WORLD_SIZE_METRES } from "./SeedWorldPlanner";

/** Terminal procedural-tree distance shared by Seed World and its authored-asset preview. */
export const SEED_WORLD_TREE_TERMINAL_DISTANCE_METRES = SEED_WORLD_SIZE_METRES;

/** Source procedural meshes retained by Seed World; the redundant intermediate LOD1 is omitted */
export const SEED_WORLD_TREE_SOURCE_LOD_INDICES = Object.freeze([0, 2, 3] as const);

/**
 * Preserves the authored LOD0-to-LOD2 and LOD2-to-LOD3 transitions and appends the terminal threshold
 */
export function resolveSeedWorldTreeTransitionHeights(
  authoredHeights: readonly number[]
): readonly [lod0: number, lod2: number, lod3: 0] {
  if (authoredHeights.length !== 2) {
    throw new RangeError("Seed World procedural trees require exactly two authored mesh LOD thresholds");
  }
  return Object.freeze([authoredHeights[0], authoredHeights[1], 0] as const);
}

/**
 * Extends sparse ground-detail visibility without changing its authored mesh transition.
 * @param authoredHeights Two authored screen-relative thresholds ordered from LOD0 to LOD1.
 * @returns Shared LOD0 and extended LOD1 terminal thresholds.
 * @throws {RangeError} When the source does not contain exactly two authored thresholds.
 */
export function resolveSeedWorldSurfaceDetailTransitionHeights(
  authoredHeights: readonly number[]
): readonly [lod0: number, lod1: number] {
  if (authoredHeights.length !== 2) {
    throw new RangeError("Seed World surface-detail visibility requires exactly two authored LOD thresholds");
  }
  return Object.freeze([
    authoredHeights[0],
    authoredHeights[1] / SEED_WORLD_SURFACE_DETAIL_TERMINAL_DISTANCE_MULTIPLIER
  ] as const);
}
