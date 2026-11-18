/** Exact per-tree card counts submitted by the four procedural crown LODs. */
export interface TreeLeafCountTuning {
  readonly lod0Count: number;
  readonly lod1Count: number;
  readonly lod2Count: number;
  readonly lod3Count: number;
}

export const PROCEDURAL_TREE_LOD_LEAF_COUNTS = [250, 180, 48, 32] as const;

export const DEFAULT_TREE_LEAF_COUNT_TUNING: TreeLeafCountTuning = Object.freeze({
  lod0Count: PROCEDURAL_TREE_LOD_LEAF_COUNTS[0],
  lod1Count: PROCEDURAL_TREE_LOD_LEAF_COUNTS[1],
  lod2Count: PROCEDURAL_TREE_LOD_LEAF_COUNTS[2],
  lod3Count: PROCEDURAL_TREE_LOD_LEAF_COUNTS[3]
});

/** Leafless species are valid; foliage-bearing recipes still provide explicit positive counts. */
export const PROCEDURAL_TREE_LEAF_COUNT_MIN = 0;

// Each leaf card owns four vertices and the generated mesh currently uses Uint16 indices.
// This limit follows directly from the index representation rather than an artist-tuned cap.
export const PROCEDURAL_TREE_LEAF_COUNT_MAX = 2 ** (Uint16Array.BYTES_PER_ELEMENT * 8) / 4;

export function proceduralTreeLeafCounts(
  tuning: TreeLeafCountTuning
): readonly [lod0: number, lod1: number, lod2: number, lod3: number] {
  validateTreeLeafCountTuning(tuning);
  return [tuning.lod0Count, tuning.lod1Count, tuning.lod2Count, tuning.lod3Count];
}

/**
 * Balances raw leaf-card thinning against full projected-area preservation.
 *
 * Projected foliage coverage is proportional to `cardCount * linearScale^2`. For a retained-card
 * ratio `r`, no compensation leaves coverage at `r` while full compensation raises it to `1` and
 * visually cancels a complementary cross-fade. Their geometric mean is `sqrt(r)`, which yields the
 * linear scale `(1 / r)^(1 / 4)`: lower LODs remain fuller without erasing the visible fade delta.
 */
export function createBalancedFoliageLodScales(
  tuning: TreeLeafCountTuning
): readonly [lod0: number, lod1: number, lod2: number, lod3: number] {
  const counts = proceduralTreeLeafCounts(tuning);
  if (counts.some((count, lodIndex) => lodIndex > 0 && count > counts[lodIndex - 1])) {
    throw new RangeError("Balanced foliage LOD counts must be non-increasing");
  }
  if (counts[0] === 0) {
    if (counts.some((count) => count !== 0)) {
      throw new RangeError("A leafless LOD0 cannot balance foliage coverage in lower LODs");
    }
    return Object.freeze([1, 1, 1, 1] as const);
  }
  if (counts.some((count) => count === 0)) {
    throw new RangeError("Foliage-bearing LODs need at least one card to balance projected coverage");
  }
  return Object.freeze(counts.map((count) => Math.pow(counts[0] / count, 0.25)) as [number, number, number, number]);
}

export function validateTreeLeafCountTuning(tuning: TreeLeafCountTuning): void {
  for (const [label, value] of [
    ["lod0Count", tuning.lod0Count],
    ["lod1Count", tuning.lod1Count],
    ["lod2Count", tuning.lod2Count],
    ["lod3Count", tuning.lod3Count]
  ] as const) {
    if (!Number.isInteger(value) || value < PROCEDURAL_TREE_LEAF_COUNT_MIN || value > PROCEDURAL_TREE_LEAF_COUNT_MAX) {
      throw new RangeError(
        `Procedural tree ${label} must be an integer within ${PROCEDURAL_TREE_LEAF_COUNT_MIN}..${PROCEDURAL_TREE_LEAF_COUNT_MAX}`
      );
    }
  }
}
