import { clamp } from '../../ridge-utils.mjs';

export const DEFAULT_FRACTURE_SMOOTHING = .65;
export const fractureSmoothing = (value = DEFAULT_FRACTURE_SMOOTHING) =>
  Number.isFinite(value) ? clamp(value, 0, 1) : DEFAULT_FRACTURE_SMOOTHING;

const fractureNormalTargets = new WeakMap();

/** Render-only smoothing on a welded, immutable carved atom. Angle weights keep
 * Boolean triangulation density from biasing the normal. Uncut body vertices
 * retain their original normal field; separate atoms never blend together. */
export function smoothFractureNormals(geometry, hardNormals, amount) {
  amount = fractureSmoothing(amount);
  if (!amount || !geometry.faceTags?.some(tag => tag > 0)) return hardNormals;
  let cached = fractureNormalTargets.get(geometry);
  if (!cached || cached.hardNormals !== hardNormals) {
    const { positions, indices, faceTags } = geometry;
    const target = new Float64Array(positions.length);
    const affected = new Uint8Array(positions.length / 3);
    for (let t = 0; t < indices.length; t += 3) {
      for (let corner = 0; corner < 3; corner++) {
        const id = indices[t + corner], a = id * 3;
        const b = indices[t + (corner + 1) % 3] * 3;
        const c = indices[t + (corner + 2) % 3] * 3;
        const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
        const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
        const angle = Math.atan2(Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx), ux * vx + uy * vy + uz * vz);
        for (let d = 0; d < 3; d++) target[a + d] += angle * hardNormals[(t + corner) * 3 + d];
        if (faceTags[t / 3] > 0) affected[id] = 1;
      }
    }
    for (let a = 0; a < target.length; a += 3) {
      const length = Math.hypot(target[a], target[a + 1], target[a + 2]);
      if (length > 1e-12) for (let d = 0; d < 3; d++) target[a + d] /= length;
      else affected[a / 3] = 0;
    }
    cached = { hardNormals, target, affected };
    fractureNormalTargets.set(geometry, cached);
  }
  const normals = Array.from(hardNormals), { target, affected } = cached;
  for (let i = 0; i < geometry.indices.length; i++) {
    const id = geometry.indices[i];
    if (!affected[id]) continue;
    const a = id * 3, b = i * 3;
    const x = hardNormals[b] + (target[a] - hardNormals[b]) * amount;
    const y = hardNormals[b + 1] + (target[a + 1] - hardNormals[b + 1]) * amount;
    const z = hardNormals[b + 2] + (target[a + 2] - hardNormals[b + 2]) * amount;
    const length = Math.hypot(x, y, z);
    if (length > 1e-12) { normals[b] = x / length; normals[b + 1] = y / length; normals[b + 2] = z / length; }
  }
  return normals;
}
