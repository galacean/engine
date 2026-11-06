/** Pure placement math. All coordinates are local to the owning part, in metres. */
export type BuildingPoint = [number, number, number];
export interface BuildingPose {
  position: BuildingPoint;
  /** Unit local +X; +Y faces out of a Surface, or follows the supplied path up. */
  tangent: BuildingPoint;
  normal: BuildingPoint;
}
export interface BuildingMeshData {
  positions: readonly BuildingPoint[];
  uvs: readonly [number, number][];
  indices: readonly number[];
}
export const subtract = (a: readonly number[], b: readonly number[]): BuildingPoint => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2]
];
export const cross = (a: readonly number[], b: readonly number[]): BuildingPoint => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
export const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function point(value: readonly number[], label = "Point"): BuildingPoint {
  if (value.length !== 3 || !value.every(Number.isFinite)) throw Error(`${label} needs three finite coordinates`);
  return [...value] as BuildingPoint;
}
export function unit(value: readonly number[]): BuildingPoint {
  const p = point(value),
    length = Math.hypot(...p);
  if (length < 1e-10) throw Error("Direction must be nonzero");
  return p.map((v) => v / length) as BuildingPoint;
}
export function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw Error(`${label} must be positive and finite`);
  return value;
}
export function budget(count: number, limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(count) || count > limit)
    throw Error(`Placement budget exceeded: ${count} candidates, limit ${limit}`);
}
export function buildingPose(
  position: readonly number[],
  tangent: readonly number[],
  up: readonly number[]
): BuildingPose {
  const x = unit(tangent),
    z = unit(cross(x, unit(up)));
  return { position: point(position), tangent: x, normal: unit(cross(z, x)) };
}

/** A derived UV chart over real triangles. No second authored surface geometry.
 * UVs must not overlap within the selected chart. Split atlas islands into submeshes.
 * Geometric triangle normals preserve hard edges and match the rendered triangles. */
export class BuildingMeshChart {
  private readonly triangles: {
    p: BuildingPoint[];
    uv: [number, number][];
    det: number;
    tangent: BuildingPoint;
    normal: BuildingPoint;
  }[] = [];
  readonly bounds: { min: [number, number]; max: [number, number] } = {
    min: [Infinity, Infinity],
    max: [-Infinity, -Infinity]
  };
  constructor(data: BuildingMeshData) {
    if (
      !data.positions.length ||
      data.positions.length !== data.uvs.length ||
      !data.indices.length ||
      data.indices.length % 3
    )
      throw Error("Surface needs positions, matching UVs and triangles");
    data.positions.forEach((p) => point(p));
    if (data.uvs.some((uv) => uv.length !== 2 || !uv.every(Number.isFinite)))
      throw Error("Surface UVs must be finite pairs");
    if (data.indices.some((i) => !Number.isSafeInteger(i) || i < 0 || i >= data.positions.length))
      throw Error("Invalid Surface triangle index");
    for (let i = 0; i < data.indices.length; i += 3) {
      const ids = data.indices.slice(i, i + 3),
        p = ids.map((j) => [...data.positions[j]] as BuildingPoint),
        uv = ids.map((j) => [...data.uvs[j]] as [number, number]);
      const a = subtract(p[1], p[0]),
        b = subtract(p[2], p[0]);
      const du1 = uv[1][0] - uv[0][0],
        dv1 = uv[1][1] - uv[0][1],
        du2 = uv[2][0] - uv[0][0],
        dv2 = uv[2][1] - uv[0][1];
      const det = du1 * dv2 - du2 * dv1;
      if (Math.abs(det) < 1e-12 || Math.hypot(...cross(a, b)) < 1e-10)
        throw Error("Surface contains a degenerate UV or geometry triangle");
      const tangent = unit(a.map((v, k) => (v * dv2 - b[k] * dv1) / det));
      this.triangles.push({ p, uv, det, tangent, normal: unit(cross(a, b)) });
      for (const v of uv)
        for (let k = 0; k < 2; k++) {
          this.bounds.min[k] = Math.min(this.bounds.min[k], v[k]);
          this.bounds.max[k] = Math.max(this.bounds.max[k], v[k]);
        }
    }
  }
  /** Intersect the actual UV triangles with a horizontal scanline, preserving holes. */
  intervals(v: number): [number, number][] {
    if (!Number.isFinite(v)) throw Error("Finite scanline required");
    const spans: [number, number][] = [];
    for (const t of this.triangles) {
      const xs: number[] = [];
      for (let i = 0; i < 3; i++) {
        const a = t.uv[i],
          b = t.uv[(i + 1) % 3];
        if (Math.abs(a[1] - b[1]) < 1e-10) {
          if (Math.abs(v - a[1]) < 1e-9) xs.push(a[0], b[0]);
        } else {
          const q = (v - a[1]) / (b[1] - a[1]);
          if (q >= -1e-9 && q <= 1 + 1e-9) xs.push(a[0] + q * (b[0] - a[0]));
        }
      }
      if (xs.length > 1) {
        const lo = Math.min(...xs),
          hi = Math.max(...xs);
        if (hi - lo > 1e-8) spans.push([lo, hi]);
      }
    }
    spans.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const s of spans) {
      const last = merged.at(-1);
      if (last && s[0] <= last[1] + 1e-8) last[1] = Math.max(last[1], s[1]);
      else merged.push([...s]);
    }
    return merged;
  }
  /** Coordinates where a finite boundary can change, used to split courses at opening edges. */
  get vBreaks(): number[] {
    return [...new Set(this.triangles.flatMap((t) => t.uv.map((p) => p[1])))].sort((a, b) => a - b);
  }
  /** Null means outside geometry, including actual holes. Overlapping UV interiors reject. */
  sample(u: number, v: number, offset = 0): BuildingPose | null {
    if (![u, v, offset].every(Number.isFinite)) throw Error("Surface sample must be finite");
    let result: BuildingPose | null = null,
      interior = false;
    for (const t of this.triangles) {
      const x = u - t.uv[0][0],
        y = v - t.uv[0][1];
      const b = (x * (t.uv[2][1] - t.uv[0][1]) - y * (t.uv[2][0] - t.uv[0][0])) / t.det;
      const c = ((t.uv[1][0] - t.uv[0][0]) * y - (t.uv[1][1] - t.uv[0][1]) * x) / t.det,
        a = 1 - b - c;
      if (Math.min(a, b, c) < -1e-9) continue;
      const inside = Math.min(a, b, c) > 1e-9;
      if (interior && inside)
        throw Error("Ambiguous Surface UV: overlapping triangles; select a separate submesh chart");
      const position = t.p[0].map((n, k) => n * a + t.p[1][k] * b + t.p[2][k] * c) as BuildingPoint;
      if (result && Math.hypot(...subtract(position, result.position)) > 1e-7)
        throw Error("Ambiguous Surface UV: disconnected boundaries; select a separate submesh chart");
      if (!result || inside) result = { position, tangent: [...t.tangent], normal: [...t.normal] };
      interior ||= inside;
    }
    if (result) result.position = result.position.map((n, k) => n + result!.normal[k] * offset) as BuildingPoint;
    return result;
  }
}
export interface BuildingSurfaceGrid {
  /** UV increments, not guessed metres. Use a metric UV chart for metre spacing. */
  step: [number, number];
  stagger?: number;
  offset?: number;
  /** Explicit computational budget, fails instead of returning a truncated building. */
  limit?: number;
}
export function surfaceGrid(chart: BuildingMeshChart, options: BuildingSurfaceGrid): BuildingPose[] {
  const [du, dv] = options.step;
  positive(du, "U step");
  positive(dv, "V step");
  const stagger = options.stagger ?? 0;
  if (!Number.isFinite(stagger) || stagger < 0 || stagger >= 1) throw Error("Stagger must be in [0,1)");
  const { min, max } = chart.bounds,
    cols = Math.ceil((max[0] - min[0]) / du),
    rows = Math.ceil((max[1] - min[1]) / dv);
  budget(cols * rows, options.limit ?? 10000);
  const poses: BuildingPose[] = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const u = min[0] + (col + 0.5 + (row % 2) * stagger) * du,
        v = min[1] + (row + 0.5) * dv;
      if (u > max[0] || v > max[1]) continue;
      const pose = chart.sample(u, v, options.offset);
      if (pose) poses.push(pose);
    }
  return poses;
}

/** Polyline in part-local metres. Curves can be tessellated by Agent algorithms.
 * No hidden gravity/sag field; up is explicit, parallel segments reject. */
export class BuildingPath {
  private readonly points: BuildingPoint[];
  private readonly spans: number[];
  readonly length: number;
  /** Exact authored polyline vertices; callers cannot mutate the path's metric. */
  get controlPoints(): readonly BuildingPoint[] {
    return this.points.map((p) => [...p] as BuildingPoint);
  }
  constructor(
    points: readonly BuildingPoint[],
    readonly closed = false
  ) {
    if (points.length < 2) throw Error("Path needs at least two points");
    this.points = points.map((p) => point(p));
    if (closed) this.points.push([...this.points[0]]);
    this.spans = this.points
      .slice(1)
      .map((p, i) => positive(Math.hypot(...subtract(p, this.points[i])), "Path segment length"));
    this.length = this.spans.reduce((a, b) => a + b, 0);
  }
  sample(distance: number, up: BuildingPoint = [0, 1, 0]): BuildingPose {
    if (!Number.isFinite(distance) || distance < 0 || distance > this.length) throw Error("Distance lies outside path");
    let i = 0;
    while (i < this.spans.length - 1 && distance > this.spans[i]) distance -= this.spans[i++];
    const a = this.points[i],
      b = this.points[i + 1],
      t = distance / this.spans[i];
    return buildingPose(
      a.map((v, k) => v + (b[k] - v) * t),
      subtract(b, a),
      up
    );
  }
}
export function pathArray(
  path: BuildingPath,
  spacing: number,
  options: { start?: number; up?: BuildingPoint; limit?: number } = {}
): BuildingPose[] {
  positive(spacing, "Path spacing");
  const start = options.start ?? 0;
  if (!Number.isFinite(start) || start < 0 || start > path.length) throw Error("Path start lies outside path");
  // A closed path's endpoint is its start, so never emit that duplicate.
  const count = path.closed
    ? Math.ceil((path.length - start) / spacing)
    : Math.floor((path.length - start) / spacing) + 1;
  budget(count, options.limit ?? 10000);
  return Array.from({ length: count }, (_, i) => path.sample(start + i * spacing, options.up));
}
/** Land-style beam: known endpoints define position, direction and length. */
export function beamBetween(
  a: BuildingPoint,
  b: BuildingPoint,
  up: BuildingPoint = [0, 1, 0]
): { pose: BuildingPose; length: number } {
  const direction = subtract(point(b), point(a));
  return {
    pose: buildingPose(
      a.map((v, k) => (v + b[k]) / 2),
      direction,
      up
    ),
    length: positive(Math.hypot(...direction), "Beam length")
  };
}
