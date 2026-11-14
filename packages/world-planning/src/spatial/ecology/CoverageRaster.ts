import type { PlanPoint } from "../../semantic-study/IslandPlanModel";

/** Rasterize unions of regions, preserving each region's even-odd holes.
 * Samples are vertex-centred, row-major +Z. Four subpixel samples soften boundaries
 * without changing the authored contour. No density is regenerated here.
 * @param regions Compound contour rings, grouped by independently editable region.
 * @param resolution Square sample count, including both world boundaries.
 * @param width World extent along X in metres.
 * @param depth World extent along Z in metres.
 * @returns Coverage bytes in [0,255].
 */
export function rasterizeCoverageRegions(
  regions: readonly PlanPoint[][][],
  resolution: number,
  width: number,
  depth: number,
  owners?: Uint32Array
): Uint8Array {
  const bits = new Uint8Array(resolution * resolution),
    intervals = resolution - 1;
  const offsets = [-0.25, 0.25];
  for (let regionIndex = 0; regionIndex < regions.length; regionIndex++) {
    const rings = regions[regionIndex];
    const points = rings.flat();
    if (!points.length) continue;
    const lo = Math.max(0, Math.floor((Math.min(...points.map((p) => p.z)) / depth) * intervals - 1));
    const hi = Math.min(intervals, Math.ceil((Math.max(...points.map((p) => p.z)) / depth) * intervals + 1));
    for (let row = lo; row <= hi; row++)
      for (let sy = 0; sy < 2; sy++) {
        const z = ((row + offsets[sy]) * depth) / intervals,
          xs: number[] = [];
        for (const ring of rings)
          for (let i = 0; i < ring.length; i++) {
            const a = ring[i],
              b = ring[(i + 1) % ring.length];
            if (a.z > z !== b.z > z) xs.push(((a.x + ((z - a.z) * (b.x - a.x)) / (b.z - a.z)) / width) * intervals);
          }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2)
          for (let sx = 0; sx < 2; sx++) {
            const first = Math.max(0, Math.ceil(xs[k] - offsets[sx]));
            const last = Math.min(intervals, Math.floor(xs[k + 1] - offsets[sx]));
            for (let col = first; col <= last; col++) {
              const index = row * resolution + col;
              bits[index] |= 1 << (sy * 2 + sx);
              // Overlapping authored regions use stable first-contributor ownership.
              if (owners && !owners[index]) owners[index] = regionIndex + 1;
            }
          }
      }
  }
  return bits.map((b) => Math.round((((b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1) + ((b >> 3) & 1)) * 255) / 4));
}
