import { ConstructionGroundSupports, type ConstructionGroundMesh } from "./ConstructionGroundSupports";
/** Immutable, inclusive R16 height field. Values and decode metadata belong to
 * the host terrain producer, never to the masonry author document. */
export interface ConstructionTerrainGrid {
  samples: Uint16Array;
  /** Immutable world-space rock surfaces from the same published scene. */
  supports?: readonly ConstructionGroundMesh[];
  resolution: number;
  origin: [number, number];
  size: number;
  decode: { offset: number; scale: number };
}
export interface ConstructionTerrainSource {
  revision: string | number;
  grid: ConstructionTerrainGrid;
}
export interface ConstructionGrounding {
  originY: number;
  minWorldHeight?: number;
  maxWorldHeight?: number;
  supports?: { id: string; minGround: number; maxGround: number; topY: number; layoutOriginY: number }[];
  sourceRevision?: string | number;
  renderPosition: [number, number, number];
  contacts?: { sampleError: number; aboveTerrain: number; belowTerrain: number; checks: number };
  localBounds?: { min: [number, number, number]; max: [number, number, number] };
}
export function validateConstructionTerrain(grid: ConstructionTerrainGrid): void {
  if (
    !(grid.samples instanceof Uint16Array) ||
    !Number.isSafeInteger(grid.resolution) ||
    grid.resolution < 2 ||
    grid.samples.length !== grid.resolution * grid.resolution ||
    !(grid.size > 0) ||
    ![grid.size, ...grid.origin, grid.decode.offset, grid.decode.scale].every(Number.isFinite) ||
    grid.origin.length !== 2 ||
    !(grid.decode.scale > 0)
  )
    throw Error("Invalid host R16 terrain field");
}
/** Interpolate encoded samples before decoding, matching the host field contract.
 * Outside-domain queries fail rather than silently extending a coastline. */
export function constructionTerrainHeight(grid: ConstructionTerrainGrid, worldX: number, worldZ: number): number {
  const u = (worldX - grid.origin[0]) / grid.size,
    v = (worldZ - grid.origin[1]) / grid.size,
    epsilon = Number.EPSILON * 8;
  if (![u, v].every(Number.isFinite) || u < -epsilon || u > 1 + epsilon || v < -epsilon || v > 1 + epsilon)
    throw Error("Building footprint is outside the published terrain");
  const n = grid.resolution,
    x = Math.min(1, Math.max(0, u)) * (n - 1),
    z = Math.min(1, Math.max(0, v)) * (n - 1),
    x0 = Math.floor(x),
    z0 = Math.floor(z),
    x1 = Math.min(n - 1, x0 + 1),
    z1 = Math.min(n - 1, z0 + 1),
    tx = x - x0,
    tz = z - z0,
    mix = (a: number, b: number, t: number) => a + (b - a) * t,
    value = mix(
      mix(grid.samples[z0 * n + x0], grid.samples[z0 * n + x1], tx),
      mix(grid.samples[z1 * n + x0], grid.samples[z1 * n + x1], tx),
      tz
    );
  return grid.decode.offset + (value / 65535) * grid.decode.scale;
}
const supportQueries = new WeakMap<ConstructionGroundMesh, ConstructionGroundSupports>();
export function supportQuery(mesh: ConstructionGroundMesh) {
  let query = supportQueries.get(mesh);
  if (!query) {
    query = new ConstructionGroundSupports([mesh]);
    supportQueries.set(mesh, query);
  }
  return query;
}
export function constructionSupportHeight(grid: ConstructionTerrainGrid, x: number, z: number): number {
  let height = constructionTerrainHeight(grid, x, z);
  for (const mesh of grid.supports ?? []) height = supportQuery(mesh).sample(x, z, height);
  return height;
}

const boundsCache = new WeakMap<ConstructionGroundMesh, number[]>();
function bounds(mesh: ConstructionGroundMesh): number[] {
  let b = boundsCache.get(mesh);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      b[0] = Math.min(b[0], mesh.positions[i]);
      b[1] = Math.min(b[1], mesh.positions[i + 2]);
      b[2] = Math.max(b[2], mesh.positions[i]);
      b[3] = Math.max(b[3], mesh.positions[i + 2]);
    }
    boundsCache.set(mesh, b);
  }
  return b;
}

/** Conservative XZ selection over immutable published meshes; cached extents never detach buffers. */
export function groundSupportsInRegion(grid: ConstructionTerrainGrid, region: readonly number[]) {
  return (
    grid.supports?.filter((mesh) => {
      const b = bounds(mesh);
      return b[2] >= region[0] && b[0] <= region[2] && b[3] >= region[1] && b[1] <= region[3];
    }) ?? []
  );
}

/** Exact invalidation of one published support domain, including bilinear neighbours. */
export function terrainAffectsRegion(
  region: readonly number[],
  before: ConstructionTerrainGrid,
  after: ConstructionTerrainGrid
): boolean {
  if (
    before.resolution !== after.resolution ||
    before.size !== after.size ||
    before.origin.some((v, i) => v !== after.origin[i]) ||
    before.decode.offset !== after.decode.offset ||
    before.decode.scale !== after.decode.scale ||
    before.supports !== after.supports
  )
    return true;
  const n = before.resolution,
    scale = (n - 1) / before.size;
  const start = (v: number, axis: number) =>
    Math.max(0, Math.min(n - 1, Math.floor((v - before.origin[axis]) * scale)));
  const end = (v: number, axis: number) =>
    Math.max(0, Math.min(n - 1, Math.floor((v - before.origin[axis]) * scale) + 1));
  const x0 = start(region[0], 0),
    x1 = end(region[2], 0),
    z0 = start(region[1], 1),
    z1 = end(region[3], 1);
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const i = z * n + x;
      if (before.samples[i] !== after.samples[i]) return true;
    }
  return false;
}
