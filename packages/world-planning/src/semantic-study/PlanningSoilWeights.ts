import type { IslandPlan } from "./IslandPlanModel";
import type { PlanningAlphamap } from "./PlanningAlphamap";

/** Material-only split. Preserve roads, soften shore edges, and stamp only accepted bridge landings. */
export function planningSoilWeights(
  plan: Pick<IslandPlan, "parameters" | "roadApproaches">,
  original: Uint8Array,
  alpha: PlanningAlphamap
): Uint8Array {
  const coverage = planningSoilCoverage(plan, alpha),
    river = alpha.riverBedCoverage,
    weights = original.slice();
  for (let i = 0; i < coverage.length; i++) {
    const grass = Math.round((original[i * 4] * (255 - (river?.[i] ?? 0))) / 255);
    const dirt = Math.min(255 - grass, coverage[i]);
    weights[i * 4] = grass;
    weights[i * 4 + 1] = 255 - grass - dirt;
    weights[i * 4 + 2] = dirt;
  }
  return weights;
}

/** One byte per existing texel; no new full-size distance field or polygon raster pass. */
export function planningSoilCoverage(
  plan: Pick<IslandPlan, "parameters" | "roadApproaches">,
  alpha: PlanningAlphamap,
  resolution = alpha.resolution
): Uint8Array {
  const n = resolution,
    river = alpha.riverBedCoverage,
    sourceSize = alpha.resolution;
  if (
    !Number.isInteger(n) ||
    n < 2 ||
    sourceSize < 2 ||
    alpha.weights.length !== sourceSize ** 2 * 4 ||
    (river && river.length !== sourceSize ** 2)
  )
    throw new RangeError("Invalid soil coverage lattice");
  const coverage = new Uint8Array(n * n);
  if (river) {
    const sample = (x: number, z: number) =>
      (river[z * sourceSize + x] * (255 - alpha.weights[(z * sourceSize + x) * 4 + 1])) / 255;
    if (n === sourceSize) {
      for (let i = 0; i < coverage.length; i++)
        coverage[i] = Math.round((river[i] * (255 - alpha.weights[i * 4 + 1])) / 255);
    } else {
      // Resample the supplied raster, never reconstruct polygons or depend on a global compiler cache.
      const scale = (sourceSize - 1) / (n - 1);
      for (let z = 0; z < n; z++)
        for (let x = 0; x < n; x++) {
          const fx = x * scale,
            fz = z * scale,
            x0 = Math.floor(fx),
            z0 = Math.floor(fz);
          const x1 = Math.min(sourceSize - 1, x0 + 1),
            z1 = Math.min(sourceSize - 1, z0 + 1),
            tx = fx - x0,
            tz = fz - z0;
          coverage[z * n + x] = Math.round(
            (sample(x0, z0) * (1 - tx) + sample(x1, z0) * tx) * (1 - tz) +
              (sample(x0, z1) * (1 - tx) + sample(x1, z1) * tx) * tz
          );
        }
    }
  }
  const sx = plan.parameters.width / (n - 1),
    sz = plan.parameters.depth / (n - 1);
  const smooth = (v: number) => {
    const t = Math.max(0, Math.min(1, v));
    return t * t * (3 - 2 * t);
  };
  for (const approach of plan.roadApproaches ?? [])
    for (const landing of approach.approach?.landings ?? []) {
      const [a, b] = landing.edge,
        width = Math.hypot(b.x - a.x, b.z - a.z),
        cell = landing.terrainCellM;
      const cx = (a.x + b.x) / 2,
        cz = (a.z + b.z) / 2,
        margin = cell * 2;
      for (
        let z = Math.max(0, Math.floor((Math.min(a.z, b.z) - margin) / sz));
        z <= Math.min(n - 1, Math.ceil((Math.max(a.z, b.z) + margin) / sz));
        z++
      )
        for (
          let x = Math.max(0, Math.floor((Math.min(a.x, b.x) - margin) / sx));
          x <= Math.min(n - 1, Math.ceil((Math.max(a.x, b.x) + margin) / sx));
          x++
        ) {
          const dx = x * sx - cx,
            dz = z * sz - cz;
          const along = dx * landing.inward.x + dz * landing.inward.z,
            across = Math.abs((dx * (b.x - a.x) + dz * (b.z - a.z)) / width);
          const weight = (1 - smooth((Math.abs(along) - cell) / cell)) * (1 - smooth((across - width / 2) / cell));
          const i = z * n + x;
          coverage[i] = Math.max(coverage[i], Math.round(255 * weight));
        }
    }
  return coverage;
}
