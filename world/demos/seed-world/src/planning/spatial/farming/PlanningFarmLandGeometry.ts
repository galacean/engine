import { decodeSeedWorldHeight, seedWorldOriginX, seedWorldOriginZ } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import type { PlanningFarmingTerrain } from "./PlanningPublishedFarmingGround.ts";
import type { FarmLandChunk } from "./PlanningFarmLandCoverage.ts";

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

/** Native a--d triangles, with only POSITION and NORMAL; UVs and tangents are not consumed by the ground shader. */
export function buildFarmLandGeometry(
  grid: FarmLandGrid,
  chunk: Pick<FarmLandChunk, "x" | "z">,
  heights: Float64Array,
  surfaceOffset: number
) {
  const segments = FARM_LAND_SEGMENTS,
    side = segments + 1;
  const gx = Math.round((chunk.x - grid.x) / grid.pitch),
    gz = Math.round((chunk.z - grid.z) / grid.pitch);
  const at = (ix: number, iz: number) => heights[(iz - gz + 1) * sampleSide + ix - gx + 1];
  const wx = (ix: number) => Math.fround(grid.x + ix * grid.pitch);
  const wz = (iz: number) => Math.fround(grid.z + iz * grid.pitch);
  const vertices = new Float32Array(side * side * 6),
    indices: number[] = [];
  let minimumY = Infinity,
    maximumY = -Infinity;
  for (let z = 0; z <= segments; z++)
    for (let x = 0; x <= segments; x++) {
      const ix = gx + x,
        iz = gz + z,
        height = at(ix, iz),
        offset = (z * side + x) * 6;
      const valid = Number.isFinite(height),
        y = valid ? height + surfaceOffset : 0;
      vertices[offset] = wx(ix) - Math.fround(chunk.x);
      vertices[offset + 1] = y;
      vertices[offset + 2] = wz(iz) - Math.fround(chunk.z);
      vertices[offset + 4] = 1;
      if (!valid) continue;
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
      vertices[offset + 3] = -dx / length;
      vertices[offset + 4] = 1 / length;
      vertices[offset + 5] = -dz / length;
      minimumY = Math.min(minimumY, vertices[offset + 1]);
      maximumY = Math.max(maximumY, vertices[offset + 1]);
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
    width: wx(gx + segments) - Math.fround(chunk.x),
    depth: wz(gz + segments) - Math.fround(chunk.z),
    minimumY: Number.isFinite(minimumY) ? minimumY : 0,
    maximumY: Number.isFinite(maximumY) ? maximumY : 0
  };
}
