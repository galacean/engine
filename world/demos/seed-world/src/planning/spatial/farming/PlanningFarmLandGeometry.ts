import { decodeSeedWorldHeight, seedWorldOriginX, seedWorldOriginZ } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import type { GroundBounds } from "@galacean/engine-farming/farming/api/index";
import type { PlanningFarmingTerrain } from "./PlanningPublishedFarmingGround.ts";
import { FARM_LAND_MASK_SPACING_M, type FarmLandChunk } from "./PlanningFarmLandCoverage.ts";

/** Geometry follows the native height lattice; the independent coverage texture retains 0.1 m precision. */
export const FARM_LAND_SEGMENTS = 8;
const sampleSide = FARM_LAND_SEGMENTS + 3;
export const FARM_LAND_HEIGHT_SAMPLE_COUNT = sampleSide * sampleSide;

export function farmLandGrid(fields: PlanningFarmingTerrain) {
  const pitch = fields.sizeMetres / (fields.heightResolution - 1);
  const x = seedWorldOriginX(fields),
    z = seedWorldOriginZ(fields);
  return {
    x,
    z,
    pitch,
    resolution: fields.heightResolution,
    size: FARM_LAND_SEGMENTS * pitch,
    key: `${x}/${z}/${pitch}/${fields.heightResolution}`
  };
}
export type FarmLandGrid = ReturnType<typeof farmLandGrid>;

/** Cache only this chunk plus one normal-sampling cell. Never copy the world's height/coverage arrays. */
export function captureFarmLandHeights(
  fields: PlanningFarmingTerrain,
  grid: FarmLandGrid,
  chunk: Pick<FarmLandChunk, "x" | "z">,
  target = new Float64Array(FARM_LAND_HEIGHT_SAMPLE_COUNT)
): Float64Array {
  const gx = Math.round((chunk.x - grid.x) / grid.pitch),
    gz = Math.round((chunk.z - grid.z) / grid.pitch);
  for (let z = 0; z < sampleSide; z++)
    for (let x = 0; x < sampleSide; x++) {
      const ix = gx + x - 1,
        iz = gz + z - 1;
      target[z * sampleSide + x] =
        ix < 0 || iz < 0 || ix >= grid.resolution || iz >= grid.resolution
          ? NaN
          : (fields.surfaceHeights?.[iz * grid.resolution + ix] ??
            decodeSeedWorldHeight(fields, fields.heightSamples[iz * grid.resolution + ix]));
    }
  return target;
}

export function sameFarmLandHeights(a: Float64Array, b: Float64Array): boolean {
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

function cellOverlapsExpandedBounds(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  activeBounds: readonly GroundBounds[],
  pad: number
): boolean {
  for (let i = 0; i < activeBounds.length; i++) {
    const b = activeBounds[i];
    if (b.maximumX + pad >= x0 && b.minimumX - pad <= x1 && b.maximumZ + pad >= z0 && b.minimumZ - pad <= z1) return true;
  }
  return false;
}

/** 2x32-bit mask of cells in this 8x8 chunk whose AABB overlaps activeBounds expanded by margin + mask spacing. */
export function farmLandActiveCellMask(
  grid: FarmLandGrid,
  chunk: Pick<FarmLandChunk, "x" | "z">,
  activeBounds: readonly GroundBounds[],
  margin = 0
): { maskLo: number; maskHi: number } {
  const segments = FARM_LAND_SEGMENTS;
  const gx = Math.round((chunk.x - grid.x) / grid.pitch),
    gz = Math.round((chunk.z - grid.z) / grid.pitch);
  const pad = margin + FARM_LAND_MASK_SPACING_M;
  let maskLo = 0,
    maskHi = 0;
  for (let z = 0; z < segments; z++) {
    const iz = gz + z;
    if (iz < 0 || iz + 1 >= grid.resolution) continue;
    const z0 = Math.fround(grid.z + iz * grid.pitch);
    const z1 = Math.fround(grid.z + (iz + 1) * grid.pitch);
    for (let x = 0; x < segments; x++) {
      const ix = gx + x;
      if (ix < 0 || ix + 1 >= grid.resolution) continue;
      const x0 = Math.fround(grid.x + ix * grid.pitch);
      const x1 = Math.fround(grid.x + (ix + 1) * grid.pitch);
      if (!cellOverlapsExpandedBounds(x0, z0, x1, z1, activeBounds, pad)) continue;
      const bit = z * segments + x;
      if (bit < 32) maskLo = (maskLo | (1 << bit)) >>> 0;
      else maskHi = (maskHi | (1 << (bit - 32))) >>> 0;
    }
  }
  return { maskLo, maskHi };
}

/** Native a--d triangles, with only POSITION and NORMAL; UVs and tangents are not consumed by the ground shader. */
export function buildFarmLandGeometry(
  grid: FarmLandGrid,
  chunk: Pick<FarmLandChunk, "x" | "z">,
  heights: Float64Array,
  surfaceOffset: number,
  activeBounds?: readonly GroundBounds[],
  margin = 0
) {
  const segments = FARM_LAND_SEGMENTS,
    side = segments + 1;
  const gx = Math.round((chunk.x - grid.x) / grid.pitch),
    gz = Math.round((chunk.z - grid.z) / grid.pitch);
  const originChunkX = Math.fround(chunk.x),
    originChunkZ = Math.fround(chunk.z);
  const at = (ix: number, iz: number) => heights[(iz - gz + 1) * sampleSide + ix - gx + 1];
  const wx = (ix: number) => Math.fround(grid.x + ix * grid.pitch);
  const wz = (iz: number) => Math.fround(grid.z + iz * grid.pitch);
  const width = wx(gx + segments) - originChunkX;
  const depth = wz(gz + segments) - originChunkZ;
  const fillVertex = (x: number, z: number, target: Float32Array, offset: number, boundsState: {
    minimumX: number;
    maximumX: number;
    minimumZ: number;
    maximumZ: number;
    minimumY: number;
    maximumY: number;
  }) => {
    const ix = gx + x,
      iz = gz + z,
      height = at(ix, iz);
    const valid = Number.isFinite(height),
      y = valid ? height + surfaceOffset : 0;
    const vx = wx(ix) - originChunkX,
      vz = wz(iz) - originChunkZ;
    target[offset] = vx;
    target[offset + 1] = y;
    target[offset + 2] = vz;
    target[offset + 4] = 1;
    boundsState.minimumX = Math.min(boundsState.minimumX, vx);
    boundsState.maximumX = Math.max(boundsState.maximumX, vx);
    boundsState.minimumZ = Math.min(boundsState.minimumZ, vz);
    boundsState.maximumZ = Math.max(boundsState.maximumZ, vz);
    if (!valid) return;
    const cx = Math.min(ix, grid.resolution - 2),
      cz = Math.min(iz, grid.resolution - 2);
    const a = at(cx, cz),
      b = at(cx + 1, cz),
      c = at(cx, cz + 1),
      d = at(cx + 1, cz + 1);
    const lower = ix - cx <= iz - cz;
    const dx = (lower ? d - c : b - a) / (wx(cx + 1) - wx(cx));
    const dz = (lower ? c - a : d - b) / (wz(cz + 1) - wz(cz));
    const length = Math.hypot(dx, 1, dz);
    target[offset + 3] = -dx / length;
    target[offset + 4] = 1 / length;
    target[offset + 5] = -dz / length;
    boundsState.minimumY = Math.min(boundsState.minimumY, y);
    boundsState.maximumY = Math.max(boundsState.maximumY, y);
  };
  const boundsState = {
    minimumX: Infinity,
    maximumX: -Infinity,
    minimumZ: Infinity,
    maximumZ: -Infinity,
    minimumY: Infinity,
    maximumY: -Infinity
  };
  if (activeBounds !== undefined) {
    const pad = margin + FARM_LAND_MASK_SPACING_M;
    const remap = new Int16Array(side * side).fill(-1);
    const activeCoords: number[] = [];
    const indices: number[] = [];
    let vertexCount = 0;
    const ensureCorner = (cx: number, cz: number): number => {
      const slot = cz * side + cx;
      let idx = remap[slot];
      if (idx < 0) {
        idx = vertexCount++;
        remap[slot] = idx;
        activeCoords.push(cx, cz);
      }
      return idx;
    };
    for (let z = 0; z < segments; z++) {
      const iz = gz + z;
      if (iz < 0 || iz + 1 >= grid.resolution) continue;
      const z0 = wz(iz),
        z1 = wz(iz + 1);
      for (let x = 0; x < segments; x++) {
        const ix = gx + x;
        if (ix < 0 || ix + 1 >= grid.resolution) continue;
        const x0 = wx(ix),
          x1 = wx(ix + 1);
        if (!cellOverlapsExpandedBounds(x0, z0, x1, z1, activeBounds, pad)) continue;
        const a = ensureCorner(x, z),
          b = ensureCorner(x + 1, z),
          c = ensureCorner(x, z + 1),
          d = ensureCorner(x + 1, z + 1);
        indices.push(a, c, d, a, d, b);
      }
    }
    if (!vertexCount) {
      return {
        vertices: new Float32Array(0),
        indices: new Uint16Array(0),
        width,
        depth,
        minimumX: 0,
        maximumX: 0,
        minimumZ: 0,
        maximumZ: 0,
        minimumY: 0,
        maximumY: 0
      };
    }
    const vertices = new Float32Array(vertexCount * 6);
    for (let i = 0; i < vertexCount; i++) {
      fillVertex(activeCoords[i * 2], activeCoords[i * 2 + 1], vertices, i * 6, boundsState);
    }
    return {
      vertices,
      indices: new Uint16Array(indices),
      width,
      depth,
      minimumX: boundsState.minimumX,
      maximumX: boundsState.maximumX,
      minimumZ: boundsState.minimumZ,
      maximumZ: boundsState.maximumZ,
      minimumY: Number.isFinite(boundsState.minimumY) ? boundsState.minimumY : 0,
      maximumY: Number.isFinite(boundsState.maximumY) ? boundsState.maximumY : 0
    };
  }
  const vertices = new Float32Array(side * side * 6),
    indices: number[] = [];
  for (let z = 0; z <= segments; z++)
    for (let x = 0; x <= segments; x++) {
      fillVertex(x, z, vertices, (z * side + x) * 6, boundsState);
    }
  for (let z = 0; z < segments; z++)
    for (let x = 0; x < segments; x++) {
      if (gx + x < 0 || gz + z < 0 || gx + x + 1 >= grid.resolution || gz + z + 1 >= grid.resolution) continue;
      const a = z * side + x,
        b = a + 1,
        c = a + side,
        d = c + 1;
      indices.push(a, c, d, a, d, b);
    }
  return {
    vertices,
    indices: new Uint16Array(indices),
    width,
    depth,
    minimumX: Number.isFinite(boundsState.minimumX) ? boundsState.minimumX : 0,
    maximumX: Number.isFinite(boundsState.maximumX) ? boundsState.maximumX : 0,
    minimumZ: Number.isFinite(boundsState.minimumZ) ? boundsState.minimumZ : 0,
    maximumZ: Number.isFinite(boundsState.maximumZ) ? boundsState.maximumZ : 0,
    minimumY: Number.isFinite(boundsState.minimumY) ? boundsState.minimumY : 0,
    maximumY: Number.isFinite(boundsState.maximumY) ? boundsState.maximumY : 0
  };
}
