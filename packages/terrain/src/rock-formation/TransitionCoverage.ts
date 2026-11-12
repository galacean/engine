import type { RockFormationMesh } from "./types";
const cache = new WeakMap<RockFormationMesh, Float32Array>();

/** Area-weighted visual coverage shared by rock vertices and grass roots.
 * Formation snapshots are immutable; the cache follows their lifetime. Sampling
 * coverage stays separate so shading changes do not alter placement or support.
 */
export function sharedRockTransitionCoverage(formation: RockFormationMesh): Float32Array {
  const cached = cache.get(formation);
  if (cached) return cached;
  const { positions, indices } = formation.mesh;
  const sum = new Float64Array(positions.length / 3);
  const weights = new Float64Array(sum.length);
  const result = new Float32Array(sum.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3,
      b = indices[i + 1] * 3,
      c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a],
      uy = positions[b + 1] - positions[a + 1],
      uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a],
      vy = positions[c + 1] - positions[a + 1],
      vz = positions[c + 2] - positions[a + 2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    for (let j = 0; j < 3; j++) {
      const vertex = indices[i + j];
      sum[vertex] += area * (formation.grass?.coverage[i + j] ?? 0);
      weights[vertex] += area;
    }
  }
  for (let i = 0; i < result.length; i++) result[i] = weights[i] > 0 ? sum[i] / weights[i] : 0;
  cache.set(formation, result);
  return result;
}
