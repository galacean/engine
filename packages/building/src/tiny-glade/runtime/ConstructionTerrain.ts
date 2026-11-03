import { constructionSupportMeshes } from "./ConstructionTerrainTransfer";
import { ConstructionGroundSupports, type ConstructionGroundMesh } from "./ConstructionGroundSupports";
import type { MasonryDocument } from "./MasonryDocument";
import { originalTerrainSampler } from "./PublishedWallProfile";
import type { TerrainHeight } from "./PublishedWallProfile";

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
function supportQuery(mesh: ConstructionGroundMesh) {
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
/** Host support lives in world Y, independent of footprint extent and decode bounds.
 * Placement rotates/translates XZ only in grounded mode. Each wall's layout frame
 * is owned by the compiler; adding distant geometry cannot rebase existing walls.
 * This adapts the recovered profile policy to the host's unrestricted elevations,
 * rather than importing Tiny Glade's scene-specific sea-floor constants. */
export function prepareConstructionTerrain(
  document: MasonryDocument,
  input: ArrayBuffer | ConstructionTerrainGrid
): { height: TerrainHeight; grounding?: ConstructionGrounding } {
  if (document.construction.environment.type === "original_cottage_terrain") {
    if (!(input instanceof ArrayBuffer)) throw Error("Original terrain requires its R16 source");
    return { height: originalTerrainSampler(new Uint16Array(input)) };
  }
  if (document.construction.environment.type !== "host_terrain" || input instanceof ArrayBuffer)
    throw Error("Missing host terrain field");
  validateConstructionTerrain(input);
  if (!document.construction.buildings.length) throw Error("Grounding requires a building footprint");
  const placement = document.placement;
  if (!placement) throw Error("Host terrain grounding requires an explicit placement");
  const [px, , pz] = placement.position,
    c = Math.cos(placement.rotationY),
    s = Math.sin(placement.rotationY);
  const supports = constructionSupportMeshes(document, input).map(supportQuery);
  return {
    height: (x, z) => {
      const wx = px + c * x + s * z,
        wz = pz - s * x + c * z;
      let height = constructionTerrainHeight(input, wx, wz);
      for (const query of supports) height = query.sample(wx, wz, height);
      return height;
    },
    grounding: { originY: 0, renderPosition: [px, 0, pz] }
  };
}
