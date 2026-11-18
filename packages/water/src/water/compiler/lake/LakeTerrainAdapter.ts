import {
  isWaterTerrainSnapshot,
  copyWaterTerrainSnapshot,
  cropWaterTerrainSnapshot,
  sampleWaterTerrainHeight,
  type WaterTerrainSnapshot
} from "../../authoring/terrain/WaterTerrainSnapshot";
import type { LakeTerrainView } from "./LakeTerrainBoundary";

export type LakeTerrainBounds = readonly [minX: number, minZ: number, maxX: number, maxZ: number];

function overlapsBounds(patch: WaterTerrainSnapshot, extent: LakeTerrainBounds): boolean {
  return (
    patch.origin[0] < extent[2] &&
    patch.origin[1] < extent[3] &&
    patch.origin[0] + (patch.columns - 1) * patch.spacing > extent[0] &&
    patch.origin[1] + (patch.rows - 1) * (patch.spacingZ ?? patch.spacing) > extent[1]
  );
}

/** Bounded raster support plus the immutable canonical bed; raster vertices alone do not encode refinement triangles. */
export function captureLakeTerrain(terrain: WaterTerrainSnapshot, bounds?: LakeTerrainBounds): LakeTerrainView {
  const { grid, vertexSource } = resolveGrid(terrain, bounds);
  const extent: LakeTerrainBounds = [
    grid.originXZ[0],
    grid.originXZ[1],
    grid.originXZ[0] + (grid.width - 1) * grid.cellSizeXZ[0],
    grid.originXZ[1] + (grid.height - 1) * grid.cellSizeXZ[1]
  ];
  const needsCanonicalBed =
    terrain.surface === "float32-triangles" || terrain.refinements?.some((patch) => overlapsBounds(patch, extent));
  const bedTerrain = needsCanonicalBed
    ? bounds
      ? cropWaterTerrainSnapshot(terrain, bounds)
      : copyWaterTerrainSnapshot(terrain)
    : undefined;
  const heights = new Float32Array(grid.width * grid.height);
  // Cropping shifts the background's lattice origin. Sampling the original and
  // cropped origins can round to opposite Float32 values at a midpoint. The
  // raster must be derived from the exact canonical snapshot it publishes.
  if ((bounds && bedTerrain) || !vertexSource || vertexSource.surface === "float32-triangles") {
    const source = bedTerrain ?? terrain;
    for (let z = 0; z < grid.height; z++)
      for (let x = 0; x < grid.width; x++) {
        const value = sampleWaterTerrainHeight(
          source,
          grid.originXZ[0] + x * grid.cellSizeXZ[0],
          grid.originXZ[1] + z * grid.cellSizeXZ[1]
        );
        if (value === undefined) throw new Error("Lake terrain bounds leave the canonical source.");
        heights[z * grid.width + x] = value;
      }
  } else {
    // Ordinary lattices already own the exact vertex values; retain the direct-copy path.
    const x0 = Math.round((grid.originXZ[0] - vertexSource.origin[0]) / vertexSource.spacing);
    const z0 = Math.round(
      (grid.originXZ[1] - vertexSource.origin[1]) / (vertexSource.spacingZ ?? vertexSource.spacing)
    );
    for (let z = 0; z < grid.height; z++)
      for (let x = 0; x < grid.width; x++)
        heights[z * grid.width + x] = vertexSource.heights[(z + z0) * vertexSource.columns + x + x0];
  }
  return Object.freeze({ grid, heights, ...(bedTerrain ? { bedTerrain } : {}) });
}

/** Resolve support without sampling; vertexSource exists when one source lattice supplies every vertex. */
function resolveGrid(
  terrain: WaterTerrainSnapshot,
  bounds?: LakeTerrainBounds
): {
  grid: LakeTerrainView["grid"];
  vertexSource?: WaterTerrainSnapshot;
} {
  if (!isWaterTerrainSnapshot(terrain)) throw new Error("Invalid external Lake terrain snapshot.");
  const extent = bounds ?? [
    terrain.origin[0],
    terrain.origin[1],
    terrain.origin[0] + (terrain.columns - 1) * terrain.spacing,
    terrain.origin[1] + (terrain.rows - 1) * (terrain.spacingZ ?? terrain.spacing)
  ];
  if (!Array.isArray(extent) || extent.length !== 4 || !extent.every(Number.isFinite))
    throw new Error("Lake terrain bounds require four finite coordinates.");
  if (terrain.refinements?.length) {
    const overlaps = terrain.refinements.filter((patch) => overlapsBounds(patch, extent as LakeTerrainBounds));
    if (overlaps.length) {
      const patch = overlaps[0];
      if (
        overlaps.length === 1 &&
        patch.origin[0] <= extent[0] &&
        patch.origin[1] <= extent[1] &&
        patch.origin[0] + (patch.columns - 1) * patch.spacing >= extent[2] &&
        patch.origin[1] + (patch.rows - 1) * (patch.spacingZ ?? patch.spacing) >= extent[3]
      )
        return resolveGrid(patch, extent as LakeTerrainBounds);
      // This bounded lattice supplies render-field samples. Exact cell topology is retained separately
      // in bedTerrain, including refinement diagonals that do not coincide with lattice diagonals.
      let dx = terrain.spacing,
        dz = terrain.spacingZ ?? terrain.spacing;
      for (const grid of overlaps) {
        dx = Math.min(dx, grid.spacing);
        dz = Math.min(dz, grid.spacingZ ?? grid.spacing);
      }
      const aligned = (value: number) => Math.abs(value - Math.round(value)) < 1e-7;
      for (const grid of [terrain, ...overlaps]) {
        if (
          !aligned(grid.spacing / dx) ||
          !aligned((grid.spacingZ ?? grid.spacing) / dz) ||
          !aligned((grid.origin[0] - extent[0]) / dx) ||
          !aligned((grid.origin[1] - extent[1]) / dz)
        )
          throw new Error("Lake requires aligned canonical grids; incompatible refinement lattice.");
      }
      const columns = (extent[2] - extent[0]) / dx + 1,
        rows = (extent[3] - extent[1]) / dz + 1;
      if (!aligned(columns) || !aligned(rows) || columns < 2 || rows < 2 || columns * rows > 1_048_576)
        throw new Error("Lake refinement capture exceeds the canonical grid budget or has invalid bounds.");
      const width = Math.round(columns),
        height = Math.round(rows);
      return {
        grid: Object.freeze({
          originXZ: [extent[0], extent[1]] as const,
          cellSizeXZ: [dx, dz] as const,
          width,
          height
        })
      };
    }
  }
  const cells = extent.map(
    (v, i) => (v - terrain.origin[i % 2]) / (i % 2 ? (terrain.spacingZ ?? terrain.spacing) : terrain.spacing)
  );
  if (!cells.every((v) => Number.isFinite(v) && Math.abs(v - Math.round(v)) < 1e-7))
    throw new Error("Lake terrain bounds must align with the source grid.");
  const [x0, z0, x1, z1] = cells.map(Math.round);
  if (x0 < 0 || z0 < 0 || x1 >= terrain.columns || z1 >= terrain.rows || x1 <= x0 || z1 <= z0)
    throw new Error("Lake terrain bounds leave the source or contain no cells.");
  const width = x1 - x0 + 1,
    height = z1 - z0 + 1;
  const grid = Object.freeze({
    originXZ: Object.freeze([
      terrain.origin[0] + x0 * terrain.spacing,
      terrain.origin[1] + z0 * (terrain.spacingZ ?? terrain.spacing)
    ] as const),
    cellSizeXZ: Object.freeze([terrain.spacing, terrain.spacingZ ?? terrain.spacing] as const),
    width,
    height
  });
  return { grid, vertexSource: terrain };
}
