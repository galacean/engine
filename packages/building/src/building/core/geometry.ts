import { add, cross, dot, finite, length, normalize, positive, scale, sub, vec3, type Vec3 } from "./math";
import { compareKeys } from "./identity";
import type { AssetRef } from "./unit";

/** Orthonormal frame. `x` follows u (or the curve), `y` follows v (or up), `z = x × y`. */
export interface Frame {
  readonly origin: Vec3;
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
}
/** Polyline in part-local metres. The parameter is arc length. */
export interface CurveData {
  readonly points: readonly Vec3[];
  readonly closed?: boolean;
  readonly up?: Vec3;
}
/** Plain data evaluated through a registered surface kind, so it can cross threads. */
export interface SurfaceData {
  readonly kind: string;
  readonly params: unknown;
}
/** Where a point sits on a host surface, in the host's own (u, v) coordinates. */
export interface SurfaceLocation {
  readonly host: number;
  readonly element: string;
  readonly u: number;
  readonly v: number;
}
export type GeometryElement =
  | { readonly kind: "point"; readonly frame: Frame; readonly on?: SurfaceLocation }
  | { readonly kind: "surface"; readonly surface: SurfaceData; readonly inherit?: readonly SurfaceInheritance[] };
/** A guest surface that continues a host surface: the host element's modifications apply to
 * this surface too, shifted by `offset` in surface coordinates. `host` indexes the hosts of
 * the guest's attach connection. */
export interface SurfaceInheritance {
  readonly host: number;
  readonly element: string;
  readonly offset?: readonly [number, number];
}
/** One geometry holds any mix of points, curves and surfaces. Element ids are unique across kinds. */
export interface BuildingGeometry {
  readonly elements: Readonly<Record<string, GeometryElement>>;
}
/** [u0, v0, u1, v1] in surface coordinates. */
export type Rect = readonly [number, number, number, number];
/** A closed polygon in surface coordinates. */
export type Outline = readonly (readonly [number, number])[];
/** Whether (u, v) lies inside a closed polygon. */
export function insideOutline(outline: Outline, u: number, v: number): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [ua, va] = outline[j],
      [ub, vb] = outline[i];
    if (va > v !== vb > v && u < ((ub - ua) * (v - va)) / (vb - va) + ua) inside = !inside;
  }
  return inside;
}
/** Plane [nx, ny, nz, d] in part-local metres, with a unit normal. Its kept side is n·p + d ≥ 0. */
export type Plane = readonly [number, number, number, number];
/** An upright box: its centre, its size across, up and out, and its level `out` direction, a
 * unit vector. Across runs square to `out`. */
export interface UprightBox {
  readonly center: Vec3;
  readonly size: Vec3;
  readonly out: Vec3;
}
/** Edits produced by connection rules. Original geometry is never mutated.
 * - `removeArea`: the surface is gone there, as at an opening. With an `outline` only the area
 *   inside it is gone; `rect` is then the outline's bounds.
 * - `reserveArea`: the surface stays, but other units occupy it; laid units give way.
 * - `clip`: units laid on the element are cut by the plane and keep its positive side.
 *   The element itself keeps its shape; the renderer does the cut.
 * - `clearBox`: units laid on the element give way inside the box, to something that stands
 *   there. The element keeps its shape; the renderer does the cut. */
export type GeometryModification =
  | { readonly element: string; readonly op: "removeElement" }
  | { readonly element: string; readonly op: "clip"; readonly plane: Plane }
  | { readonly element: string; readonly op: "clearBox"; readonly box: UprightBox }
  | { readonly element: string; readonly op: "removeArea"; readonly rect: Rect; readonly outline?: Outline }
  | { readonly element: string; readonly op: "addArea" | "reserveArea"; readonly rect: Rect }
  | { readonly element: string; readonly op: "removeSpan"; readonly span: readonly [number, number] };

export interface SurfaceDomain {
  readonly u: readonly [number, number];
  readonly v: readonly [number, number];
  /** u wraps around with period u[1] - u[0]. */
  readonly closedU: boolean;
}
/** Queries the building asks of the world around it. These are interfaces only: the
 * owning systems implement them (the ground height belongs to the terrain system), and
 * the building system neither samples, caches nor reshapes what they return. They must
 * be pure: the same input gives the same output, on the main thread and in Workers.
 * The draft never stores them. */
export interface BuildingEnvironment {
  readonly ground?: (x: number, z: number) => number;
  /** What the asset layer measured about an asset. The core reads `bounds` for a unit
   * prototype that does not state its own; part types read the facts they need. */
  readonly asset?: (source: AssetRef) => AssetFacts | undefined;
}
/** One layer of the space an asset occupies: a convex outline in the asset's x, z plane, standing
 * between two heights. The outline runs counter-clockwise when x points right and z up. */
export interface OccupancySolid {
  /** The member of the asset the layer belongs to. */
  readonly path: string;
  readonly y: readonly [number, number];
  readonly hull: readonly (readonly [number, number])[];
  /** The member lies over what it stands on: what it covers need not give way, but may. */
  readonly cover?: boolean;
}
/** The space one laid unit occupies: its asset's solids and the matrix that places them. */
export interface OccupiedUnit {
  readonly matrix: readonly number[];
  readonly solids: readonly OccupancySolid[];
}
/** Facts the asset layer measured about one asset: its local bounds, the space it occupies, and
 * any data the part types read. Plain JSON. */
export interface AssetFacts {
  readonly bounds?: { readonly min: readonly number[]; readonly max: readonly number[] };
  readonly occupancy?: readonly OccupancySolid[];
  readonly [fact: string]: unknown;
}
/** Built-in surfaces are metric: one unit of u or v is one metre along the surface. */
export interface SurfaceKind<P = any> {
  domain(params: P, environment: BuildingEnvironment): SurfaceDomain;
  frame(params: P, u: number, v: number, environment: BuildingEnvironment): Frame;
  /** The surface's actual extent as one polygon in (u, v), when it is smaller than the
   * domain rectangle. Default: the domain rectangle. */
  region?(params: P, environment: BuildingEnvironment): readonly (readonly [number, number])[];
  /** Areas inside the surface's extent that are not part of it, by its own shape, such as notches
   * along an edge. They count as removed areas, before any modification, and a surface that
   * copies these params has them too. Default: none. */
  cuts?(params: P, environment: BuildingEnvironment): readonly Rect[];
}
export interface SurfaceKinds {
  get(kind: string): SurfaceKind | undefined;
}
/** A surface kind with the environment already bound, as geometry consumers use it. */
export interface BoundSurfaceKind {
  domain(params: unknown): SurfaceDomain;
  frame(params: unknown, u: number, v: number): Frame;
  region?(params: unknown): readonly (readonly [number, number])[];
  cuts?(params: unknown): readonly Rect[];
}
export interface BoundSurfaces {
  get(kind: string): BoundSurfaceKind | undefined;
}
/** Surface kinds with one environment bound. */
export function bindSurfaces(surfaces: SurfaceKinds, environment: BuildingEnvironment): BoundSurfaces {
  return {
    get(name) {
      const kind = surfaces.get(name);
      return (
        kind && {
          domain: (params) => kind.domain(params, environment),
          frame: (params, u, v) => kind.frame(params, u, v, environment),
          ...(kind.region && { region: (params: unknown) => kind.region!(params, environment) }),
          ...(kind.cuts && { cuts: (params: unknown) => kind.cuts!(params, environment) })
        }
      );
    }
  };
}

const EPSILON = 1e-9;

class CurveSampler {
  readonly length: number;
  readonly closed: boolean;
  private readonly up: Vec3;
  private readonly starts: number[] = [];
  private readonly segments: { from: Vec3; direction: Vec3; length: number }[] = [];
  constructor(curve: CurveData) {
    if (!curve || !Array.isArray(curve.points) || curve.points.length < 2)
      throw Error("A curve needs at least two points");
    const points = curve.points.map((p, i) => vec3(p, `Curve point ${i}`));
    this.closed = curve.closed === true;
    if (this.closed && points.length < 3) throw Error("A closed curve needs at least three points");
    this.up = normalize(vec3(curve.up ?? [0, 1, 0], "Curve up"), "curve up");
    let total = 0;
    const count = this.closed ? points.length : points.length - 1;
    for (let i = 0; i < count; i++) {
      const from = points[i],
        delta = sub(points[(i + 1) % points.length], from),
        l = length(delta);
      if (!(l > EPSILON)) throw Error(`Curve segment ${i} has zero length`);
      this.starts.push(total);
      this.segments.push({ from, direction: scale(delta, 1 / l), length: l });
      total += l;
    }
    this.length = total;
  }
  /** Number of straight segments. */
  get segmentCount(): number {
    return this.starts.length;
  }
  /** Arc-length parameter of vertex i. */
  vertex(i: number): number {
    return i < this.starts.length ? this.starts[i] : this.length;
  }
  frame(s: number): Frame {
    finite(s, "Curve parameter");
    if (this.closed) s = ((s % this.length) + this.length) % this.length;
    else if (s < -EPSILON || s > this.length + EPSILON) throw Error("Curve parameter is outside the curve");
    let lo = 0,
      hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    const segment = this.segments[lo];
    const t = Math.min(Math.max(s - this.starts[lo], 0), segment.length);
    const x = segment.direction;
    const yRaw = sub(this.up, scale(x, dot(this.up, x)));
    if (!(length(yRaw) > 1e-9)) throw Error("Curve tangent is parallel to its up direction");
    const y = normalize(yRaw);
    return { origin: add(segment.from, scale(x, t)), x, y, z: cross(x, y) };
  }
}
const samplers = new WeakMap<CurveData, CurveSampler>();
export function curveSampler(curve: CurveData): CurveSampler {
  let sampler = samplers.get(curve);
  if (!sampler) samplers.set(curve, (sampler = new CurveSampler(curve)));
  return sampler;
}

/** A curve swept along its up direction. u = arc length, v = height. */
/** A strip of a surface along a polyline: u runs along it in metres, v across from 0 to 1, to the
 * point `offsets` away from each vertex. Without offsets it has no width and is only its line. */
export interface RibbonParams extends CurveData {
  readonly offsets?: readonly Vec3[];
}
export const ribbonSurface: SurfaceKind<RibbonParams> = {
  domain: (p) => ({ u: [0, curveSampler(p).length], v: [0, 1], closedU: p.closed === true }),
  frame: (p, u, v) => {
    const sampler = curveSampler(p);
    const f = sampler.frame(u);
    if (!p.offsets || !v) return f;
    const n = p.points.length;
    // A closed ribbon has a segment back to its first point, and u wraps like its curve's.
    const s = sampler.closed ? ((u % sampler.length) + sampler.length) % sampler.length : u;
    let i = 0;
    while (i + 1 < sampler.segmentCount && sampler.vertex(i + 1) < s) i++;
    const [a, b] = [sampler.vertex(i), sampler.vertex(i + 1)];
    const t = b > a ? Math.max(0, Math.min(1, (s - a) / (b - a))) : 0;
    const [p0, p1] = [p.offsets[i], p.offsets[(i + 1) % n]];
    return {
      ...f,
      origin: [0, 1, 2].map((k) => f.origin[k] + (p0[k] + (p1[k] - p0[k]) * t) * v) as unknown as Vec3
    };
  }
};
/** A ribbon as a geometry element. */
export const ribbon = (params: RibbonParams): GeometryElement => ({
  kind: "surface",
  surface: { kind: "ribbon", params }
});
/** The ribbon data of an element, if it is a ribbon. */
export const ribbonOf = (element: GeometryElement | undefined): RibbonParams | undefined =>
  element?.kind === "surface" && element.surface.kind === "ribbon"
    ? (element.surface.params as RibbonParams)
    : undefined;

export const extrusionSurface: SurfaceKind<{ curve: CurveData; height: number }> = {
  domain: (p) => ({
    u: [0, curveSampler(p.curve).length],
    v: [0, positive(p.height, "Extrusion height")],
    closedU: p.curve.closed === true
  }),
  frame: (p, u, v) => {
    const f = curveSampler(p.curve).frame(u);
    return { ...f, origin: add(f.origin, scale(f.y, finite(v, "Surface v"))) };
  }
};
/** Rectangle spanned by orthonormal axes x and y. */
export const planeSurface: SurfaceKind<{ origin: Vec3; x: Vec3; y: Vec3; size: readonly [number, number] }> = {
  domain: (p) => {
    planeAxes(p);
    return {
      u: [0, positive(p.size?.[0], "Plane width")],
      v: [0, positive(p.size?.[1], "Plane height")],
      closedU: false
    };
  },
  frame: (p, u, v) => {
    const { x, y } = planeAxes(p);
    const origin = add(
      add(vec3(p.origin, "Plane origin"), scale(x, finite(u, "Surface u"))),
      scale(y, finite(v, "Surface v"))
    );
    return { origin, x, y, z: cross(x, y) };
  }
};
function planeAxes(p: { x: Vec3; y: Vec3 }) {
  const x = normalize(vec3(p.x, "Plane x"), "plane x"),
    y = normalize(vec3(p.y, "Plane y"), "plane y");
  if (Math.abs(dot(x, y)) > 1e-9) throw Error("Plane axes must be orthogonal");
  return { x, y };
}

function frameIssue(frame: Frame): string | undefined {
  try {
    vec3(frame?.origin, "Frame origin");
    const x = vec3(frame.x, "Frame x"),
      y = vec3(frame.y, "Frame y"),
      z = vec3(frame.z, "Frame z");
    for (const axis of [x, y, z]) if (Math.abs(length(axis) - 1) > 1e-6) return "Frame axes must be unit length";
    if (Math.abs(dot(x, y)) > 1e-6 || Math.abs(dot(y, z)) > 1e-6 || Math.abs(dot(x, z)) > 1e-6)
      return "Frame axes must be orthogonal";
    if (dot(cross(x, y), z) < 0) return "Frame must be right-handed";
  } catch (error) {
    return (error as Error).message;
  }
}
function rectIssue(rect: unknown): string | undefined {
  if (!Array.isArray(rect) || rect.length !== 4 || !rect.every((v) => typeof v === "number" && Number.isFinite(v)))
    return "Area must be four finite numbers [u0, v0, u1, v1]";
  if (!(rect[2] > rect[0] && rect[3] > rect[1])) return "Area must have positive width and height";
}
export function geometryIssue(geometry: BuildingGeometry, surfaces: BoundSurfaces): string | undefined {
  if (!geometry || typeof geometry.elements !== "object" || geometry.elements === null)
    return "Geometry must have an elements record";
  for (const id of Object.keys(geometry.elements).sort(compareKeys)) {
    if (!id) return "Element ids must not be empty";
    const element = geometry.elements[id];
    try {
      if (element?.kind === "point") {
        const issue = frameIssue(element.frame);
        if (issue) return `Point "${id}": ${issue}`;
      } else if (element?.kind === "surface") {
        const kind = surfaces.get(element.surface?.kind);
        if (!kind) return `Surface "${id}" uses unknown kind "${element.surface?.kind}"`;
        kind.domain(element.surface.params);
      } else return `Element "${id}" has an unknown kind`;
    } catch (error) {
      return `Element "${id}": ${(error as Error).message}`;
    }
  }
}
export function modificationIssue(geometry: BuildingGeometry, modification: GeometryModification): string | undefined {
  if (!modification || typeof modification !== "object") return "Modification must be an object";
  const element = geometry.elements[modification.element];
  if (!element) return `Modification targets unknown element "${modification.element}"`;
  switch (modification.op) {
    case "removeElement":
      return;
    case "removeArea":
    case "addArea":
    case "reserveArea":
      if (element.kind !== "surface") return `${modification.op} needs a surface element`;
      if (modification.op === "removeArea" && modification.outline) {
        const { outline } = modification;
        if (outline.length < 3 || !outline.every((q) => q.length === 2 && q.every(Number.isFinite)))
          return "An outline needs three or more finite points [u, v]";
      }
      return rectIssue(modification.rect);
    case "clearBox": {
      const { center, size, out } = modification.box ?? ({} as Partial<UprightBox>);
      const finite3 = (v: unknown) =>
        Array.isArray(v) && v.length === 3 && v.every((c) => typeof c === "number" && Number.isFinite(c));
      if (!finite3(center) || !finite3(size) || !finite3(out)) return "A box needs a finite center, size and out";
      if (!size!.every((c) => c > 0)) return "A box's size must be positive";
      if (Math.abs(out![1]) > 1e-6 || Math.abs(Math.hypot(out![0], out![2]) - 1) > 1e-6)
        return "A box's out direction must be level and unit length";
      return;
    }
    case "clip": {
      const plane = modification.plane;
      if (
        !Array.isArray(plane) ||
        plane.length !== 4 ||
        !plane.every((v) => typeof v === "number" && Number.isFinite(v))
      )
        return "Clip plane must be four finite numbers [nx, ny, nz, d]";
      if (Math.abs(Math.hypot(plane[0], plane[1], plane[2]) - 1) > 1e-6) return "Clip plane normal must be unit length";
      return;
    }
    case "removeSpan": {
      if (!ribbonOf(element)) return "removeSpan needs a ribbon";
      const span = modification.span;
      if (!Array.isArray(span) || span.length !== 2 || !span.every(Number.isFinite) || !(span[1] > span[0]))
        return "Span must be two increasing finite numbers";
      return;
    }
    default:
      return `Unknown modification "${(modification as { op: unknown }).op}"`;
  }
}

/** A surface with its area edits applied. */
export class EffectiveSurface {
  readonly domain: SurfaceDomain;
  readonly bounds: { readonly u: readonly [number, number]; readonly v: readonly [number, number] };
  private readonly period: number;
  constructor(
    private readonly kind: BoundSurfaceKind,
    private readonly params: unknown,
    private readonly adds: readonly Rect[],
    private readonly removes: readonly Rect[],
    private readonly reserves: readonly Rect[] = [],
    private readonly outlines: ReadonlyMap<Rect, Outline> = new Map()
  ) {
    this.domain = kind.domain(params);
    this.period = this.domain.u[1] - this.domain.u[0];
    let [u0, u1] = this.domain.u,
      [v0, v1] = this.domain.v;
    for (const r of adds) {
      if (!this.domain.closedU) {
        u0 = Math.min(u0, r[0]);
        u1 = Math.max(u1, r[2]);
      }
      v0 = Math.min(v0, r[1]);
      v1 = Math.max(v1, r[3]);
    }
    this.bounds = { u: [u0, u1], v: [v0, v1] };
  }
  frame(u: number, v: number): Frame {
    return this.kind.frame(this.params, u, v);
  }
  /** Areas removed from this surface, one per edit, in surface coordinates. On a closed
   * surface an area may reach past the seam; to find what a range of u gives way to, use
   * `removedOver`. */
  get removed(): readonly Rect[] {
    return this.removes;
  }
  /** The outline of a removed area that is not its whole rectangle. */
  outlineOf(rect: Rect): Outline | undefined {
    return this.outlines.get(rect);
  }
  /** Areas of this surface that other units occupy, one per edit, in surface coordinates.
   * To find what a range of u gives way to, use `reservedOver`. */
  get reserved(): readonly Rect[] {
    return this.reserves;
  }
  /** The removed areas that overlap u0..u1, in that range's u. On a closed surface an area
   * counts once for each period it overlaps the range in, shifted there, so a range at
   * either side of the seam meets an area that crosses it. `keep` selects areas before
   * they are shifted. */
  removedOver(u0: number, u1: number, keep?: (area: Rect) => boolean): Rect[] {
    return this.over(keep ? this.removes.filter(keep) : this.removes, u0, u1);
  }
  /** The reserved areas that overlap u0..u1, in that range's u, as `removedOver`. */
  reservedOver(u0: number, u1: number): Rect[] {
    return this.over(this.reserves, u0, u1);
  }
  /** True when (u, v) lies in a removed area or on its edge, inside its outline if it has
   * one. A closed surface has no seam: u may be in any period. */
  removedAt(u: number, v: number): boolean {
    return this.removes.some((r) => this.inArea(r, u, v, true));
  }
  private over(areas: readonly Rect[], u0: number, u1: number): Rect[] {
    const out: Rect[] = [];
    for (const r of areas) {
      const [k0, k1] = this.domain.closedU
        ? [Math.ceil((u0 - r[2]) / this.period), Math.floor((u1 - r[0]) / this.period)]
        : [0, 0];
      for (let k = k0; k <= k1; k++) {
        const s = k * this.period;
        if (r[0] + s < u1 && u0 < r[2] + s) out.push(s === 0 ? r : [r[0] + s, r[1], r[2] + s, r[3]]);
      }
    }
    return out;
  }
  /** Whether (u, v) is in area `r` in some period, with or without its edge. */
  private inArea(r: Rect, u: number, v: number, edge: boolean): boolean {
    const outline = this.outlines.get(r);
    const inside = (a: number, b: number) => (edge ? a <= b : a < b);
    if (!(inside(r[1], v) && inside(v, r[3]))) return false;
    const s = this.domain.closedU ? Math.floor((u - r[0]) / this.period) * this.period : 0;
    return inside(r[0] + s, u) && inside(u, r[2] + s) && (!outline || insideOutline(outline, u - s, v));
  }
  /** The surface's actual extent before removed areas, as one polygon in (u, v). */
  region(): readonly (readonly [number, number])[] {
    if (!this.outline) {
      const { u, v } = this.domain;
      this.outline = this.kind.region
        ? this.kind.region(this.params)
        : [
            [u[0], v[0]],
            [u[1], v[0]],
            [u[1], v[1]],
            [u[0], v[1]]
          ];
    }
    return this.outline;
  }
  private outline?: readonly (readonly [number, number])[];
  /** Edge segments [ax, ay, bx, by] of the effective surface, shifted by the period on a
   * closed surface. Computed once: a surface does not change. */
  private edgeSegments(): Float64Array {
    if (this.edges) return this.edges;
    const out: number[] = [];
    const add = (a: readonly number[], b: readonly number[]) => {
      for (const s of this.shifts()) out.push(a[0] + s, a[1], b[0] + s, b[1]);
    };
    const outline = this.region();
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length];
      // The seam of a closed surface is not an edge.
      const at = (u: number, v: number) => Math.abs(u - v) <= EPSILON * Math.max(1, Math.abs(v));
      if (this.domain.closedU && at(a[0], b[0]) && (at(a[0], this.domain.u[0]) || at(a[0], this.domain.u[1]))) continue;
      add(a, b);
    }
    for (const r of this.removes) {
      const corners = [
        [r[0], r[1]],
        [r[2], r[1]],
        [r[2], r[3]],
        [r[0], r[3]]
      ];
      for (let i = 0; i < 4; i++) add(corners[i], corners[(i + 1) % 4]);
    }
    return (this.edges = Float64Array.from(out));
  }
  private edges?: Float64Array;
  /** Distance in surface coordinates from (u, v) to the nearest edge of the effective
   * surface: the region's outline or a removed area's outline. Capped at `limit`. A closed
   * surface has no edge at its seam. */
  edgeDistance(u: number, v: number, limit = 1): number {
    let best = limit * limit;
    const e = this.edgeSegments();
    for (let i = 0; i < e.length; i += 4) {
      const ax = e[i],
        ay = e[i + 1],
        dx = e[i + 2] - ax,
        dy = e[i + 3] - ay,
        l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / l2)) : 0;
      const d = (u - ax - dx * t) ** 2 + (v - ay - dy * t) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }
  private shifts(): number[] {
    return this.domain.closedU ? [-this.period, 0, this.period] : [0];
  }
  private included(u: number, v: number): boolean {
    const d = this.domain;
    if (
      v >= d.v[0] - EPSILON &&
      v <= d.v[1] + EPSILON &&
      (d.closedU || (u >= d.u[0] - EPSILON && u <= d.u[1] + EPSILON))
    )
      return true;
    return this.adds.some((r) =>
      this.shifts().some(
        (s) => u >= r[0] + s - EPSILON && u <= r[2] + s + EPSILON && v >= r[1] - EPSILON && v <= r[3] + EPSILON
      )
    );
  }
  contains(u: number, v: number): boolean {
    return this.included(u, v) && !this.removes.some((r) => this.inArea(r, u, v, false));
  }
  /** True when the whole rectangle lies on the effective surface. Inclusion in a union of
   * added areas is tested at the corners and centre; removed areas are tested exactly. */
  covers(rect: Rect): boolean {
    const [v0, v1] = [rect[1], rect[3]];
    let [u0, u1] = [rect[0], rect[2]];
    if (!(u1 > u0 && v1 > v0)) return false;
    if (this.domain.closedU) {
      const shift = Math.floor((u0 - this.domain.u[0]) / this.period) * this.period;
      u0 -= shift;
      u1 -= shift;
    }
    const um = (u0 + u1) / 2,
      vm = (v0 + v1) / 2;
    const corners: [number, number][] = [
      [u0, v0],
      [u1, v0],
      [u0, v1],
      [u1, v1],
      [um, vm]
    ];
    if (!corners.every(([u, v]) => this.included(u, v))) return false;
    return ![...this.removedOver(u0, u1), ...this.reservedOver(u0, u1)].some((r) => r[1] < v1 && v0 < r[3]);
  }
}
/** A curve with its span edits applied. */
export class EffectiveLine {
  constructor(
    private readonly sampler: CurveSampler,
    private readonly removes: readonly (readonly [number, number])[]
  ) {}
  get length(): number {
    return this.sampler.length;
  }
  get closed(): boolean {
    return this.sampler.closed;
  }
  frame(s: number): Frame {
    return this.sampler.frame(s);
  }
  get segmentCount(): number {
    return this.sampler.segmentCount;
  }
  vertex(i: number): number {
    return this.sampler.vertex(i);
  }
  isFree(s0: number, s1: number): boolean {
    if (!(s1 > s0)) return false;
    if (!this.closed && (s0 < -EPSILON || s1 > this.length + EPSILON)) return false;
    const shifts = this.closed ? [-this.length, 0, this.length] : [0];
    return !this.removes.some((r) => shifts.some((s) => r[0] + s < s1 && s0 < r[1] + s));
  }
}
/** Original geometry plus modifications. Laying algorithms only see this view. */
export class EffectiveGeometry {
  private readonly removed = new Set<string>();
  private readonly areas = new Map<string, { adds: Rect[]; removes: Rect[]; reserves: Rect[] }>();
  private readonly outlines = new Map<Rect, Outline>();
  private readonly spans = new Map<string, [number, number][]>();
  private readonly planes = new Map<string, Plane[]>();
  private readonly boxes = new Map<string, UprightBox[]>();
  constructor(
    readonly original: BuildingGeometry,
    modifications: readonly GeometryModification[],
    private readonly surfaces: BoundSurfaces
  ) {
    for (const modification of modifications) {
      const issue = modificationIssue(original, modification);
      if (issue) throw Error(issue);
      if (modification.op === "removeElement") this.removed.add(modification.element);
      else if (modification.op === "clip") {
        const list = this.planes.get(modification.element) ?? [];
        list.push(modification.plane);
        this.planes.set(modification.element, list);
      } else if (modification.op === "clearBox") {
        const list = this.boxes.get(modification.element) ?? [];
        list.push(modification.box);
        this.boxes.set(modification.element, list);
      } else if (modification.op === "removeSpan") {
        const list = this.spans.get(modification.element) ?? [];
        list.push([modification.span[0], modification.span[1]]);
        this.spans.set(modification.element, list);
      } else {
        const entry = this.areas.get(modification.element) ?? { adds: [], removes: [], reserves: [] };
        (modification.op === "addArea"
          ? entry.adds
          : modification.op === "reserveArea"
            ? entry.reserves
            : entry.removes
        ).push(modification.rect);
        if (modification.op === "removeArea" && modification.outline)
          this.outlines.set(modification.rect, modification.outline);
        this.areas.set(modification.element, entry);
      }
    }
  }
  ids(kind?: GeometryElement["kind"]): string[] {
    return Object.keys(this.original.elements)
      .filter((id) => {
        const element = this.original.elements[id];
        // A ribbon is laid along its line, unlike the surfaces that cover an area.
        return !this.removed.has(id) && (!kind || (element.kind === kind && !ribbonOf(element)));
      })
      .sort(compareKeys);
  }
  private element<K extends GeometryElement["kind"]>(id: string, kind: K): Extract<GeometryElement, { kind: K }> {
    const element = this.original.elements[id];
    if (!element || this.removed.has(id)) throw Error(`Unknown or removed element "${id}"`);
    if (element.kind !== kind) throw Error(`Element "${id}" is not a ${kind}`);
    return element as Extract<GeometryElement, { kind: K }>;
  }
  point(id: string): Frame {
    return this.element(id, "point").frame;
  }
  /** Planes that cut the units laid on an element, in modification order. */
  clips(id: string): readonly Plane[] {
    if (!this.original.elements[id] || this.removed.has(id)) throw Error(`Unknown or removed element "${id}"`);
    return this.planes.get(id) ?? [];
  }
  /** Boxes the units laid on an element give way in, in modification order. */
  clearings(id: string): readonly UprightBox[] {
    if (!this.original.elements[id] || this.removed.has(id)) throw Error(`Unknown or removed element "${id}"`);
    return this.boxes.get(id) ?? [];
  }
  location(id: string): SurfaceLocation | undefined {
    return this.element(id, "point").on;
  }
  /** The center line of a ribbon. */
  line(id: string): EffectiveLine {
    const params = ribbonOf(this.element(id, "surface"));
    if (!params) throw Error(`Element "${id}" is not a ribbon`);
    return new EffectiveLine(curveSampler(params), this.spans.get(id) ?? []);
  }
  /** The ids of this geometry's ribbons. */
  ribbons(): string[] {
    return this.ids().filter((id) => ribbonOf(this.original.elements[id]));
  }
  surface(id: string): EffectiveSurface {
    const data = this.element(id, "surface").surface;
    const kind = this.surfaces.get(data.kind);
    if (!kind) throw Error(`Unknown surface kind "${data.kind}"`);
    const area = this.areas.get(id) ?? { adds: [], removes: [], reserves: [] };
    // The surface's own cuts count as removed areas, before any modification.
    const cuts = kind.cuts?.(data.params) ?? [];
    const removes = cuts.length ? [...cuts, ...area.removes] : area.removes;
    return new EffectiveSurface(kind, data.params, area.adds, removes, area.reserves, this.outlines);
  }
}
