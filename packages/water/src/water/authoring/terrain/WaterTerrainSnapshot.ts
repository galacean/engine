import { waterTerrainContentHash } from "./WaterTerrainIdentity";
import {
  interpolateGridTriangle,
  sampleFloat32GridTriangle
} from "@galacean/engine-terrain/geometry/GridInterpolation";

/** Read-only external bed data, in body-local metres (Y up). Water never edits its owner. */
export interface WaterTerrainSnapshot {
  readonly id: string;
  readonly revision: number;
  readonly origin: readonly [x: number, z: number];
  /** X spacing; also Z spacing when spacingZ is omitted (legacy square grids). */
  readonly spacing: number;
  readonly spacingZ?: number;
  readonly columns: number;
  readonly rows: number;
  /** Owned row-major heights; rows advance along +Z. Background cells are bilinear. */
  readonly heights: readonly number[];
  /** Non-overlapping Terrain replacement grids; sampled as fixed a--d diagonal triangles. */
  readonly refinements?: readonly WaterTerrainSnapshot[];
  /** Exact fixed GPU triangles; omitted retains the legacy bilinear background. */
  readonly surface?: "float32-triangles";
}

export type WaterTerrainGridDefinition = Omit<WaterTerrainSnapshot, "heights" | "refinements">;

// Only snapshots built and validated here can skip subsequent full-grid validation.
const validatedImmutableTerrains = new WeakSet<object>();

/** Capture a Terrain, mesh or analytic sampler before submitting Water compilation. */
export function captureWaterTerrainSnapshot(
  grid: WaterTerrainGridDefinition,
  sampleHeight: (x: number, z: number) => number | undefined
): WaterTerrainSnapshot {
  if (!isWaterTerrainGridDefinition(grid)) throw new Error("Invalid Water terrain grid or revision.");
  const heights: number[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const x = grid.origin[0] + column * grid.spacing;
      const z = grid.origin[1] + row * (grid.spacingZ ?? grid.spacing);
      const height = sampleHeight(x, z);
      if (height === undefined || !Number.isFinite(height)) {
        throw new Error(`Water terrain '${grid.id}' has no finite bed height at (${x}, ${z}).`);
      }
      heights.push(height);
    }
  }
  const snapshot = Object.freeze({
    ...grid,
    origin: Object.freeze([...grid.origin]) as readonly [number, number],
    heights: Object.freeze(heights)
  });
  // GridDefinition excludes refinements; do not trust extra fields on external JS inputs.
  if (!("refinements" in snapshot)) validatedImmutableTerrains.add(snapshot);
  return snapshot;
}

function isWaterTerrainGridDefinition(value: unknown): value is WaterTerrainGridDefinition {
  if (!value || typeof value !== "object") return false;
  const grid = value as WaterTerrainGridDefinition;
  return (
    typeof grid.id === "string" &&
    grid.id.trim().length > 0 &&
    Number.isSafeInteger(grid.revision) &&
    grid.revision >= 0 &&
    (grid.surface === undefined || grid.surface === "float32-triangles") &&
    Array.isArray(grid.origin) &&
    grid.origin.length === 2 &&
    Number.isFinite(grid.origin[0]) &&
    Number.isFinite(grid.origin[1]) &&
    Number.isFinite(grid.spacing) &&
    grid.spacing > 0 &&
    (grid.spacingZ === undefined || (Number.isFinite(grid.spacingZ) && grid.spacingZ > 0)) &&
    Number.isInteger(grid.columns) &&
    grid.columns >= 2 &&
    Number.isInteger(grid.rows) &&
    grid.rows >= 2 &&
    grid.columns * grid.rows <= 1_048_576 &&
    Number.isFinite(grid.origin[0] + (grid.columns - 1) * grid.spacing) &&
    Number.isFinite(grid.origin[1] + (grid.rows - 1) * (grid.spacingZ ?? grid.spacing))
  );
}

/** Validate the snapshot's grid and geometry contract, including the existing per-grid size limit.
 * Aggregate refinement allocation belongs to the producer; its budget is not a snapshot validity rule.
 * Water operations that allocate derived grids enforce their own output budgets before allocation.
 */
export function isWaterTerrainSnapshot(value: unknown): value is WaterTerrainSnapshot {
  if (typeof value === "object" && value !== null && validatedImmutableTerrains.has(value)) return true;
  if (!isWaterTerrainGridDefinition(value)) return false;
  const heights = (value as WaterTerrainSnapshot).heights;
  if (!Array.isArray(heights) || heights.length !== value.columns * value.rows) return false;
  for (const height of heights) {
    if (!Number.isFinite(height)) return false;
  }
  const refinements = (value as WaterTerrainSnapshot).refinements;
  if (refinements !== undefined) {
    if (!Array.isArray(refinements)) return false;
    const ids = new Set<string>();
    for (let i = 0; i < refinements.length; i++) {
      const patch = refinements[i];
      if (!patch || patch.refinements !== undefined || !isWaterTerrainSnapshot(patch) || ids.has(patch.id))
        return false;
      ids.add(patch.id);
      const bounds = terrainBounds(patch),
        base = terrainBounds(value as WaterTerrainSnapshot);
      if (
        patch.spacing > value.spacing ||
        (patch.spacingZ ?? patch.spacing) > (value.spacingZ ?? value.spacing) ||
        bounds[0] < base[0] - 1e-8 ||
        bounds[1] < base[1] - 1e-8 ||
        bounds[2] > base[2] + 1e-8 ||
        bounds[3] > base[3] + 1e-8
      )
        return false;
    }
    const size = refinements.reduce(
      (size, p) => Math.max(size, (p.columns - 1) * p.spacing, (p.rows - 1) * (p.spacingZ ?? p.spacing)),
      0
    );
    const buckets = new Map<string, WaterTerrainSnapshot[]>();
    for (const patch of refinements) {
      const bounds = terrainBounds(patch),
        seen = new Set<WaterTerrainSnapshot>();
      for (let z = Math.floor(bounds[1] / size); z <= Math.floor(bounds[3] / size); z++)
        for (let x = Math.floor(bounds[0] / size); x <= Math.floor(bounds[2] / size); x++) {
          const key = `${x}:${z}`,
            bucket = buckets.get(key) ?? [];
          for (const prior of bucket) {
            if (seen.has(prior)) continue;
            seen.add(prior);
            const other = terrainBounds(prior);
            if (
              bounds[0] < other[2] - 1e-8 &&
              bounds[2] > other[0] + 1e-8 &&
              bounds[1] < other[3] - 1e-8 &&
              bounds[3] > other[1] + 1e-8
            )
              return false;
          }
          bucket.push(patch);
          buckets.set(key, bucket);
        }
    }
  }
  return true;
}

function terrainBounds(grid: WaterTerrainSnapshot): readonly [number, number, number, number] {
  return [
    grid.origin[0],
    grid.origin[1],
    grid.origin[0] + (grid.columns - 1) * grid.spacing,
    grid.origin[1] + (grid.rows - 1) * (grid.spacingZ ?? grid.spacing)
  ];
}

/** Own immutable copies across Worker/API boundaries; nested refinement trees are deliberately unsupported. */
export function copyWaterTerrainSnapshot(terrain: WaterTerrainSnapshot): WaterTerrainSnapshot {
  if (!isWaterTerrainSnapshot(terrain)) throw new Error("Invalid Water terrain snapshot or refinements.");
  const immutable = (grid: WaterTerrainSnapshot): boolean =>
    Object.isFrozen(grid) &&
    Object.isFrozen(grid.origin) &&
    Object.isFrozen(grid.heights) &&
    (!grid.refinements || (Object.isFrozen(grid.refinements) && grid.refinements.every(immutable)));
  if (immutable(terrain)) return terrain;
  // Structured clone preserves aliases but not frozen state. Own each borrowed array once.
  const arrays = new Map<readonly number[], readonly number[]>();
  const ownArray = (source: readonly number[]): readonly number[] => {
    if (Object.isFrozen(source)) return source;
    let owned = arrays.get(source);
    if (!owned) {
      owned = Object.freeze([...source]);
      arrays.set(source, owned);
    }
    return owned;
  };
  const copy = (grid: WaterTerrainSnapshot): WaterTerrainSnapshot =>
    immutable(grid)
      ? grid
      : Object.freeze({
          ...grid,
          origin: ownArray(grid.origin) as readonly [number, number],
          heights: ownArray(grid.heights),
          ...(grid.refinements ? { refinements: Object.freeze(grid.refinements.map(copy)) } : {})
        });
  return copy(terrain);
}

interface RefinementIndex {
  size: number;
  /** Numeric bucket coordinates avoid constructing a string on every runtime sample. */
  buckets: Map<number, Map<number, readonly WaterTerrainSnapshot[]>>;
}
const refinementIndices = new WeakMap<readonly WaterTerrainSnapshot[], RefinementIndex | null>();
const EMPTY_REFINEMENTS: readonly WaterTerrainSnapshot[] = Object.freeze([]);
function prepareRefinementIndex(grids: readonly WaterTerrainSnapshot[]): RefinementIndex | null {
  if (grids.length < 8 || !Object.isFrozen(grids)) return null;
  let index = refinementIndices.get(grids);
  if (index === null) return null;
  if (!index) {
    // A frozen array alone does not freeze its coordinate records. Never index mutable inputs.
    if (!grids.every((g) => Object.isFrozen(g) && Object.isFrozen(g.origin))) {
      refinementIndices.set(grids, null);
      return null;
    }
    const size = grids.reduce(
      (size, g) => Math.max(size, (g.columns - 1) * g.spacing, (g.rows - 1) * (g.spacingZ ?? g.spacing)),
      0
    );
    const buckets = new Map<number, Map<number, WaterTerrainSnapshot[]>>();
    for (const grid of grids) {
      const [x0, z0, x1, z1] = terrainBounds(grid);
      // Match the same boundary tolerance as grid ownership, including bucket edges.
      const epsilonX = grid.spacing * WATER_TERRAIN_OWNER_EPSILON,
        epsilonZ = (grid.spacingZ ?? grid.spacing) * WATER_TERRAIN_OWNER_EPSILON;
      for (let iz = Math.floor((z0 - epsilonZ) / size); iz <= Math.floor((z1 + epsilonZ) / size); iz++)
        for (let ix = Math.floor((x0 - epsilonX) / size); ix <= Math.floor((x1 + epsilonX) / size); ix++) {
          let column = buckets.get(ix);
          if (!column) buckets.set(ix, (column = new Map()));
          let bucket = column.get(iz);
          if (!bucket) column.set(iz, (bucket = []));
          bucket.push(grid);
        }
    }
    index = { size, buckets };
    refinementIndices.set(grids, index);
  }
  return index;
}

/** Prepare immutable geometry indices before entering runtime sampling. Mutable inputs stay uncached. */
export function prepareWaterTerrainSampling(terrain: WaterTerrainSnapshot): void {
  if (terrain.refinements) prepareRefinementIndex(terrain.refinements);
}

function nearbyRefinements(
  grids: readonly WaterTerrainSnapshot[],
  x: number,
  z: number
): readonly WaterTerrainSnapshot[] {
  const index = prepareRefinementIndex(grids);
  return index
    ? (index.buckets.get(Math.floor(x / index.size))?.get(Math.floor(z / index.size)) ?? EMPTY_REFINEMENTS)
    : grids;
}

export const WATER_TERRAIN_OWNER_EPSILON = 1e-8;

/** Resolve the actual owner of a sample; replacement-grid order also defines shared-edge ownership. */
export function resolveWaterTerrainGrid(terrain: WaterTerrainSnapshot, x: number, z: number): WaterTerrainSnapshot {
  const candidates = terrain.refinements ? nearbyRefinements(terrain.refinements, x, z) : EMPTY_REFINEMENTS;
  for (let i = 0; i < candidates.length; i++) {
    const patch = candidates[i],
      minX = patch.origin[0],
      minZ = patch.origin[1],
      maxX = minX + (patch.columns - 1) * patch.spacing,
      maxZ = minZ + (patch.rows - 1) * (patch.spacingZ ?? patch.spacing);
    if (
      x >= minX - patch.spacing * WATER_TERRAIN_OWNER_EPSILON &&
      x <= maxX + patch.spacing * WATER_TERRAIN_OWNER_EPSILON &&
      z >= minZ - (patch.spacingZ ?? patch.spacing) * WATER_TERRAIN_OWNER_EPSILON &&
      z <= maxZ + (patch.spacingZ ?? patch.spacing) * WATER_TERRAIN_OWNER_EPSILON
    )
      return patch;
  }
  return terrain;
}

/** Background is bilinear; Terrain replacement patches use their exact fixed triangles. */
export function sampleWaterTerrainHeight(terrain: WaterTerrainSnapshot, x: number, z: number): number | undefined {
  if (
    !isWaterTerrainGridDefinition(terrain) ||
    !Array.isArray(terrain.heights) ||
    terrain.heights.length !== terrain.columns * terrain.rows
  )
    return undefined;
  const grid = resolveWaterTerrainGrid(terrain, x, z),
    replacement = grid !== terrain;
  const u = replacement
      ? Math.max(0, Math.min(grid.columns - 1, (x - grid.origin[0]) / grid.spacing))
      : terrainGridCoordinate(x, grid.origin[0], grid.spacing, grid.columns - 1),
    v = replacement
      ? Math.max(0, Math.min(grid.rows - 1, (z - grid.origin[1]) / (grid.spacingZ ?? grid.spacing)))
      : terrainGridCoordinate(z, grid.origin[1], grid.spacingZ ?? grid.spacing, grid.rows - 1);
  if (grid.surface === "float32-triangles") {
    if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > grid.columns - 1 || v < 0 || v > grid.rows - 1)
      return undefined;
    return sampleFloat32GridTriangle(
      { ...grid, spacingZ: grid.spacingZ ?? grid.spacing },
      x,
      z,
      (ix, iz) => grid.heights[iz * grid.columns + ix]
    );
  }
  return sampleBilinearGridHeight(grid.heights, grid.columns, grid.rows, u, v, replacement);
}

/** Absorb only subtraction/division roundoff at the closed domain edges, never a geometric fringe. */
function terrainGridCoordinate(value: number, origin: number, spacing: number, last: number): number {
  const coordinate = (value - origin) / spacing;
  if (coordinate >= 0 && coordinate <= last) return coordinate;
  const tolerance = (4 * Number.EPSILON * Math.max(Math.abs(value), Math.abs(origin), last * spacing)) / spacing;
  return Number.isFinite(coordinate) && coordinate >= -tolerance && coordinate <= last + tolerance
    ? Math.max(0, Math.min(last, coordinate))
    : coordinate;
}

/** Inclusive vertex-grid coordinates; validates only the four samples read, without scanning the grid per query. */
export function sampleBilinearGridHeight(
  heights: ArrayLike<number>,
  columns: number,
  rows: number,
  u: number,
  v: number,
  fixedTriangles = false
): number | undefined {
  if (
    !Number.isInteger(columns) ||
    columns < 2 ||
    !Number.isInteger(rows) ||
    rows < 2 ||
    heights.length !== columns * rows ||
    !Number.isFinite(u) ||
    !Number.isFinite(v) ||
    u < 0 ||
    v < 0 ||
    u > columns - 1 ||
    v > rows - 1
  )
    return undefined;
  const column = Math.min(Math.floor(u), columns - 2),
    row = Math.min(Math.floor(v), rows - 2);
  const tx = u - column,
    tz = v - row,
    index = row * columns + column;
  const a = heights[index],
    b = heights[index + 1],
    c = heights[index + columns],
    d = heights[index + columns + 1];
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) return undefined;
  if (fixedTriangles) return interpolateGridTriangle(a, b, c, d, tx, tz);
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/** Read-only domain view retaining original lattice vertices and triangle interpolation. */
export function cropWaterTerrainSnapshot(
  terrain: WaterTerrainSnapshot,
  bounds: readonly [number, number, number, number]
): WaterTerrainSnapshot {
  if (
    !isWaterTerrainSnapshot(terrain) ||
    !bounds.every(Number.isFinite) ||
    bounds[2] <= bounds[0] ||
    bounds[3] <= bounds[1]
  )
    throw new Error("Invalid Water terrain crop.");
  const spacingZ = terrain.spacingZ ?? terrain.spacing;
  // A nominal crop edge may lie just beyond its rounded GPU vertex. Preserve one
  // source cell around the requested domain so that sampling keeps the same triangle.
  const extent = terrainBounds(terrain);
  if (bounds[0] >= extent[2] || bounds[1] >= extent[3] || bounds[2] <= extent[0] || bounds[3] <= extent[1])
    throw new Error("Water terrain crop is outside the source.");
  const support =
    terrain.surface === "float32-triangles"
      ? ([
          Math.max(extent[0], bounds[0] - terrain.spacing),
          Math.max(extent[1], bounds[1] - spacingZ),
          Math.min(extent[2], bounds[2] + terrain.spacing),
          Math.min(extent[3], bounds[3] + spacingZ)
        ] as const)
      : bounds;
  const patches =
    terrain.refinements
      ?.filter((p) => {
        const b = terrainBounds(p);
        return b[0] < support[2] && b[2] > support[0] && b[1] < support[3] && b[3] > support[1];
      })
      .map((patch) => {
        const b = terrainBounds(patch);
        return cropWaterTerrainSnapshot(patch, [
          Math.max(support[0], b[0]),
          Math.max(support[1], b[1]),
          Math.min(support[2], b[2]),
          Math.min(support[3], b[3])
        ]);
      }) ?? [];
  let [x0, z0, x1, z1] = support;
  for (const patch of patches) {
    const b = terrainBounds(patch);
    x0 = Math.min(x0, b[0]);
    z0 = Math.min(z0, b[1]);
    x1 = Math.max(x1, b[2]);
    z1 = Math.max(z1, b[3]);
  }
  const ix0 = Math.max(0, Math.floor((x0 - terrain.origin[0]) / terrain.spacing + 1e-8));
  const iz0 = Math.max(0, Math.floor((z0 - terrain.origin[1]) / spacingZ + 1e-8));
  const ix1 = Math.min(terrain.columns - 1, Math.ceil((x1 - terrain.origin[0]) / terrain.spacing - 1e-8));
  const iz1 = Math.min(terrain.rows - 1, Math.ceil((z1 - terrain.origin[1]) / spacingZ - 1e-8));
  if (ix1 <= ix0 || iz1 <= iz0) throw new Error("Water terrain crop is outside the source.");
  const grid = captureWaterTerrainSnapshot(
    {
      id: `${terrain.id}:crop:${ix0}:${iz0}:${ix1}:${iz1}`,
      revision: terrain.revision,
      origin: [terrain.origin[0] + ix0 * terrain.spacing, terrain.origin[1] + iz0 * spacingZ],
      spacing: terrain.spacing,
      spacingZ,
      columns: ix1 - ix0 + 1,
      rows: iz1 - iz0 + 1,
      ...(terrain.surface ? { surface: terrain.surface } : {})
    },
    (x, z) =>
      terrain.heights[
        Math.round((z - terrain.origin[1]) / spacingZ) * terrain.columns +
          Math.round((x - terrain.origin[0]) / terrain.spacing)
      ]
  );
  const cropped = patches.length ? { ...grid, refinements: Object.freeze(patches) } : grid;
  // The owner may change outside this crop. Only this exact bed and its support affect Water.
  return Object.freeze({ ...cropped, id: `water-terrain:${waterTerrainContentHash(cropped)}`, revision: 0 });
}
