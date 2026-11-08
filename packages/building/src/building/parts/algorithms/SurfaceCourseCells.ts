import { cross, subtract, unit, positive, type BuildingMeshChart, type BuildingPoint } from "../BuildingLayout";
import type { AssetCell, AssetBatchParameters } from "../native/AssetInstanceBatch";
export interface SurfaceCourseParameters extends AssetBatchParameters {
  size: BuildingPoint;
  overlap?: number;
  stagger?: number;
  jitter?: number;
  offset?: number;
  gap?: number;
  /** Split at mesh UV vertices for facades with openings; roofs keep constant course spacing. */
  splitAtVertices?: boolean;
  /** Split interior blocks into two stones; boundary blocks remain full course height. */
  splitProbability?: number;
  /** Allowed extension below the first course, in V chart units. The upper end stays fitted. */
  startOverhang?: number;
}
function random(seed: number) {
  let x = seed | 0;
  return () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Pure sampling. All geometry, directions and holes come from the supplied mesh chart. */
export function surfaceCourseCells(chart: BuildingMeshChart, p: SurfaceCourseParameters): AssetCell[] {
  p.size.forEach((v) => positive(v, "Unit size"));
  const overlap = p.overlap ?? 0,
    gap = p.gap ?? 0.012,
    stagger = p.stagger ?? 0.5,
    jitter = p.jitter ?? 0.15;
  if (
    ![overlap, gap, stagger, jitter].every(Number.isFinite) ||
    overlap < 0 ||
    overlap >= 1 ||
    gap < 0 ||
    stagger < 0 ||
    stagger >= 1 ||
    jitter < 0 ||
    jitter > 0.45
  )
    throw Error("Invalid course parameters");
  const step = p.size[1] * (1 - overlap),
    lo = chart.bounds.min[1],
    hi = chart.bounds.max[1],
    n = Math.ceil((hi - lo) / step);
  if (!Number.isSafeInteger(n) || n > 10000) throw Error("Course budget exceeded");
  const R = random(p.seed ?? 17),
    cells: AssetCell[] = [];
  const split = p.splitProbability ?? 0,
    overhang = p.startOverhang ?? 0;
  if (![split, overhang, p.offset ?? 0].every(Number.isFinite) || split < 0 || split > 1 || overhang < 0)
    throw Error("Invalid boundary parameters");
  const features = p.splitAtVertices ? chart.vBreaks : [lo, hi],
    cuts: number[] = [lo];
  for (let i = 0; i < features.length - 1; i++) {
    const a = features[i],
      b = features[i + 1],
      count = Math.max(1, Math.round((b - a) / step));
    for (let j = 1; j < count; j++)
      cuts.push(a + ((j + (p.material === "brick" ? (R() - 0.5) * jitter : 0)) * (b - a)) / count);
    cuts.push(b);
  }

  if (cuts.length > 10001) throw Error("Course budget exceeded");
  for (let row = 0; row < cuts.length - 1; row++) {
    const v0 = cuts[row],
      v1 = cuts[row + 1],
      v = (v0 + v1) / 2;
    for (const [u0, u1] of chart.intervals(v)) {
      const left = chart.sample(u0, v),
        right = chart.sample(u1, v);
      if (!left || !right) continue;
      const length = Math.hypot(...subtract(right.position, left.position));
      if (length < 1e-6) continue;
      const cols = Math.max(1, Math.round(length / p.size[0])),
        du = (u1 - u0) / cols;
      if (cols > 100000) throw Error("Unit budget exceeded");
      const boundaries = [u0];
      for (let col = 0; col <= cols; col++) {
        const u = u0 + (col + (row % 2) * stagger + (R() - 0.5) * jitter) * du;
        if (u > u0 + du * 0.18 && u < u1 - du * 0.18) boundaries.push(u);
      }
      boundaries.push(u1);
      boundaries.sort((a, b) => a - b);
      for (let col = 0; col < boundaries.length - 1; col++) {
        const a = boundaries[col],
          b = boundaries[col + 1],
          u = (a + b) / 2;
        const inner = col > 0 && col < boundaries.length - 2;
        const mid = v0 + (v1 - v0) * (0.35 + R() * 0.3);
        const bands =
          inner && R() < split
            ? [
                [v0, mid],
                [mid, v1]
              ]
            : [[v0, v1]];
        for (const [band0, band1] of bands) {
          // Overlap extends towards the previous course. Clamp to the chart's lower edge
          // except for the explicit eave allowance. Nothing extends beyond the upper edge.
          const extension = (band1 - band0) * (1 / (1 - overlap) - 1) * (1 + (R() - 0.5) * jitter);
          const lower = Math.max(lo - overhang, band0 - extension),
            upper = band1 - (p.material === "roof_tile" ? R() * jitter * (band1 - band0) * 0.5 : 0);
          const vCenter = (lower + upper) / 2;
          const pose = chart.sample(u, Math.max(lo + 1e-8, vCenter), p.offset ?? 0);
          const L = chart.sample(a, (band0 + band1) / 2),
            D = chart.sample(b, (band0 + band1) / 2);
          const B = chart.sample(u, band0 + 1e-8),
            T = chart.sample(u, band1 - 1e-8);
          if (!pose || !L || !D || !B || !T) continue;
          const width = Math.hypot(...subtract(D.position, L.position));
          const height = (Math.hypot(...subtract(T.position, B.position)) * (upper - lower)) / (band1 - band0);
          if (width <= gap || height <= gap) continue;
          const tangent = unit(subtract(D.position, L.position)),
            bitangent = unit(cross(pose.normal, tangent));
          const center = pose.position.map((x, k) => x + bitangent[k] * Math.min(0, vCenter - lo)) as BuildingPoint;
          cells.push({
            id: `course/${row}/${col}/${a.toFixed(5)}/${band0.toFixed(5)}`,
            center,
            tangent,
            bitangent,
            normal: pose.normal,
            size: [width - gap, height - gap, p.size[2]],
            ...(p.material === "brick"
              ? {
                  brick_deformation: Array.from({ length: 4 }, () => (R() - 0.5) * 0.055),
                  brick_seed: Math.floor(R() * 0x7fffffff)
                }
              : {})
          });
          if (cells.length > 100000) throw Error("Unit budget exceeded");
        }
      }
    }
  }
  return cells;
}
