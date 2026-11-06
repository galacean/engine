/** A distance surface may discard bevel geometry, never the placement lattice.
 * This immutable image is derived from published unit footprints, once per edit.
 * It contains linear albedo modulation and coverage, not lighting or author state. */
export interface ConstructionLodAppearance {
  width: number;
  height: number;
  uvTransform: [number, number, number, number];
  pixels: Uint8Array;
}
export interface ConstructionLodCell {
  id: string;
  seed_id?: string;
  lod_seed_id?: string;
  anchor_uv: number[];
  size: number[];
  polygon?: number[][];
}
/** Metric UV footprints. UV charts remain the producer's original edit charts. */
export function constructionLodAppearance(
  uv: readonly number[][],
  cells: readonly ConstructionLodCell[],
  period = 0
): ConstructionLodAppearance {
  let minU = Infinity,
    minV = Infinity,
    maxU = -Infinity,
    maxV = -Infinity;
  for (const p of uv) {
    minU = Math.min(minU, p[0]);
    minV = Math.min(minV, p[1]);
    maxU = Math.max(maxU, p[0]);
    maxV = Math.max(maxV, p[1]);
  }
  if (!Number.isFinite(minU + minV + maxU + maxV)) throw Error("Missing LOD appearance chart");
  const spanU = Math.max(0.001, maxU - minU),
    spanV = Math.max(0.001, maxV - minV);
  // Bounded per-surface storage; filtering removes small joints without inventing
  // a different grid. No screen-dependent regeneration or per-frame uploads.
  const density = Math.min(32, 1024 / spanU, 1024 / spanV, Math.sqrt(262144 / (spanU * spanV)));
  const width = Math.max(1, Math.floor(spanU * density)),
    height = Math.max(1, Math.floor(spanV * density));
  const pixels = new Uint8Array(width * height * 2);
  const su = width / spanU,
    sv = height / spanV;
  for (let i = 0; i < pixels.length; i += 2) {
    pixels[i] = Math.round((0.72 / 1.08) * 255);
  }
  for (const cell of cells) {
    let hash = 2166136261;
    const variation = cell.lod_seed_id ?? cell.id;
    for (let i = 0; i < variation.length; i++) hash = Math.imul(hash ^ variation.charCodeAt(i), 16777619);
    const value = 0.94 + ((hash >>> 0) / 4294967296) * 0.12;
    for (const shift of period > 0 ? [-period, 0, period] : [0]) {
      const poly = cell.polygon?.map(([u, v]) => [(u + shift - minU) * su, (v - minV) * sv]);
      const x0 = poly ? Math.min(...poly.map((p) => p[0])) : (cell.anchor_uv[0] + shift - cell.size[0] / 2 - minU) * su,
        x1 = poly ? Math.max(...poly.map((p) => p[0])) : (cell.anchor_uv[0] + shift + cell.size[0] / 2 - minU) * su,
        y0 = poly ? Math.min(...poly.map((p) => p[1])) : (cell.anchor_uv[1] - cell.size[1] / 2 - minV) * sv,
        y1 = poly ? Math.max(...poly.map((p) => p[1])) : (cell.anchor_uv[1] + cell.size[1] / 2 - minV) * sv;
      const edges = poly?.map((a, i) => {
        const b = poly[(i + 1) % poly.length],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          l = Math.hypot(dx, dy);
        return { x: a[0], y: a[1], dx: dx / (l || 1), dy: dy / (l || 1) };
      });
      const winding = poly
        ? Math.sign(
            poly.reduce((sum, a, i) => {
              const b = poly[(i + 1) % poly.length];
              return sum + a[0] * b[1] - a[1] * b[0];
            }, 0)
          )
        : 1;
      if (!winding) continue;
      for (let y = Math.max(0, Math.floor(y0)); y < Math.min(height, Math.ceil(y1)); y++) {
        const cy = Math.max(0, Math.min(y + 1, y1) - Math.max(y, y0));
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(width, Math.ceil(x1)); x++) {
          let coverage = cy * Math.max(0, Math.min(x + 1, x1) - Math.max(x, x0));
          if (edges) {
            coverage = 1;
            for (const e of edges)
              coverage = Math.min(coverage, 0.5 + winding * (e.dx * (y + 0.5 - e.y) - e.dy * (x + 0.5 - e.x)));
            coverage = Math.max(0, coverage);
          }
          const i = (y * width + x) * 2;
          // Overlapping/closure units cover rather than darken each other.
          if (coverage * 255 <= pixels[i + 1]) continue;
          pixels[i] = Math.round(((0.72 + (value - 0.72) * coverage) / 1.08) * 255);
          pixels[i + 1] = Math.round(coverage * 255);
        }
      }
    }
  }
  return { width, height, pixels, uvTransform: [minU, minV, 1 / spanU, 1 / spanV] };
}

/** Project a unit's tangent footprint into its published source triangle. This
 * keeps curved-roof row positions and metric stretch; no second UV grid. */
export function constructionLodSurfaceCells(
  geometry: { vertices: number[][]; uv: number[][]; triangles: number[][] },
  cells: readonly (ConstructionLodCell & { surface_piece: number; tangent: number[]; bitangent: number[] })[]
): ConstructionLodCell[] {
  return cells.map((cell) => {
    const tri = geometry.triangles[cell.surface_piece];
    if (!tri) throw Error("LOD unit has no source surface triangle");
    const [a, b, c] = tri.map((i) => geometry.vertices[i]),
      [A, B, C] = tri.map((i) => geometry.uv[i]);
    const e = b.map((v, i) => v - a[i]),
      f = c.map((v, i) => v - a[i]);
    const dot = (x: number[], y: number[]) => x.reduce((sum, v, i) => sum + v * y[i], 0);
    const ee = dot(e, e),
      ff = dot(f, f),
      ef = dot(e, f),
      det = ee * ff - ef * ef;
    if (!(det > 0)) throw Error("Degenerate LOD source triangle");
    const project = (axis: number[]) => {
      const ae = dot(axis, e),
        af = dot(axis, f),
        u = (ae * ff - af * ef) / det,
        v = (af * ee - ae * ef) / det;
      return A.map((x, i) => u * (B[i] - x) + v * (C[i] - x));
    };
    const u = project(cell.tangent),
      v = project(cell.bitangent);
    const polygon = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1]
    ].map(([x, y]) => cell.anchor_uv.map((p, i) => p + (x * cell.size[0] * u[i]) / 2 + (y * cell.size[1] * v[i]) / 2));
    return {
      id: cell.id,
      ...(cell.seed_id !== undefined ? { seed_id: cell.seed_id } : {}),
      ...(cell.lod_seed_id !== undefined ? { lod_seed_id: cell.lod_seed_id } : {}),
      anchor_uv: cell.anchor_uv,
      size: cell.size,
      polygon
    };
  });
}
