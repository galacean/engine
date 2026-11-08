// Part-type layer: prefabs that sit on a roof and carry a small roof of their own, such as
// dormers.
// - A dormer has a point "mount" on the roof surface under its plan position. It faces out of
//   the roof, level, and stands upright.
// - Its prefab names the outline of the roof it carries (`roofProfile`). The geometry sweeps
//   that outline from the dormer's front back into the host roof, until the peak meets the
//   roof: the surface "sweep" and, along the peak, the curve "ridge".
// - It attaches to the roof parts of its house. The attach rule takes the dormer's footprint
//   out of the roof part it sits on, and derives the small roof (tiles on the sweep) and its
//   ridge (caps along the peak).
import {
  add,
  cross,
  normalize,
  scale,
  sub,
  type BuildingUnit,
  type BuildingRegistry,
  type ConnectionRule,
  type EffectiveSurface,
  type Frame,
  type GeometryElement,
  type GeometryGenerator,
  type LayingAlgorithm,
  type ParticipantView,
  type Rect,
  type SurfaceKind,
  type Vec3,
  unitExtent
} from "../core";
import { mountFor, prefabFacts, prefabScale } from "./Openings";
import { registerDeckMountTypes } from "./DeckMounts";

/** Where a dormer sits: the building prefab it installs, a plan position (x, z), a height
 * above the roof's covering there, and the size of its installation. The size defaults to the
 * prefab's own. */
export interface RoofMountParams {
  readonly prefab: string;
  readonly at: readonly [number, number];
  readonly bottom: number;
  readonly width?: number;
  readonly height?: number;
}

/** A point on a surface found from its plan position: its (u, v) and frame. */
export interface PlanHit {
  readonly u: number;
  readonly v: number;
  readonly frame: Frame;
}
const PLAN_TOLERANCE = 1e-6;
/** The point of a surface whose origin lies over plan point (x, z), by Newton's method from
 * the nearest point of a coarse grid, or from `near`. Undefined when no point of the surface's
 * domain lies over it. */
export function surfaceAtPlan(
  surface: EffectiveSurface,
  x: number,
  z: number,
  near?: readonly [number, number]
): PlanHit | undefined {
  const { u: du, v: dv, closedU } = surface.domain;
  const plan = (u: number, v: number) => {
    const o = surface.frame(u, v).origin;
    return [o[0] - x, o[2] - z] as const;
  };
  let u: number, v: number;
  if (near) [u, v] = near;
  else {
    let best = Infinity;
    [u, v] = [du[0], dv[0]];
    const n = 16;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++) {
        const cu = du[0] + ((du[1] - du[0]) * i) / n,
          cv = dv[0] + ((dv[1] - dv[0]) * j) / n;
        const [ex, ez] = plan(cu, cv);
        const d = ex * ex + ez * ez;
        if (d < best) [best, u, v] = [d, cu, cv];
      }
  }
  const clampU = (t: number) => (closedU ? t : Math.min(du[1], Math.max(du[0], t)));
  const clampV = (t: number) => Math.min(dv[1], Math.max(dv[0], t));
  const h = 1e-5 * Math.max(du[1] - du[0], dv[1] - dv[0]);
  for (let step = 0; step < 40; step++) {
    const [ex, ez] = plan(u, v);
    if (Math.hypot(ex, ez) < PLAN_TOLERANCE) break;
    const pu = plan(u + h, v),
      pv = plan(u, v + h);
    const a = (pu[0] - ex) / h,
      b = (pv[0] - ex) / h,
      c = (pu[1] - ez) / h,
      d = (pv[1] - ez) / h;
    const det = a * d - b * c;
    if (!det) return;
    u = clampU(u - (d * ex - b * ez) / det);
    v = clampV(v - (a * ez - c * ex) / det);
  }
  const [ex, ez] = plan(u, v);
  if (!(Math.hypot(ex, ez) < 1e-4)) return;
  return { u, v, frame: surface.frame(u, v) };
}

/** The small roof a dormer carries: its outline (left eave → peak → right eave, in metres
 * across and up its front plane) swept back from the front plane by `depth`. Plain JSON. */
export interface DormerSweepParams {
  /** The front plane's origin: the dormer prefab's origin. */
  readonly origin: Vec3;
  /** Across the front, to the right as seen from outside. */
  readonly x: Vec3;
  /** Out of the front, level. */
  readonly z: Vec3;
  readonly outline: readonly (readonly [number, number])[];
  readonly depth: number;
}
interface OutlineSampler {
  readonly length: number;
  /** Arc length of each outline point. */
  readonly knots: readonly number[];
  /** The point at arc length s, in the front plane's (x, y). */
  at(s: number): [number, number];
}
const outlineSamplers = new WeakMap<DormerSweepParams, OutlineSampler>();
function outlineSampler(p: DormerSweepParams): OutlineSampler {
  let found = outlineSamplers.get(p);
  if (found) return found;
  const knots = [0];
  for (let i = 1; i < p.outline.length; i++)
    knots.push(knots[i - 1] + Math.hypot(p.outline[i][0] - p.outline[i - 1][0], p.outline[i][1] - p.outline[i - 1][1]));
  const length = knots[knots.length - 1];
  found = {
    length,
    knots,
    at(s) {
      const t = Math.min(length, Math.max(0, s));
      let i = 0;
      while (i < knots.length - 2 && knots[i + 1] < t) i++;
      const f = knots[i + 1] > knots[i] ? (t - knots[i]) / (knots[i + 1] - knots[i]) : 0;
      const a = p.outline[i],
        b = p.outline[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
  };
  outlineSamplers.set(p, found);
  return found;
}
const UP: Vec3 = [0, 1, 0];
function sweepPoint(p: DormerSweepParams, s: number, back: number): Vec3 {
  const [px, py] = outlineSampler(p).at(s);
  return add(add(add(p.origin, scale(p.x, px)), scale(UP, py)), scale(p.z, -back));
}
/** u along the outline by arc length (0 at the left eave), v back from the front plane in
 * metres. x follows the outline, y points back, z out of the roof. */
export const dormerSweepSurface: SurfaceKind<DormerSweepParams> = {
  domain: (p) => ({ u: [0, outlineSampler(p).length], v: [0, p.depth], closedU: false }),
  frame: (p, u, v) => {
    const sampler = outlineSampler(p);
    const h = Math.min(1e-3, sampler.length / 2);
    const a = Math.max(0, Math.min(sampler.length - h, u - h / 2));
    const x = normalize(sub(sweepPoint(p, a + h, v), sweepPoint(p, a, v)));
    const y = scale(p.z, -1);
    return { origin: sweepPoint(p, u, v), x, y, z: cross(x, y) };
  }
};

/** How far the top of a roof's covering stands above its surface, measured upright, where the
 * roof's normal is `n`. Shingles lap over each other, so the covering is one of the roof's units
 * deep along the normal. */
export const coveringRise = (roof: ParticipantView, n: Vec3) =>
  ((roof.unit && unitExtent(roof.unit)?.[2]) ?? 0) / Math.max(n[1], 1e-3);
export const slopeSurface = (host: ParticipantView): EffectiveSurface | undefined =>
  host.geometry.original.elements.slope?.kind === "surface" ? host.geometry.surface("slope") : undefined;

/** How far back from plan point `from` along level direction `back` the surface first rises
 * to height `y`, searched in steps of 5 cm up to `limit` metres and refined by bisection.
 * Undefined when the surface ends first. */
export function depthToHeight(
  surface: EffectiveSurface,
  from: Vec3,
  back: Vec3,
  y: number,
  near: readonly [number, number],
  limit = 50
): number | undefined {
  const heightAt = (d: number, guess: readonly [number, number]) => {
    const p = add(from, scale(back, d));
    return surfaceAtPlan(surface, p[0], p[2], guess) ?? surfaceAtPlan(surface, p[0], p[2]);
  };
  let guess = near,
    previous = 0;
  const step = 0.05;
  for (let d = 0; d <= limit; d += step) {
    const hit = heightAt(d, guess);
    if (!hit) return;
    if (hit.frame.origin[1] >= y) {
      let [lo, hi] = [previous, d];
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const at = heightAt(mid, guess);
        if (!at) return;
        if (at.frame.origin[1] >= y) hi = mid;
        else lo = mid;
      }
      return hi;
    }
    guess = [hit.u, hit.v];
    previous = d;
  }
}

/** The highest host roof surface under plan point `at`: the host's index, its surface, the
 * point on it, the roof's normal there, and the level frame of a prefab standing there: z out
 * of the roof, x across, to the right as seen from outside. */
export function roofUnder(hosts: readonly ParticipantView[], at: readonly [number, number]) {
  let best: { index: number; surface: EffectiveSurface; hit: PlanHit } | undefined;
  hosts.forEach((host, index) => {
    const surface = slopeSurface(host);
    if (!surface) throw Error("A roof mount attaches to roof parts");
    const hit = surfaceAtPlan(surface, at[0], at[1]);
    if (hit && (!best || hit.frame.origin[1] > best.hit.frame.origin[1])) best = { index, surface, hit };
  });
  if (!best) throw Error(`No roof at plan position ${at[0]}, ${at[1]}`);
  const found: { index: number; surface: EffectiveSurface; hit: PlanHit } = best;
  const n = found.hit.frame.z;
  const level = Math.hypot(n[0], n[2]);
  if (!(level > 1e-3)) throw Error("The roof is flat where the dormer sits");
  const z: Vec3 = [n[0] / level, 0, n[2] / level];
  const x: Vec3 = [z[2], 0, -z[0]];
  return { ...found, n, x, z };
}
/** Elements "mount", "sweep" and "ridge".
 * - The mount sits on the highest host roof under the plan position, with the prefab's lowest
 *   point `bottom` above the roof's covering, and faces level out of the roof. Like a wall mount, its origin is the center of
 *   the installation across and up, and it records the roof point under it (`on`).
 * - The sweep is the prefab's roof outline, scaled to the installation and mirrored into a
 *   whole outline, swept back from the prefab's front plane until the peak meets the roof.
 * - The ridge runs along the peak from where it meets the roof to 5 % of the sweep's depth in
 *   front of the front plane.
 * A dormer that is over no roof, faces no direction (a flat roof), crosses an edge of its
 * roof part, or reaches above its roof is an error. */
export const houseRoofMountGeometry: GeometryGenerator<RoofMountParams> = (p, { hosts, environment }) => {
  const facts = prefabFacts(environment, p.prefab);
  const half = facts.roofProfile;
  if (!half?.length) throw Error(`Building prefab "${p.prefab}" carries no roof`);
  const best = roofUnder(hosts, p.at);
  const { surface, hit, n, x, z } = best;
  const { min, max } = facts.bounds;
  const [sx, sy] = prefabScale(facts, p.width ?? max[0] - min[0], p.height ?? max[1] - min[1]);
  // The dormer stands on the roof's covering, and its lowest point, such as its sill, rests on
  // it, `bottom` above it.
  const host = hosts[best.index];
  const rise = coveringRise(host, n) - facts.bounds.min[1] * sy + p.bottom;
  const origin = add(hit.frame.origin, [0, rise, 0]);
  const center = mountFor(origin, { x, y: UP, z }, facts, sx, sy);
  const right = half.map(([px, py]) => [px * sx, py * sy] as const);
  const outline = [
    ...right
      .slice(1)
      .reverse()
      .map(([px, py]) => [-px, py] as const),
    ...right
  ];
  const peak = right[0][1];
  const back = scale(z, -1);
  const near = [hit.u, hit.v] as const;
  const depth = depthToHeight(surface, origin, back, origin[1] + peak, near);
  if (depth === undefined) throw Error("The dormer reaches above its roof");
  // The dormer stays on its roof part: every corner of its footprint lies over it.
  const width = right[right.length - 1][0];
  for (const side of [-1, 1])
    for (const d of [0, depth]) {
      const corner = add(add(origin, scale(x, side * width)), scale(back, d));
      if (!surfaceAtPlan(surface, corner[0], corner[2], near) && !surfaceAtPlan(surface, corner[0], corner[2]))
        throw Error("The dormer crosses an edge of its roof");
    }
  const sweep: DormerSweepParams = { origin, x, z, outline, depth };
  const top = add(origin, [0, peak, 0]);
  const elements: Record<string, GeometryElement> = {
    mount: {
      kind: "point",
      frame: { origin: center, x, y: UP, z },
      on: { host: best.index, element: "slope", u: hit.u, v: hit.v }
    },
    sweep: { kind: "surface", surface: { kind: "dormerSweep", params: sweep } },
    ridge: {
      kind: "curve",
      curve: { points: [add(top, scale(back, depth)), add(top, scale(z, depth * 0.05))] }
    }
  };
  return { elements };
};

const sweepOf = (part: ParticipantView): DormerSweepParams | undefined => {
  const e = part.geometry.original.elements.sweep;
  return e?.kind === "surface" && e.surface.kind === "dormerSweep"
    ? (e.surface.params as DormerSweepParams)
    : undefined;
};
const shift = (u: number, around: number, period: number) =>
  period ? u - Math.round((u - around) / period) * period : u;
/** The areas of a dormer's host surface that lie inside the dormer, in the host's (u, v):
 * one rectangle per outline point, nested like stairs. Rectangle k spans the outline's width
 * at that point and runs from the front plane back to where the host's covering, `lift` above
 * the host's surface, reaches the dormer's roof there, which rests on the outline. Further back
 * the host's covering laps over the dormer's roof, as it does on a real roof. */
function dormerFootprint(
  sweep: DormerSweepParams,
  surface: EffectiveSurface,
  near: readonly [number, number],
  lift: number
): Rect[] {
  const right = sweep.outline.slice(Math.floor(sweep.outline.length / 2));
  const back = scale(sweep.z, -1);
  const period = surface.domain.closedU ? surface.domain.u[1] - surface.domain.u[0] : 0;
  const rects: Rect[] = [];
  for (const [width, height] of right) {
    if (!(width > 0) || !(height > lift)) continue;
    const depth = depthToHeight(surface, sweep.origin, back, sweep.origin[1] + height - lift, near);
    if (depth === undefined) continue;
    // Corners: left front, left back, right front, right back.
    const corners = [-1, 1].flatMap((side) =>
      [0, depth].map((d) => {
        const at = add(add(sweep.origin, scale(sweep.x, side * width)), scale(back, d));
        const hit = surfaceAtPlan(surface, at[0], at[2], near) ?? surfaceAtPlan(surface, at[0], at[2]);
        return hit && ([shift(hit.u, near[0], period), hit.v] as const);
      })
    );
    if (corners.some((c) => !c)) continue;
    const [lf, lb, rf, rb] = corners as (readonly [number, number])[];
    // u may run either way across the dormer; keep what both the front and the back cover.
    const ascending = lf[0] < rf[0];
    const lo = ascending ? Math.max(lf[0], lb[0]) : Math.max(rf[0], rb[0]);
    const hi = ascending ? Math.min(rf[0], rb[0]) : Math.min(lf[0], lb[0]);
    const v0 = Math.max(lf[1], rf[1]),
      v1 = Math.min(lb[1], rb[1]);
    if (hi > lo && v1 > v0) rects.push([lo, v0, hi, v1]);
  }
  return rects;
}

/** The tile unit of a dormer's small roof: the host roof's tile, adapting to the rows and
 * columns of the sweep. */
export const dormerTile = (tile: BuildingUnit): BuildingUnit => ({
  ...tile,
  range: { min: [0.1, 0.2, 1], max: [2, 3, 1] }
});
/** Ridge caps of a dormer: narrow and tall against the tile; as long as the roof's caps. */
const dormerCap = (tile: BuildingUnit): BuildingUnit => ({
  ...tile,
  range: { min: [0.1, 0.5, 1], max: [1, 5.2, 2.5] }
});
/** Attach rule of a dormer on its roof: the dormer's footprint comes out of the roof part it
 * sits on, and the connection derives the dormer's small roof and its ridge, laid with the
 * host roof's tile. */
export const dormerOnRoof: ConnectionRule = ({ guest, hosts, params }) => {
  const sweep = guest && sweepOf(guest);
  const mount = guest?.geometry.original.elements.mount;
  if (!guest || !sweep || mount?.kind !== "point" || !mount.on) return {};
  const host = hosts[mount.on.host];
  const surface = host && slopeSurface(host);
  if (!surface || !host.unit) return { diagnostics: ["dormerOnRoof needs the host roof and its tile"] };
  const tile = host.unit;
  // The dormer's roof rests on its outline.
  const lift = coveringRise(host, surface.frame(mount.on.u, mount.on.v).z);
  const rects = dormerFootprint(sweep, surface, [mount.on.u, mount.on.v], lift);
  return {
    modify: rects.map((rect) => ({
      part: host.key,
      modification: { element: "slope", op: "removeArea" as const, rect }
    })),
    derive: [
      {
        localId: "roof",
        type: "dormerRoof",
        geometry: { elements: { sweep: { kind: "surface", surface: { kind: "dormerSweep", params: sweep } } } },
        algorithm: { type: "sweepTiles", params: (params.tiles as Record<string, unknown> | undefined) ?? {} },
        unit: dormerTile(tile)
      },
      {
        localId: "ridge",
        type: "dormerRidge",
        geometry: { elements: { ridge: guest.geometry.original.elements.ridge } },
        algorithm: {
          type: "capCourses",
          params: { width: 0.1, depth: 0.2, overlap: 1.2, spacing: 0.46875, jitter: 0.09375, shade: [1, 1], flag: 0 }
        },
        unit: dormerCap(tile)
      }
    ]
  };
};

interface SweepTileParams {
  /** Row spacing back along the sweep and column spacing along the outline, in metres.
   * Default: 0.3 and 0.32. */
  readonly row?: number;
  readonly column?: number;
  /** How far a tile reaches past the next column, in metres, at random between the two.
   * Default: [0.1, 0.2]. */
  readonly overlap?: readonly [number, number];
  /** How far each tile lifts its lower end, in degrees, at random between the two.
   * Default: [2, 5]. */
  readonly tilt?: readonly [number, number];
  /** Renderer flag of every tile. Default: 0. */
  readonly flag?: number;
}
interface SweepLayout {
  readonly rows: number;
  readonly columns: number;
}
const sweepParams = (context: { geometry: { original: { elements: Record<string, GeometryElement> } } }) => {
  const e = context.geometry.original.elements.sweep;
  if (e?.kind !== "surface" || e.surface.kind !== "dormerSweep") throw Error("sweepTiles lays a dormer sweep");
  return e.surface.params as DormerSweepParams;
};
/** Rows of tiles over a swept outline, from its peak down to both eaves. Each half of the
 * outline splits evenly into columns and the depth into rows; a tile rests on the outline over
 * one column of one row, reaches a little past the next column, and lifts its lower end a
 * little. */
export const sweepTiles: LayingAlgorithm<SweepTileParams, SweepLayout> = {
  info: {
    accepts: ["surface"],
    summary: "Tiles over a swept outline, from its peak down to both eaves, in rows back along the sweep.",
    params: {
      row: "Row spacing back along the sweep in metres. Default: 0.3.",
      column: "Column spacing along the outline in metres. Default: 0.32.",
      overlap: "How far a tile reaches past the next column, in metres. Default: [0.1, 0.2].",
      tilt: "How far a tile lifts its lower end, in degrees. Default: [2, 5].",
      flag: "Renderer flag of every tile. Default: 0."
    }
  },
  plan(context) {
    const p = sweepParams(context);
    const half = outlineSampler(p).length / 2;
    const rows = Math.max(1, Math.ceil(p.depth / (context.params.row ?? 0.3)) - 1);
    const columns = Math.max(1, Math.ceil(half / (context.params.column ?? 0.32)) - 1);
    return { count: 2 * rows * columns, data: { rows, columns } };
  },
  unitAt(context, d, index) {
    const p = sweepParams(context);
    const sampler = outlineSampler(p);
    const per = d.rows * d.columns;
    const side = Math.floor(index / per),
      row = Math.floor((index % per) / d.columns),
      column = index % d.columns;
    const peak = sampler.length / 2,
      step = peak / d.columns;
    const sign = side === 0 ? -1 : 1;
    const s0 = peak + sign * column * step,
      s1 = peak + sign * (column + 1) * step;
    const v = (p.depth * (row + 0.5)) / d.rows;
    const a = sweepPoint(p, s0, v),
      b = sweepPoint(p, s1, v);
    const chord = sub(b, a);
    const span = Math.hypot(...chord);
    const down = normalize(chord);
    // Out of the roof: the outline's direction of increasing u, across the sweep's back.
    const alongU = side === 0 ? scale(down, -1) : down;
    const normal = normalize(cross(alongU, scale(p.z, -1)));
    const key = `${side}/${row}/${column}`;
    const [o0, o1] = context.params.overlap ?? [0.1, 0.2];
    const reach = o0 + (o1 - o0) * context.random(key, "overlap").next();
    const [t0, t1] = context.params.tilt ?? [2, 5];
    const tilt = ((t0 + (t1 - t0) * context.random(key, "tilt").next()) * Math.PI) / 180;
    const thickness = (context.unit.scale ?? [1, 1, 1])[2];
    // The tile rests on the outline, as on the dormer's arch, and reaches down past its column.
    const origin = add(add(add(a, scale(chord, 0.5)), scale(down, reach / 2)), scale(normal, thickness / 2));
    const x = cross(down, normal);
    const [c, s] = [Math.cos(tilt), Math.sin(tilt)];
    const y = add(scale(down, c), scale(normal, s)),
      z = sub(scale(normal, c), scale(down, s));
    return {
      key,
      frame: { origin, x, y, z },
      size: [p.depth / d.rows, span + reach, thickness],
      // Tiles near the eaves come first and the peak last, as on a roof slope.
      params: {
        shade: Math.min(1, 1 - Math.abs((s0 + s1) / 2 - peak) / peak + 0.2 * context.random(key, "shade").next()),
        flag: context.params.flag ?? 0,
        uv: [(s0 + s1) / 2, v]
      }
    };
  }
};

/** Part types of prefabs that sit on roofs: dormers and shed dormers on slopes and cones,
 * hatches and lamps on flat roof decks. */
export const ROOF_MOUNTS = ["dormer", "shedDormer", "hatch", "roofLamp"] as const;

/** Registers the roof mount part types into a registry. */
export function registerDormerTypes(registry: BuildingRegistry): BuildingRegistry {
  registry.surfaces.register("dormerSweep", dormerSweepSurface);
  registry.geometry.register("houseRoofMount", houseRoofMountGeometry);
  registry.algorithms.register("sweepTiles", sweepTiles);
  registry.rules.register("dormerOnRoof", dormerOnRoof);
  for (let n = 1; n <= 4; n++)
    registry.defaults.attach(
      "dormer",
      Array.from({ length: n }, () => "roof"),
      "dormerOnRoof"
    );
  return registerDeckMountTypes(registry);
}
