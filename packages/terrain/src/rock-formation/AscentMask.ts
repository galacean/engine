import { ascendingBoundary } from "./AscendingBoundary";
import { seedVoronoiOutline } from "./VoronoiOutline";
import { hashSeed, random } from "./math";
import { surfaceTriangle, triangleHeight } from "./TriangleSampling";
import { rockFaceSlopeRate } from "./Slope";
import { DEFAULT_ROCK_HEIGHT_VARIATION, type GuideProfile, type RockDomain, type RockObb } from "./types";

/** Preserve the lab's independent outline, face-rate, and upper-height random streams. */
export function seedAscentProfile(obb: RockObb, seed: number): GuideProfile {
  const heightVariation = obb.heightVariation ?? DEFAULT_ROCK_HEIGHT_VARIATION;
  if (!Number.isFinite(heightVariation) || heightVariation < 0 || heightVariation > 1)
    throw new Error("Rock upper height variation must be between 0 and 1");
  const slopeRate = rockFaceSlopeRate(obb, seed);
  const { top } = seedVoronoiOutline(seed, obb.id, 3);
  const rng = random(hashSeed(seed, obb.id));
  rng(); // The original outline-phase draw precedes the face-rate stream.
  const phase = rng() * Math.PI * 2,
    secondPhase = rng() * Math.PI * 2;
  const faces = top.map((v, i) => {
    const next = top[(i + 1) % top.length].uv,
      angle = Math.atan2(v.uv[1] + next[1], v.uv[0] + next[0]);
    const variation = 0.55 * Math.cos(angle + phase) + 0.3 * Math.sin(2 * angle + secondPhase) + 0.15 * (rng() * 2 - 1);
    return { id: `face-${i}`, descentRate: slopeRate(variation), bottomSplits: [0.3 + rng() * 0.4] };
  });
  const heightRng = random(hashSeed(seed, `${obb.id}/upper-height`));
  const heightPhase = heightRng() * Math.PI * 2,
    secondHeightPhase = heightRng() * Math.PI * 2;
  for (const v of top) {
    const angle = Math.atan2(v.uv[1], v.uv[0]);
    const local = random(hashSeed(seed, `${obb.id}/upper-height/${v.id}`))() * 2 - 1;
    v.heightOffset =
      obb.size[1] *
      heightVariation *
      (0.55 * Math.sin(2 * angle + heightPhase) + 0.25 * Math.sin(3 * angle + secondHeightPhase) + 0.2 * local);
  }
  return { obb, outlineShape: "voronoi", top, faces };
}

/** Rasterize the actual inward/upward source, with a separately calibrated mask per OBB. */
export function ascentMask(obb: RockObb, seed: number, domain: RockDomain): Float32Array {
  const n = domain.resolution,
    dx = domain.width / (n - 1),
    dz = domain.depth / (n - 1);
  const result = new Float32Array(n * n);
  for (const points of ascendingBoundary(seedAscentProfile(obb, seed)).triangles) {
    const t = surfaceTriangle(...points);
    if (!t) continue;
    const x0 = Math.max(0, Math.ceil((t.bounds[0] - domain.minX) / dx - 1e-8));
    const x1 = Math.min(n - 1, Math.floor((t.bounds[2] - domain.minX) / dx + 1e-8));
    const z0 = Math.max(0, Math.ceil((t.bounds[1] - domain.minZ) / dz - 1e-8));
    const z1 = Math.min(n - 1, Math.floor((t.bounds[3] - domain.minZ) / dz + 1e-8));
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const k = x + z * n;
        result[k] = Math.max(result[k], triangleHeight(t, domain.minX + x * dx, domain.minZ + z * dz));
      }
  }
  // Compact joint-bilateral smoothing from the lab's mask stage. Keep support
  // at the OBB footprint and restore each cell's peak before noise calibration.
  const peak = Math.max(...result),
    radius = 8,
    retention = 0.25;
  const axis = (values: Float32Array, stride: number, spacing: number) => {
    const output = new Float32Array(values.length),
      reach = Math.min(n - 1, Math.floor(radius / spacing));
    if (!reach) return values.slice();
    for (let k = 0; k < values.length; k++) {
      if (result[k] <= 0) continue;
      const coordinate = stride === 1 ? k % n : Math.floor(k / n);
      const start = Math.max(-reach, -coordinate),
        end = Math.min(reach, n - coordinate - 1);
      let low = result[k],
        high = low;
      for (let o = start; o <= end; o++) {
        low = Math.min(low, result[k + o * stride]);
        high = Math.max(high, result[k + o * stride]);
      }
      const sigma = Math.max(1e-6, ((high - low) * 0.25) / retention);
      let sum = 0,
        total = 0;
      for (let o = start; o <= end; o++) {
        const j = k + o * stride,
          q = ((o * spacing) / radius) ** 2;
        const w = Math.exp(-4.5 * q) * (1 - q) ** 2 * Math.exp(-0.5 * ((result[j] - result[k]) / sigma) ** 2);
        sum += values[j] * w;
        total += w;
      }
      output[k] = sum / total;
    }
    return output;
  };
  const forward = axis(axis(result, 1, dx), n, dz),
    reverse = axis(axis(result, n, dz), 1, dx);
  const smoothed = forward.map((v, i) => (v + reverse[i]) * 0.5),
    filteredPeak = Math.max(...smoothed);
  if (filteredPeak > 0) for (let k = 0; k < smoothed.length; k++) smoothed[k] *= peak / filteredPeak;
  return smoothed;
}

export function sampleRockField(heights: Float32Array, d: RockDomain, x: number, z: number): number {
  const n = d.resolution;
  if (x < d.minX || z < d.minZ || x > d.minX + d.width || z > d.minZ + d.depth) return 0;
  const u = ((x - d.minX) / d.width) * (n - 1),
    v = ((z - d.minZ) / d.depth) * (n - 1);
  const i = Math.min(n - 2, Math.floor(u)),
    j = Math.min(n - 2, Math.floor(v)),
    a = u - i,
    b = v - j,
    k = i + j * n;
  return (
    (heights[k] * (1 - a) + heights[k + 1] * a) * (1 - b) + (heights[k + n] * (1 - a) + heights[k + n + 1] * a) * b
  );
}
