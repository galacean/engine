import type { PlanningHeightmap } from "../../../semantic-study/PlanningHeightmap.ts";
import type { RockGround, RockDomain } from "@galacean/engine-terrain/rock-formation/types";
import { interpolateGridTriangle } from "@galacean/engine-terrain/geometry/GridInterpolation";

export const ROCK_GROUND_BURIAL = 0.05;

/** Retain native terrain spacing instead of resampling the terrain at rock resolution. */
export function captureRockGround(
  map: Pick<PlanningHeightmap, "resolution" | "spacingX" | "spacingZ" | "heights">,
  domain: RockDomain,
  origin: readonly number[],
  margin: number
): RockGround {
  const last = map.resolution - 1;
  const interval = (min: number, size: number, spacing: number) => {
    const start = Math.max(0, Math.min(last - 1, Math.floor((min - margin) / spacing)));
    const end = Math.max(start + 1, Math.min(last, Math.ceil((min + size + margin) / spacing)));
    return [start, end];
  };
  const [x0, x1] = interval(origin[0] + domain.minX, domain.width, map.spacingX),
    [z0, z1] = interval(origin[2] + domain.minZ, domain.depth, map.spacingZ),
    columns = x1 - x0 + 1,
    rows = z1 - z0 + 1,
    heights = new Float32Array(columns * rows);
  for (let z = 0; z < rows; z++)
    for (let x = 0; x < columns; x++) {
      heights[x + z * columns] = map.heights[x0 + x + (z0 + z) * map.resolution] - origin[1];
    }
  const minX = x0 * map.spacingX - origin[0],
    minZ = z0 * map.spacingZ - origin[2];
  return {
    minX,
    minZ,
    columns,
    rows,
    heights,
    spacingX: map.spacingX,
    spacingZ: map.spacingZ
  };
}

/** Same a--d triangle split and +Z row order as the native terrain. */
export function sampleRockGround(ground: RockGround, x: number, z: number): number {
  const u = Math.max(0, Math.min(ground.columns - 1, (x - ground.minX) / ground.spacingX)),
    v = Math.max(0, Math.min(ground.rows - 1, (z - ground.minZ) / ground.spacingZ)),
    i = Math.min(ground.columns - 2, Math.floor(u)),
    j = Math.min(ground.rows - 2, Math.floor(v)),
    a = u - i,
    b = v - j,
    k = i + j * ground.columns,
    h = ground.heights;
  return interpolateGridTriangle(h[k], h[k + 1], h[k + ground.columns], h[k + ground.columns + 1], a, b);
}

/** Correct the foot, fading to zero at the existing peak; never translate the whole OBB. */
export function rockGroundHeight(y: number, terrain: number, floor: number, peak: number): number {
  const height = Math.max(0, y - floor),
    weight = (1 - Math.min(1, height / Math.max(1e-6, peak - floor))) ** 2;
  // A 5 cm buried contact avoids two competing surfaces at the terrain seam.
  return y + (terrain - floor - ROCK_GROUND_BURIAL) * weight;
}
