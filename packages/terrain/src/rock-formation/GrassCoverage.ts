import { smoothstep } from "./math";
import type { RockSurface } from "./types";

/** Topology-owned roof identity is independent of slope or detail normals. */
export type GrassCoveredSurface = RockSurface & {
  surfaceRoles?: Float32Array;
  grassCoverage: Float32Array;
};

/**
 * One continuous per-vertex field for the rock shader, grass sampling and contact appearance.
 * Roof interiors stay meadows even when tilted; upward side ledges use geometric support.
 * Seed's angular normal averaging and coherent transition modulation are retained, while its
 * heightmap guide-normal classifier is replaced by this generator's explicit roof identity.
 */
export function buildGrassCoverage(surface: RockSurface, roles?: Float32Array): Float32Array {
  const { positions: p, indices } = surface;
  const count = p.length / 3;
  if (roles && roles.length !== count) throw Error("Roof role count must match rock vertices");
  const upward = new Float64Array(count),
    weights = new Float64Array(count);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3,
      b = indices[t + 1] * 3,
      c = indices[t + 2] * 3;
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-10) continue;
    for (let corner = 0; corner < 3; corner++) {
      const vertex = indices[t + corner],
        k = vertex * 3;
      const u = indices[t + ((corner + 1) % 3)] * 3,
        v = indices[t + ((corner + 2) % 3)] * 3;
      const dot =
        (p[u] - p[k]) * (p[v] - p[k]) +
        (p[u + 1] - p[k + 1]) * (p[v + 1] - p[k + 1]) +
        (p[u + 2] - p[k + 2]) * (p[v + 2] - p[k + 2]);
      const angle = Math.atan2(length, dot);
      upward[vertex] += (ny / length) * angle;
      weights[vertex] += angle;
    }
  }
  const coverage = new Float32Array(count);
  const ledgeBare = Math.cos((70 * Math.PI) / 180),
    ledgeFull = Math.cos((45 * Math.PI) / 180);
  for (let vertex = 0; vertex < count; vertex++) {
    const up = weights[vertex] ? upward[vertex] / weights[vertex] : 0;
    const roof = Math.max(0, Math.min(1, roles?.[vertex] ?? 0));
    // Do not reinterpret a deformed roof as a wall. Only walls/platforms need a slope classifier.
    const meadow = Math.max(roof, smoothstep(ledgeBare, ledgeFull, up));
    const patch = coherentPatch(p[vertex * 3], p[vertex * 3 + 2]);
    // Variation is confined to the transition: it can never perforate a full roof interior.
    coverage[vertex] = smoothstep(0, 1, meadow) * (1 - 4 * meadow * (1 - meadow) * 0.35 * (1 - patch));
  }
  return coverage;
}

// Same 3m coherent transition modulation used by native rock-formation/GrassSurface.ts.
function coherentPatch(x: number, z: number): number {
  const ix = Math.floor(x / 3),
    iz = Math.floor(z / 3);
  const u = smoothstep(0, 1, x / 3 - ix),
    v = smoothstep(0, 1, z / 3 - iz);
  const at = (x: number, z: number) => {
    let n = Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ Math.imul(7, 0x9e3779b9);
    n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
    n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
    return ((n ^ (n >>> 15)) >>> 0) / 0x100000000;
  };
  return (
    (at(ix, iz) * (1 - u) + at(ix + 1, iz) * u) * (1 - v) + (at(ix, iz + 1) * (1 - u) + at(ix + 1, iz + 1) * u) * v
  );
}
