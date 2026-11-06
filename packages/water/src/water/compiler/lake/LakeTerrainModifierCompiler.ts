import { validateLakeTerrainModifier, type LakeTerrainModifier } from "../../authoring/lake/LakeTerrainModifier";
import type { LakeBoundaryV1 } from "../../authoring/lake/LakeBoundary";
import {
  copyWaterTerrainSnapshot,
  isWaterTerrainSnapshot,
  waterTerrainVertexRange,
  type WaterTerrainSnapshot
} from "../../authoring/terrain/WaterTerrainSnapshot";
import { decodeLakeBoundary, sampleLakeBoundary, sampleLakeSignedShoreDistance } from "./LakeBoundaryCompiler";
import { hashStableValue } from "../shared/determinism";

/** Absolute cuts, not accumulated deltas. All patches in a composition refer to the same base. */
export interface LakeTerrainPatch {
  readonly id: string;
  readonly lakeId: string;
  readonly baseHash: string;
  /** Vertex bounds of the possible influence, including shoreline interpolation support. */
  readonly bounds: readonly [minX: number, minZ: number, maxX: number, maxZ: number];
  readonly indices: readonly number[];
  readonly heights: readonly number[];
  /** Cuts for every replacement grid in the same base, including empty cuts. */
  readonly refinements?: readonly {
    readonly id: string;
    readonly indices: readonly number[];
    readonly heights: readonly number[];
  }[];
}

export function compileLakeTerrainModifier(
  base: WaterTerrainSnapshot,
  boundary: Omit<LakeBoundaryV1, "queryCoverage">,
  modifier: LakeTerrainModifier
): LakeTerrainPatch {
  if (!isWaterTerrainSnapshot(base)) throw new Error("Invalid Lake base terrain.");
  validateLakeTerrainModifier(modifier);
  const rings = sampleLakeBoundary(decodeLakeBoundary({ ...boundary, queryCoverage: "boundary" })).rings;
  const points = rings.flat();
  const minX = Math.min(...points.map((p) => p[0])) - modifier.falloffWidth;
  const minZ = Math.min(...points.map((p) => p[1])) - modifier.falloffWidth;
  const maxX = Math.max(...points.map((p) => p[0])) + modifier.falloffWidth;
  const maxZ = Math.max(...points.map((p) => p[1])) + modifier.falloffWidth;
  const bounds = [
    base.origin[0] + Math.floor((minX - base.origin[0]) / base.spacing) * base.spacing,
    base.origin[1] +
      Math.floor((minZ - base.origin[1]) / (base.spacingZ ?? base.spacing)) * (base.spacingZ ?? base.spacing),
    base.origin[0] + Math.ceil((maxX - base.origin[0]) / base.spacing) * base.spacing,
    base.origin[1] +
      Math.ceil((maxZ - base.origin[1]) / (base.spacingZ ?? base.spacing)) * (base.spacingZ ?? base.spacing)
  ] as const;
  if (
    bounds[0] < base.origin[0] ||
    bounds[1] < base.origin[1] ||
    bounds[2] > base.origin[0] + (base.columns - 1) * base.spacing ||
    bounds[3] > base.origin[1] + (base.rows - 1) * (base.spacingZ ?? base.spacing)
  )
    throw new Error("Lake basin and falloff leave the base terrain.");
  const grids = [base, ...(base.refinements ?? [])];
  // Check aggregate work before evaluating either the background or any replacement grid.
  const samples = grids.reduce((total, grid) => {
    const [x0, x1, z0, z1] = waterTerrainVertexRange(grid, bounds);
    return total + Math.max(0, x1 - x0 + 1) * Math.max(0, z1 - z0 + 1);
  }, 0);
  if (samples * points.length > 64_000_000)
    throw new RangeError("Lake terrain modifier exceeds shoreline evaluation budget.");
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const cutGrid = (grid: WaterTerrainSnapshot) => {
    const indices: number[] = [],
      heights: number[] = [];
    const [col0, col1, row0, row1] = waterTerrainVertexRange(grid, bounds);
    for (let row = row0; row <= row1; row++)
      for (let col = col0; col <= col1; col++) {
        const index = row * grid.columns + col;
        const d = sampleLakeSignedShoreDistance(
          rings,
          grid.origin[0] + col * grid.spacing,
          grid.origin[1] + row * (grid.spacingZ ?? grid.spacing)
        );
        if (d <= -modifier.falloffWidth) continue;
        const t = Math.min(1, Math.max(0, d / modifier.shoreWidth));
        const depthWeight =
          modifier.profile === "linear" ? t : modifier.profile === "smoothstep" ? smooth(t) : t + t * t - t * t * t;
        const target = modifier.referenceLevel - modifier.depth * depthWeight;
        const weight = d >= 0 ? 1 : 1 - smooth(-d / modifier.falloffWidth);
        const height = grid.heights[index] + (Math.min(grid.heights[index], target) - grid.heights[index]) * weight;
        if (height < grid.heights[index]) {
          indices.push(index);
          heights.push(height);
        }
      }
    return Object.freeze({ id: grid.id, indices: Object.freeze(indices), heights: Object.freeze(heights) });
  };
  const [background, ...refinements] = grids.map(cutGrid);
  return Object.freeze({
    id: modifier.id,
    lakeId: modifier.lakeId,
    baseHash: hashStableValue(base),
    bounds: Object.freeze(bounds),
    indices: background.indices,
    heights: background.heights,
    ...(base.refinements ? { refinements: Object.freeze(refinements) } : {})
  });
}

/** Explicit height-grid adapter: the owner publishes the result together with its water replacement. */
export function applyLakeTerrainPatches(
  base: WaterTerrainSnapshot,
  patches: readonly LakeTerrainPatch[],
  revision: number
): WaterTerrainSnapshot {
  if (!isWaterTerrainSnapshot(base) || !Number.isSafeInteger(revision) || revision < 0)
    throw new Error("Invalid Lake base terrain or revision.");
  if (!patches.length) return base;
  const baseHash = hashStableValue(base),
    ids = new Set<string>();
  const grids = [base, ...(base.refinements ?? [])];
  // Copy on the first effective cut, not for every grid mentioned by the patch contract.
  const values: (number[] | undefined)[] = new Array(grids.length);
  for (const patch of patches) {
    if (
      !patch ||
      typeof patch.id !== "string" ||
      !patch.id.trim() ||
      typeof patch.lakeId !== "string" ||
      !patch.lakeId.trim() ||
      !Array.isArray(patch.bounds) ||
      patch.bounds.length !== 4 ||
      !patch.bounds.every(Number.isFinite) ||
      patch.bounds[0] > patch.bounds[2] ||
      patch.bounds[1] > patch.bounds[3] ||
      !Array.isArray(patch.indices) ||
      !Array.isArray(patch.heights)
    )
      throw new Error("Invalid Lake terrain patch metadata.");
    if (patch.baseHash !== baseHash) throw new Error("Lake terrain patch belongs to a different base snapshot.");
    if (ids.has(patch.id)) throw new Error("Duplicate Lake terrain patch id.");
    ids.add(patch.id);
    if ((patch.refinements?.length ?? 0) !== (base.refinements?.length ?? 0))
      throw new Error("Lake terrain patch must cover every base refinement.");
    const cuts = [patch, ...(patch.refinements ?? [])];
    for (let g = 0; g < grids.length; g++) {
      const grid = grids[g],
        cut = cuts[g];
      if (g > 0 && cut.id !== grid.id)
        throw new Error("Lake terrain patch refinement identity does not match its base.");
      if (!Array.isArray(cut.indices) || !Array.isArray(cut.heights) || cut.indices.length !== cut.heights.length)
        throw new Error("Invalid Lake terrain patch length.");
      let previous = -1;
      for (let i = 0; i < cut.indices.length; i++) {
        const index = cut.indices[i],
          value = cut.heights[i];
        if (
          !Number.isInteger(index) ||
          index <= previous ||
          index >= grid.heights.length ||
          !Number.isFinite(value) ||
          value > grid.heights[index]
        )
          throw new Error("Invalid Lake terrain patch cut.");
        previous = index;
        const x = grid.origin[0] + (index % grid.columns) * grid.spacing;
        const z = grid.origin[1] + Math.floor(index / grid.columns) * (grid.spacingZ ?? grid.spacing);
        if (x < patch.bounds[0] || z < patch.bounds[1] || x > patch.bounds[2] || z > patch.bounds[3])
          throw new Error("Lake terrain patch cut leaves its declared bounds.");
        if (value < (values[g] ?? grid.heights)[index]) {
          const heights = values[g] ?? (values[g] = grid.heights.slice());
          heights[index] = value;
        }
      }
    }
  }
  return copyWaterTerrainSnapshot({
    ...base,
    id: `${base.id}:lake-derived`,
    revision,
    heights: values[0] ? Object.freeze(values[0]) : base.heights,
    ...(base.refinements
      ? {
          refinements: base.refinements.map((grid, index) => {
            const heights = values[index + 1];
            return heights ? { ...grid, heights: Object.freeze(heights) } : grid;
          })
        }
      : {})
  });
}
