import { ROCK_GROUND_BURIAL, sampleRockGround } from "./Ground.ts";
import type { RockGround } from "@galacean/engine-terrain/rock-formation/types";

/** Close the retained mesh against terrain after all surface deformation.
 * Only perimeter Y changes; interior positions, X/Z, indices and owners stay fixed.
 */
export function constrainRockGroundContact(
  positions: Float32Array,
  indices: Uint32Array,
  neighbors: Int32Array,
  active: Float32Array,
  ground: RockGround,
  burial = ROCK_GROUND_BURIAL
): number {
  const lowering = new Float64Array(positions.length / 3);
  for (let t = 0; t < active.length; t++) {
    if (!active[t]) continue;
    for (let edge = 0; edge < 3; edge++) {
      const neighbor = neighbors[t * 3 + edge];
      if (neighbor >= 0 && active[neighbor]) continue;
      const a = indices[t * 3 + edge],
        b = indices[t * 3 + ((edge + 1) % 3)];
      const ax = positions[a * 3],
        az = positions[a * 3 + 2];
      const bx = positions[b * 3],
        bz = positions[b * 3 + 2];
      const ay = Math.min(positions[a * 3 + 1], sampleRockGround(ground, ax, az) - burial);
      const by = Math.min(positions[b * 3 + 1], sampleRockGround(ground, bx, bz) - burial);
      const gap = edgeClearance(ground, ax, ay, az, bx, by, bz, burial);
      // Taking the maximum incident request is order-independent. Lowering a
      // shared endpoint further cannot reopen another boundary edge.
      lowering[a] = Math.max(lowering[a], positions[a * 3 + 1] - ay + gap);
      lowering[b] = Math.max(lowering[b], positions[b * 3 + 1] - by + gap);
    }
  }
  let changed = 0;
  const tolerance = burial * 1e-4;
  for (let v = 0; v < lowering.length; v++)
    if (lowering[v] > tolerance) {
      positions[v * 3 + 1] -= lowering[v];
      changed++;
    }
  return changed;
}

/** Terrain and the rock edge are linear between grid edges and a--d diagonals.
 * Their maximum separation therefore occurs at one of these intersections.
 */
function edgeClearance(
  ground: RockGround,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  burial: number
): number {
  const u0 = (ax - ground.minX) / ground.spacingX,
    u1 = (bx - ground.minX) / ground.spacingX;
  const v0 = (az - ground.minZ) / ground.spacingZ,
    v1 = (bz - ground.minZ) / ground.spacingZ;
  const cuts = [0, 1];
  const crossings = (a: number, b: number, last: number) => {
    if (a === b) return;
    const first = Math.max(0, Math.ceil(Math.min(a, b)));
    const end = Math.min(last, Math.floor(Math.max(a, b)));
    for (let coordinate = first; coordinate <= end; coordinate++) {
      const t = (coordinate - a) / (b - a);
      if (t > 0 && t < 1) cuts.push(t);
    }
  };
  crossings(u0, u1, ground.columns - 1);
  crossings(v0, v1, ground.rows - 1);
  cuts.sort((a, b) => a - b);
  const u = (t: number) => Math.max(0, Math.min(ground.columns - 1, u0 + (u1 - u0) * t));
  const v = (t: number) => Math.max(0, Math.min(ground.rows - 1, v0 + (v1 - v0) * t));
  const clearance = (t: number) =>
    ay + (by - ay) * t + burial - sampleRockGround(ground, ax + (bx - ax) * t, az + (bz - az) * t);
  let maximum = 0;
  for (let i = 0; i < cuts.length; i++) {
    const end = cuts[i];
    maximum = Math.max(maximum, clearance(end));
    if (!i || end === cuts[i - 1]) continue;
    const start = cuts[i - 1],
      middle = (start + end) / 2;
    const cellX = Math.min(ground.columns - 2, Math.floor(u(middle)));
    const cellZ = Math.min(ground.rows - 2, Math.floor(v(middle)));
    const diagonal = (t: number) => u(t) - cellX - (v(t) - cellZ);
    const a = diagonal(start),
      b = diagonal(end);
    if (a * b < 0) maximum = Math.max(maximum, clearance(start + ((end - start) * a) / (a - b)));
  }
  return maximum;
}
