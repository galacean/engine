import type { TreeAssemblyPart } from "./TreeAssemblyPlan";

/** Whole-plant reference scale shared by tree, shrub, grass, and flower authoring previews. */
export const VEGETATION_AUTHORING_REFERENCE_SCALE = 1.5;

/** Maximum specimens per row in the asset overview. */
export const ASSET_SHOWCASE_COLUMNS = 4;

/** Shared reveal duration for every assembled asset category. */
export const ASSET_ASSEMBLY_ENTRANCE_DURATION_MS = 2_000;

/** Scene-space bounds of a complete preview stand, including every instance and LOD. */
export interface AssetAssemblyStandBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** Packs measured stands into aligned columns and rows, from front to back, without changing their scale. */
export function layoutAssetAssemblyStands(
  bounds: readonly AssetAssemblyStandBounds[],
  clearance: number,
  columns = Math.max(1, bounds.length)
): readonly (readonly [x: number, z: number])[] {
  if (!Number.isFinite(clearance) || clearance < 0) throw new RangeError("Stand clearance must be non-negative");
  if (!Number.isInteger(columns) || columns < 1) throw new RangeError("Stand columns must be a positive integer");
  for (const bound of bounds) {
    if (
      ![...bound.min, ...bound.max].every(Number.isFinite) ||
      bound.min.some((value, axis) => value > bound.max[axis])
    ) {
      throw new RangeError("Stand bounds must be finite and ordered");
    }
  }
  const columnCount = Math.min(columns, bounds.length);
  const widths = Array.from({ length: columnCount }, () => clearance);
  const depths = Array.from({ length: Math.ceil(bounds.length / columns) }, () => 0);
  bounds.forEach((bound, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    widths[column] = Math.max(widths[column], bound.max[0] - bound.min[0]);
    depths[row] = Math.max(depths[row], bound.max[2] - bound.min[2]);
  });
  const width = widths.reduce((sum, value) => sum + value, 0) + clearance * Math.max(0, columnCount - 1);
  let cursor = -width * 0.5;
  const centers = widths.map((value) => {
    const center = cursor + value * 0.5;
    cursor += value + clearance;
    return center;
  });
  let front = 0;
  const fronts = depths.map((depth) => {
    const value = front;
    front -= depth + clearance;
    return value;
  });
  return bounds.map((bound, index) => {
    const x = centers[index % columns] - (bound.min[0] + bound.max[0]) * 0.5;
    return [x, fronts[Math.floor(index / columns)] - bound.max[2]] as const;
  });
}

/** Exact vertical reveal interval occupied by one instanced asset population. */
export interface AssetAssemblyRevealRange {
  readonly minimumY: number;
  readonly height: number;
}

/**
 * Resolves the visible vertical interval so every asset category consumes the complete two-second reveal.
 * @param parts Instanced population transforms.
 * @param localMinimumY Source geometry lower bound.
 * @param localMaximumY Source geometry upper bound.
 * @returns World-space lower bound and positive occupied height.
 */
export function resolveAssetAssemblyRevealRange(
  parts: readonly TreeAssemblyPart[],
  localMinimumY: number,
  localMaximumY: number
): AssetAssemblyRevealRange {
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (const part of parts) {
    const lower = part.position[1] + localMinimumY * part.scale[1];
    const upper = part.position[1] + localMaximumY * part.scale[1];
    minimumY = Math.min(minimumY, lower, upper);
    maximumY = Math.max(maximumY, lower, upper);
  }
  return { minimumY, height: Math.max(0.001, maximumY - minimumY) };
}

/**
 * Keeps the last mesh available in an authoring overview while preserving every mesh-to-mesh transition.
 * Enabling distance culling restores the source's terminal threshold without modifying source data.
 */
export function resolveAssetAssemblyLodHeights(sourceHeights: readonly number[], distanceCulling: boolean): number[] {
  return sourceHeights.map((height, index) => (!distanceCulling && index === sourceHeights.length - 1 ? 0 : height));
}

/** Distance-collapse values serialized from one production vegetation material. */
export interface AssetAssemblyDistanceFadeProfile {
  readonly enabled: boolean;
  readonly distance: number;
  readonly falloff: number;
}

/**
 * Resolves the same five-metre vertex-collapse curve used by Grasslands VegetationWind.
 * @param distance Camera distance to one independently batched instance.
 * @param profile Production material or style-owned distance-collapse values.
 * @returns Continuous instance coverage in the inclusive range zero to one.
 */
export function resolveAssetAssemblyDistanceFade(
  distance: number,
  profile: Readonly<AssetAssemblyDistanceFadeProfile>
): number {
  if (!profile.enabled) return 1;
  const cameraDepthFade = (distance - profile.distance) / 5;
  const falloffWeight = profile.falloff * 0.5;
  return clamp01((1 - cameraDepthFade) * (1 - falloffWeight) + cameraDepthFade * falloffWeight);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
