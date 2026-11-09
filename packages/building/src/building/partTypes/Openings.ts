// Part-type layer: prefabs mounted on house walls, such as windows, doors and wall lamps.
// - A mounted part has a point "mount" on its wall. A member that bends along the wall has a
//   ribbon "follow0", "follow1", ...: the wall line under it.
// - It attaches to the house walls; the attach rule removes what the part occupies from the wall
//   it sits on. A finish continues the wall faces, so it loses the opening too.
// - An opening also cuts floor bands that cross it, through a join between the two parts.
import {
  joinPairKey,
  type BuildingEnvironment,
  type LayingAlgorithm,
  type BuildingRegistry,
  type ConnectionRule,
  type GeometryElement,
  type GeometryGenerator,
  type JoinDetector,
  type OccupancySolid,
  type OccupiedUnit,
  type ParticipantView,
  type Rect,
  type SurfaceKind,
  type Vec3,
  ribbon,
  ribbonOf
} from "../core";
import { wallChartCorners, wallChartSampler, type WallChartParams } from "./House";

/** Where a mounted part sits: the building prefab it installs, a fraction of the perimeter,
 * a height above the wall's base at that point, and the size of its installation. */
export interface WallMountParams {
  readonly prefab: string;
  readonly u: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}
/** What the asset layer measured about a building prefab (`{ prefab: key }`): its bounds, the
 * space it occupies, the members that bend along the wall, and the right half of the small roof
 * it carries out of a roof. */
export interface PrefabFacts {
  readonly bounds: { readonly min: readonly number[]; readonly max: readonly number[] };
  readonly occupancy: readonly OccupancySolid[];
  readonly units: readonly { readonly matrix: readonly number[]; readonly span?: readonly [number, number] }[];
  readonly roofProfile?: readonly (readonly [number, number])[];
  /** How far in front of the wall an eave dormer's arch starts, on a straight and a curved wall. */
  readonly eaveOut?: number;
  readonly eaveOutCurved?: number;
  /** The height of the stone threshold laid under a door that stands on the ground. */
  readonly threshold?: number;
}
export function prefabFacts(environment: BuildingEnvironment, prefab: string): PrefabFacts {
  const facts = environment.asset?.({ prefab }) as unknown as PrefabFacts | undefined;
  if (!facts?.bounds) throw Error(`The asset layer has no building prefab "${prefab}"`);
  return facts;
}
/** How a prefab scales to an installation of width × height: across and up to the size, in
 * depth by the smaller of the two. */
export function prefabScale(facts: PrefabFacts, width: number, height: number): [number, number, number] {
  const { min, max } = facts.bounds;
  const sx = width / (max[0] - min[0]),
    sy = height / (max[1] - min[1]);
  return [sx, sy, Math.min(sx, sy)];
}
/** An opening in a wall: the host's index among the part's hosts, the area in that wall's
 * chart, and the same area along the house perimeter. Plain JSON. */
export interface WallOpeningParams {
  readonly host: number;
  readonly rect: Rect;
  readonly perimeter: Rect;
  readonly origin: Vec3;
  readonly x: Vec3;
}
/** A rectangle in the wall plane: u along the wall, v up. */
export const wallOpeningSurface: SurfaceKind<WallOpeningParams> = {
  domain: (p) => ({ u: [0, p.rect[2] - p.rect[0]], v: [0, p.rect[3] - p.rect[1]], closedU: false }),
  frame: (p, u, v) => ({
    origin: [p.origin[0] + p.x[0] * u, p.origin[1] + v, p.origin[2] + p.x[2] * u],
    x: [...p.x],
    y: [0, 1, 0],
    z: [-p.x[2], 0, p.x[0]]
  })
};

const chartOf = (part: ParticipantView): WallChartParams | undefined => {
  const face = part.geometry.original.elements.face;
  return face?.kind === "surface" && face.surface.kind === "wallChart"
    ? (face.surface.params as WallChartParams)
    : undefined;
};
const chartLength = (chart: WallChartParams) => wallChartSampler(chart).length;

/** A door stands on the ground, and gets its threshold, up to this height above it, in metres. */
const THRESHOLD_ON_GROUND = 0.05;
/** Depth of a threshold through the reference wall, in metres; it grows with the wall. */
const THRESHOLD_DEPTH = 0.76;
/** How far a threshold reaches past its opening on each side, in metres at the prefab's size. */
const THRESHOLD_OVERHANG = 0.08;
/** Elements "mount" and "follow<i>", and "sill" for a door with a threshold. The mount sits on
 * the wall at the middle of the chord the installation spans, at the installation's center
 * height; it faces out of the wall. Each prefab member that bends along the wall gets the wall
 * line under its span, sampled at most 0.1 m apart. The sill is the top of the door's threshold
 * under its middle; a door stands on the ground to have one. */
export const houseWallMountGeometry: GeometryGenerator<WallMountParams> = (p, { hosts, environment }) => {
  const facts = prefabFacts(environment, p.prefab);
  const walls = hosts.map((host, index) => ({ index, chart: chartOf(host) }));
  if (walls.some((w) => !w.chart)) throw Error("A wall mount attaches to house walls");
  const perimeter = walls.reduce((n, w) => Math.max(n, (w.chart!.uOffset ?? 0) + chartLength(w.chart!)), 0);
  const u = (((p.u % 1) + 1) % 1) * perimeter;
  const host = walls.find((w) => u >= (w.chart!.uOffset ?? 0) && u <= (w.chart!.uOffset ?? 0) + chartLength(w.chart!));
  if (!host) throw Error(`No wall at perimeter position ${p.u}`);
  const chart = host.chart!,
    offset = chart.uOffset ?? 0,
    s = u - offset;
  const sample = wallChartSampler(chart);
  // A wall around the whole house wraps around; one side of a house ends at its corners, and
  // nothing mounted on it may cross them.
  const along = (v: number) => {
    if (chart.closed) return sample.at(((v % sample.length) + sample.length) % sample.length);
    if (v < -1e-6 || v > sample.length + 1e-6) throw Error("The installation crosses a corner of its wall");
    return sample.at(Math.min(sample.length, Math.max(0, v)));
  };
  // Prefabs are authored against the reference wall: on a thicker wall they stand further out.
  const push = chart.mountOffset ?? 0;
  const pushed = (at: ReturnType<typeof along>) => ({
    ...at,
    x: at.x - at.tangent[1] * push,
    z: at.z + at.tangent[0] * push
  });
  const a = pushed(along(s - p.width / 2)),
    b = pushed(along(s + p.width / 2));
  const chord = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const x: Vec3 = [(b.x - a.x) / chord, 0, (b.z - a.z) / chord];
  const center = sample.at(s).ground + p.bottom + p.height / 2;
  const origin: Vec3 = [(a.x + b.x) / 2, center, (a.z + b.z) / 2];
  const [sx, sy] = prefabScale(facts, p.width, p.height);
  const cx = (facts.bounds.min[0] + facts.bounds.max[0]) / 2,
    cy = (facts.bounds.min[1] + facts.bounds.max[1]) / 2;
  const follows = facts.units.flatMap((m) =>
    m.span ? [{ from: (m.span[0] - cx) * sx, to: (m.span[1] - cx) * sx, height: (m.matrix[13] - cy) * sy }] : []
  );
  const elements: Record<string, import("../core").GeometryElement> = {
    mount: {
      kind: "point",
      frame: { origin, x, y: [0, 1, 0], z: [-x[2], 0, x[0]] },
      on: { host: host.index, element: "face", u: s, v: center }
    }
  };
  if (facts.threshold && p.bottom <= THRESHOLD_ON_GROUND) {
    const at = sample.at(s);
    elements.sill = {
      kind: "point",
      frame: { origin: [at.x, at.ground + facts.threshold * sy, at.z], x, y: [0, 1, 0], z: [-x[2], 0, x[0]] },
      on: { host: host.index, element: "face", u: s, v: at.ground }
    };
  }
  follows.forEach((follow, i) => {
    const steps = Math.max(2, Math.ceil((follow.to - follow.from) / 0.1));
    const points = Array.from({ length: steps + 1 }, (_, k): Vec3 => {
      const at = pushed(along(s + follow.from + ((follow.to - follow.from) * k) / steps));
      return [at.x, center + follow.height, at.z];
    });
    elements[`follow${i}`] = ribbon({ points });
  });
  return { elements };
};

/** Parameters of a mounted corner window: its prefab, the perimeter fraction of the corner, a
 * height above the wall's base and its installation size. */
export interface CornerMountParams {
  readonly prefab: string;
  readonly u: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}
const CORNER_COS = Math.cos(Math.PI / 6);
/** How close to either side of `u` the two walls of a corner are sampled, in metres. */
const CORNER_PROBE = 0.002;
/** How far a corner window's position may lie from the corner it means, in metres. */
const CORNER_SNAP = 0.01;
/** Elements "mount" and "corner" of a window that spans a wall corner. The prefab's origin
 * stands on the corner, and the window faces out along the corner's bisector. `u` must lie within
 * 1 cm of a corner; a round wall has none. */
export const houseCornerMountGeometry: GeometryGenerator<CornerMountParams> = (p, { hosts, environment }) => {
  const facts = prefabFacts(environment, p.prefab);
  const walls = hosts.map((host, index) => ({ index, chart: chartOf(host)! }));
  if (walls.some((w) => !w.chart)) throw Error("A corner window attaches to house walls");
  const offsetOf = (w: (typeof walls)[number]) => w.chart.uOffset ?? 0;
  const perimeter = walls.reduce((n, w) => Math.max(n, offsetOf(w) + chartLength(w.chart)), 0);
  const wrap = (u: number) => ((u % perimeter) + perimeter) % perimeter;
  // A position within 1 cm of a corner means that corner, however it was rounded or edited.
  const asked = wrap(p.u * perimeter);
  const away = (c: number) => Math.min(Math.abs(c - asked), perimeter - Math.abs(c - asked));
  const corners = walls.flatMap((w) => wallChartCorners(w.chart));
  const at = corners.reduce<number | undefined>(
    (best, c) => (best === undefined || away(c) < away(best) ? c : best),
    undefined
  );
  if (at === undefined || away(at) > CORNER_SNAP)
    throw Error(
      `A corner window needs a corner of its wall (${
        corners.length
          ? `corners at u = ${corners.map((c) => (c / perimeter).toFixed(4)).join(", ")}`
          : "this wall has none"
      }; received ${p.u})`
    );
  const sampleAt = (u: number) => {
    const v = wrap(u);
    const w = walls.find((q) => v >= offsetOf(q) && v <= offsetOf(q) + chartLength(q.chart))!;
    return { ...wallChartSampler(w.chart).at(v - offsetOf(w)), chart: w.chart };
  };
  const before = sampleAt(at - CORNER_PROBE).tangent,
    after = sampleAt(at + CORNER_PROBE).tangent;
  const here = sampleAt(at + CORNER_PROBE);
  const corner = [here.x - here.tangent[0] * CORNER_PROBE, here.z - here.tangent[1] * CORNER_PROBE];
  // Out of the corner: away from both walls that meet there.
  const nx = before[0] - after[0],
    nz = before[1] - after[1],
    length = Math.hypot(nx, nz) || 1;
  const z: Vec3 = [nx / length, 0, nz / length],
    x: Vec3 = [z[2], 0, -z[0]],
    y: Vec3 = [0, 1, 0];
  const { min, max } = facts.bounds;
  const [sx, sy] = prefabScale(facts, p.width, p.height);
  // Both walls run straight for as far as the window reaches along them.
  const reach = (t: readonly number[]) =>
    Math.max(
      ...facts.occupancy.flatMap((s) =>
        s.hull.map(([px, pz]) => (x[0] * px + z[0] * pz) * sx * t[0] + (x[2] * px + z[2] * pz) * sx * t[1])
      )
    );
  const need = Math.max(reach(after), reach([-before[0], -before[1]])) + 0.04;
  for (let d = CORNER_PROBE; d < need + 0.05; d += 0.05)
    for (const [side, edge] of [
      [-1, before],
      [1, after]
    ] as const) {
      const t = sampleAt(at + side * Math.min(d, need)).tangent;
      if (t[0] * edge[0] + t[1] * edge[1] < CORNER_COS)
        throw Error(`The corner window needs ${need.toFixed(2)} m of wall on both sides of its corner`);
    }
  const ground = sampleAt(at + CORNER_PROBE).ground;
  const pivotY = ground + p.bottom - min[1] * sy;
  const top = pivotY + max[1] * sy;
  if (top > Math.min(sampleAt(at - CORNER_PROBE).roof, here.roof) + 0.02)
    throw Error("The corner window reaches above its walls");
  // On a thicker wall both faces move out, and the corner with them.
  const push = here.chart.mountOffset ?? 0;
  const [n0, n1] = [
    [-before[1], before[0]],
    [-after[1], after[0]]
  ];
  const miter = push / (1 + n0[0] * n1[0] + n0[1] * n1[1]);
  const origin: Vec3 = [corner[0] + (n0[0] + n1[0]) * miter, pivotY, corner[1] + (n0[1] + n1[1]) * miter];
  const host = walls.find(
    (w) => wrap(at + CORNER_PROBE) - offsetOf(w) >= 0 && wrap(at + CORNER_PROBE) - offsetOf(w) <= chartLength(w.chart)
  )!;
  const elements: Record<string, import("../core").GeometryElement> = {
    mount: {
      kind: "point",
      frame: { origin, x, y, z },
      on: { host: host.index, element: "face", u: at, v: pivotY }
    }
  };
  // Standing on a corner, the part opens both of the walls that meet there.
  elements.corner = { kind: "point", frame: { origin, x, y, z } };
  return { elements };
};

/** How far a member must reach behind a wall's outer face to count as passing into it, in
 * metres. A lamp's bracket that rests on the face does not. */
const PENETRATION = 0.05;
/** How far a row of an opening may pass a cover's edge, in metres. */
const ROW_FIT = 0.02;
interface SolidSection {
  readonly y0: number;
  readonly y1: number;
  readonly u0: number;
  readonly u1: number;
  readonly cover: boolean;
}
/** The straight pieces of a wall chart with the chart's u at their start. */
function chartPieces(chart: WallChartParams) {
  const points = chart.points.map((q) => [q[0], q[2]]);
  const [first, last] = [points[0], points[points.length - 1]];
  if (chart.closed && Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-4) points.push(first);
  let u = 0;
  return points.slice(1).map((b, i) => {
    const a = points[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const piece = { a, tx: (b[0] - a[0]) / length, tz: (b[1] - a[1]) / length, length, u };
    u += length;
    return piece;
  });
}
/** A convex polygon of (s, d) points cut to the part where `keep` is not negative. */
function clipPolygon(polygon: number[][], keep: (p: number[]) => number): number[][] {
  const out: number[][] = [];
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    const [a, b] = [keep(p), keep(q)];
    if (a >= 0) out.push(p);
    if (a >= 0 !== b >= 0) {
      const t = a / (a - b);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  });
  return out;
}
/** Where the occupied space passes through a wall, as rectangles of the wall's chart. What passes
 * into the wall must be open. A row may be wider than that at some heights, so that an arch needs
 * only a few rows, as long as a cover hides the row's corners there. */
export function occupiedRows(occupied: readonly OccupiedUnit[], chart: WallChartParams): Rect[] {
  const pieces = chartPieces(chart),
    length = pieces.reduce((n, p) => n + p.length, 0),
    half = chart.nominalOuter;
  const sections: SolidSection[] = [];
  for (const { matrix: m, solids } of occupied)
    for (const solid of solids) {
      const middle = (solid.y[0] + solid.y[1]) / 2;
      const plan = solid.hull.map(([x, z]) => [
        m[0] * x + m[4] * middle + m[8] * z + m[12],
        m[2] * x + m[6] * middle + m[10] * z + m[14]
      ]);
      const spans: [number, number][] = [];
      for (const piece of pieces) {
        let polygon = plan.map(([x, z]) => {
          const [dx, dz] = [x - piece.a[0], z - piece.a[1]];
          // The chart's outward normal is (-tz, tx).
          return [dx * piece.tx + dz * piece.tz, -dx * piece.tz + dz * piece.tx];
        });
        for (const keep of [
          (p: number[]) => p[0],
          (p: number[]) => piece.length - p[0],
          (p: number[]) => p[1] + half,
          (p: number[]) => half - PENETRATION - p[1]
        ]) {
          polygon = clipPolygon(polygon, keep);
          if (polygon.length < 3) break;
        }
        if (polygon.length < 3) continue;
        const along = polygon.map((p) => p[0]);
        spans.push([piece.u + Math.min(...along), piece.u + Math.max(...along)]);
      }
      if (!spans.length) continue;
      let u0 = Math.min(...spans.map((s) => s[0])),
        u1 = Math.max(...spans.map((s) => s[1]));
      // Across the seam of a closed wall the span continues past its end.
      if (chart.closed && u1 - u0 > length / 2) {
        const shifted = spans.map(([a, b]): [number, number] => (a < length / 2 ? [a + length, b + length] : [a, b]));
        u0 = Math.min(...shifted.map((s) => s[0]));
        u1 = Math.max(...shifted.map((s) => s[1]));
      }
      if (!(u1 - u0 > 1e-4)) continue;
      const height = (y: number) => m[1] * 0 + m[5] * y + m[13];
      sections.push({ y0: height(solid.y[0]), y1: height(solid.y[1]), u0, u1, cover: solid.cover === true });
    }
  const through = sections.filter((s) => !s.cover);
  const heights = [...new Set(through.flatMap((s) => [s.y0, s.y1]))].sort((a, b) => a - b);
  const rows: { y0: number; y1: number; u0: number; u1: number; limit0: number; limit1: number }[] = [];
  for (let i = 0; i + 1 < heights.length; i++) {
    const [y0, y1] = [heights[i], heights[i + 1]],
      y = (y0 + y1) / 2;
    const inside = (s: SolidSection) => s.y0 <= y && y <= s.y1;
    const passing = through.filter(inside);
    if (!passing.length) continue;
    const all = sections.filter(inside);
    const band = {
      y0,
      y1,
      u0: Math.min(...passing.map((s) => s.u0)),
      u1: Math.max(...passing.map((s) => s.u1)),
      limit0: Math.min(...all.map((s) => s.u0)),
      limit1: Math.max(...all.map((s) => s.u1))
    };
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y1 - y0) < 1e-6) {
      const merged = {
        y0: last.y0,
        y1,
        u0: Math.min(last.u0, band.u0),
        u1: Math.max(last.u1, band.u1),
        limit0: Math.max(last.limit0, band.limit0),
        limit1: Math.min(last.limit1, band.limit1)
      };
      if (merged.u0 >= merged.limit0 - ROW_FIT && merged.u1 <= merged.limit1 + ROW_FIT) {
        rows[rows.length - 1] = merged;
        continue;
      }
    }
    rows.push(band);
  }
  return rows.map((r): Rect => [r.u0, r.y0, r.u1, r.y1]);
}
/** What a mounted part opens in its hosts: on the wall it stands on, or on both walls of a corner
 * it stands on. A part made of laid stones, such as an arch, declares its openings itself. */
export function openingsOf(guest: ParticipantView, hosts: readonly ParticipantView[]) {
  if (!guest.occupied.length)
    return wallOpeningsOf(guest).map(({ host, rect, perimeter }) => ({ host, rect, perimeter }));
  const { mount, corner } = guest.geometry.original.elements;
  const stands = corner ? hosts.map((_, i) => i) : mount?.kind === "point" && mount.on ? [mount.on.host] : [];
  return stands.flatMap((host) => {
    const chart = hosts[host] && chartOf(hosts[host]);
    if (!chart) return [];
    const offset = chart.uOffset ?? 0;
    return occupiedRows(guest.occupied, chart).map((rect) => ({
      host,
      rect,
      perimeter: [rect[0] + offset, rect[1], rect[2] + offset, rect[3]] as Rect
    }));
  });
}
/** The heights an opening of a part crosses, for finding the bands it meets. */
function openedHeights(part: ParticipantView): (readonly [number, number])[] {
  if (!part.occupied.length) return wallOpeningsOf(part).map((o) => [o.perimeter[1], o.perimeter[3]]);
  return part.occupied.flatMap(({ matrix: m, solids }) =>
    solids.filter((s) => !s.cover).map((s): [number, number] => [m[5] * s.y[0] + m[13], m[5] * s.y[1] + m[13]])
  );
}
const opens = (part: ParticipantView) => part.occupied.length > 0 || wallOpeningsOf(part).length > 0;
/** The opening rectangles of a mounted part. */
export const wallOpeningsOf = (part: ParticipantView): WallOpeningParams[] =>
  Object.values(part.geometry.original.elements).flatMap((e) =>
    e.kind === "surface" && e.surface.kind === "wallOpening" ? [e.surface.params as WallOpeningParams] : []
  );
/** Attach rule of a mounted part: its opening comes out of the wall it sits on. An opening
 * must stay inside its wall. */
export const wallOpening: ConnectionRule = ({ guest, hosts }) => {
  const openings = guest ? openingsOf(guest, hosts) : [];
  if (!guest || !openings.length) return {};
  const modify = [];
  const threshold = thresholdOf(guest, openings[0], hosts[openings[0].host]);
  const derive = threshold ? [threshold] : [];
  for (const o of openings) {
    const wall = hosts[o.host];
    const chart = wall && chartOf(wall);
    if (!chart) return { diagnostics: ["wallOpening needs the host wall's chart"] };
    if (!chart.closed && (o.rect[0] < -1e-6 || o.rect[2] > chartLength(chart) + 1e-6))
      return { diagnostics: [`${guest.key} crosses the end of its wall`] };
    modify.push({ part: wall.key, modification: { element: "face", op: "removeArea" as const, rect: o.rect } });
  }
  return { modify, ...(derive.length && { derive }) };
};

/** The threshold a masonry wall carries under a door, in its own stone: along the wall under the
 * door's lowest opening and a little past it, as far as the wall goes, level at the height of the
 * door's sill above the highest ground it crosses. */
function thresholdOf(
  guest: ParticipantView,
  opening: { readonly rect: Rect; readonly perimeter: Rect },
  wall: ParticipantView
) {
  const sill = guest.geometry.original.elements.sill;
  const chart = chartOf(wall);
  if (sill?.kind !== "point" || !sill.on || !chart || wall.unit?.source !== "brick") return undefined;
  const sample = wallChartSampler(chart);
  const along = (v: number) => sample.at(chart.closed ? ((v % sample.length) + sample.length) % sample.length : v);
  const m = guest.occupied[0].matrix;
  const over = THRESHOLD_OVERHANG * Math.hypot(m[0], m[1], m[2]);
  const [from, , to] = opening.rect;
  const lo = chart.closed ? from - over : Math.max(0, from - over),
    hi = chart.closed ? to + over : Math.min(sample.length, to + over);
  const steps = Math.max(2, Math.ceil((hi - lo) / 0.25));
  const points = Array.from({ length: steps + 1 }, (_, k): Vec3 => {
    const at = along(lo + ((hi - lo) * k) / steps);
    return [at.x, at.ground, at.z];
  });
  const level = Math.max(...points.map((q) => q[1])) + sill.frame.origin[1] - sample.at(sill.on.u).ground;
  return {
    localId: "threshold",
    type: "threshold",
    geometry: {
      elements: { step: ribbon({ points, offsets: points.map((q): Vec3 => [0, level - q[1], 0]) }) }
    },
    algorithm: {
      type: "thresholdStones",
      params: {
        wallU: [opening.perimeter[0], opening.perimeter[2]],
        depth: THRESHOLD_DEPTH * (chart.depthScale ?? 1)
      }
    },
    unit: { ...wall.unit, range: { min: [0.05, 0.05, 0.1] as Vec3, max: [10, 10, 10] as Vec3 } }
  };
}

interface ThresholdParams {
  /** Where the threshold lies along the house perimeter, in metres. */
  readonly wallU: readonly [number, number];
  /** Depth through the wall, in metres. Default: 0.76, wider than the reference wall's bricks. */
  readonly depth?: number;
}
/** The stones of a door's threshold: about 0.7 m each along the ground line of the ribbon "step",
 * up to the top of the ribbon. */
export const thresholdStones: LayingAlgorithm<ThresholdParams, { count: number }> = {
  info: {
    accepts: ["ribbon"],
    summary: "A door's threshold: a row of low stones along a ribbon on the ground.",
    params: {
      wallU: "Where the threshold lies along the house perimeter, in metres.",
      depth: "Depth through the wall, in metres. Default: 0.76."
    }
  },
  plan(context) {
    const { points } = stepOf(context.geometry.original.elements.step);
    const length = points.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - points[i][0], q[2] - points[i][2]), 0);
    const count = Math.max(1, Math.round(length / 0.7));
    return { count, data: { count } };
  },
  unitAt(context, { count }, index) {
    const { points, top } = stepOf(context.geometry.original.elements.step);
    const joint = (i: number) =>
      i === 0 || i === count ? i / count : (i + (context.random(`joint/${i}`, "joint").next() - 0.5) * 0.3) / count;
    const a = pointAlong(points, joint(index)),
      b = pointAlong(points, joint(index + 1));
    const y0 = (a[1] + b[1]) / 2;
    const l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    const x: Vec3 = [(b[0] - a[0]) / l, 0, (b[2] - a[2]) / l];
    const [u0, u1] = context.params.wallU;
    return {
      key: `${index}`,
      frame: {
        origin: [(a[0] + b[0]) / 2, (y0 + top) / 2, (a[2] + b[2]) / 2],
        x,
        y: [0, 1, 0],
        z: [-x[2], 0, x[0]]
      },
      size: [l, top - y0, context.params.depth ?? THRESHOLD_DEPTH],
      params: {
        deformation: [a[1] - y0, b[1] - y0, 0, 0],
        flags: 0,
        wallU: [u0 + (u1 - u0) * joint(index), u0 + (u1 - u0) * joint(index + 1)]
      }
    };
  }
};
function stepOf(element: GeometryElement | undefined) {
  const params = ribbonOf(element);
  if (!params?.offsets) throw Error("thresholdStones lays a ribbon");
  return { points: params.points as readonly Vec3[], top: params.points[0][1] + params.offsets[0][1] };
}
/** The point a fraction of the way along a polyline, by its plan length. */
function pointAlong(points: readonly Vec3[], t: number): Vec3 {
  const lengths = points.slice(1).map((q, i) => Math.hypot(q[0] - points[i][0], q[2] - points[i][2]));
  let rest = t * lengths.reduce((n, l) => n + l, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (rest <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] > 0 ? rest / lengths[i] : 0;
      return [0, 1, 2].map((k) => points[i][k] + (points[i + 1][k] - points[i][k]) * f) as unknown as Vec3;
    }
    rest -= lengths[i];
  }
  return points[points.length - 1];
}

/** Band elements of a floor band part with their charts. */
const bandsOf = (part: ParticipantView) =>
  Object.entries(part.geometry.original.elements).flatMap(([id, e]) =>
    e.kind === "surface" && e.surface.kind === "wallChart" ? [{ id, chart: e.surface.params as WallChartParams }] : []
  );
const crosses = (low: number, high: number, band: WallChartParams) => low < band.topY && band.minGround < high;
/** An opening meets a floor band when it crosses one of the band's levels. */
export const openingMeetsBand: JoinDetector = (a, b) => {
  const [mounted, band] = opens(a) ? [a, b] : [b, a];
  return openedHeights(mounted).some(([low, high]) => bandsOf(band).some((b) => crosses(low, high, b.chart)));
};
/** Peer rule between an opening and a floor band: the band gives way to the opening on every
 * level the opening crosses. Band charts run along the house perimeter. */
export const openingCutsBand: ConnectionRule = ({ parts }) => {
  const mounted = parts.find(opens),
    band = parts.find((p) => !opens(p));
  if (!mounted || !band) return {};
  return {
    modify: bandsOf(band).flatMap((b) =>
      (mounted.occupied.length
        ? occupiedRows(mounted.occupied, b.chart)
        : wallOpeningsOf(mounted).map((o) => o.perimeter)
      )
        .filter((rect) => crosses(rect[1], rect[3], b.chart))
        .map((rect) => ({ part: band.key, modification: { element: b.id, op: "removeArea" as const, rect } }))
    )
  };
};

/** Whether (x, z) lies inside a closed polygon of (x, y, z) points. */
function insideOutline(points: readonly (readonly number[])[], x: number, z: number) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j],
      b = points[i];
    if (a[2] > z !== b[2] > z && x < ((b[0] - a[0]) * (z - a[2])) / (b[2] - a[2]) + a[0]) result = !result;
  }
  return result;
}
const outlineOf = (wall: ParticipantView) => {
  return ribbonOf(wall.geometry.original.elements.outline)?.points;
};
const mountPoint = (part: ParticipantView) => {
  const e = part.geometry.original.elements.mount;
  return e?.kind === "point" ? e.frame.origin : undefined;
};
/** A mounted part of one house is hidden by another house when its mount lies inside that
 * house's outer face. Of that house's walls, the one nearest to the mount answers. */
export const mountInsideHouse: JoinDetector = (a, b) => {
  const [mount, wall] = mountPoint(a) ? [a, b] : [b, a];
  const point = mountPoint(mount),
    outline = outlineOf(wall),
    chart = chartOf(wall);
  if (!point || !outline || !chart || mount.group === wall.group) return false;
  // The outer face: the wall line pushed out by the wall's outer offset.
  const n = outline.length;
  const face = outline.map((p, i) => {
    const prev = outline[(i - 1 + n) % n],
      next = outline[(i + 1) % n];
    const tx = next[0] - prev[0],
      tz = next[2] - prev[2],
      l = Math.hypot(tx, tz) || 1;
    return [p[0] - (tz / l) * chart.nominalOuter, p[1], p[2] + (tx / l) * chart.nominalOuter];
  });
  if (!insideOutline(face, point[0], point[2])) return false;
  const distance = (p: readonly number[], q: readonly number[]) => {
    const dx = q[0] - p[0],
      dz = q[2] - p[2],
      l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((point[0] - p[0]) * dx + (point[2] - p[2]) * dz) / l2)) : 0;
    return Math.hypot(point[0] - p[0] - dx * t, point[2] - p[2] - dz * t);
  };
  let best = Infinity,
    nearest = 0;
  for (let i = 0; i < n; i++) {
    const d = distance(outline[i], outline[(i + 1) % n]);
    if (d < best) [best, nearest] = [d, i];
  }
  // The nearest edge belongs to this wall when both its ends are among the wall's points.
  const own = (p: readonly number[]) => chart.points.some((q) => Math.hypot(q[0] - p[0], q[2] - p[2]) < 1e-6);
  return own(outline[nearest]) && own(outline[(nearest + 1) % n]);
};
/** Peer rule between a mounted part and a wall of another house that hides it: the part
 * lays nothing, and a diagnostic says why. The opening stays: it lies inside the other house. */
export const mountHidden: ConnectionRule = ({ parts }) => {
  const mount = parts.find((p) => mountPoint(p))!;
  return {
    modify: [{ part: mount.key, modification: { element: "mount", op: "removeElement" } }],
    diagnostics: [`${mount.key} is inside another house`]
  };
};

/** The mount points of a part, in order: "mount", then "mount1", "mount2", ... */
const mountsOf = (ids: readonly string[]) =>
  ids.filter((id) => /^mount\d*$/.test(id)).sort((a, b) => Number(a.slice(5) || 0) - Number(b.slice(5) || 0));
interface MountPrefabParams {
  /** Installation size in metres. Default: the prefab's own. */
  readonly width?: number;
  readonly height?: number;
  /** The prefabs stand in a row of `count`, `spacing` apart at their own size, and `width` is
   * the whole row's: each prefab scales by width / (its width + (count - 1) * spacing). */
  readonly row?: { readonly count: number; readonly spacing: number };
  /** Renderer values carried on the laid unit. */
  readonly unitParams?: Readonly<Record<string, unknown>>;
  /** Scale depth with the width, as for a window that spans a corner. Default: the smaller of
   * width and height. */
  readonly evenPlan?: boolean;
  /** Which point of the prefab stands on the mount. "center": the center of its bounds across
   * and up, on its back at its own size. "origin": its origin, also after scaling. Default:
   * "center". */
  readonly anchor?: "center" | "origin";
}
/** Lays a part's building prefab at each of its mounts ("mount", "mount1", "mount2", ...),
 * scaled to the installation size. With the "center" anchor the center of the prefab's bounds
 * lies on the mount across and up, and it is resized about its back, which stays where the
 * unscaled prefab's back would be, so a wall prefab keeps its distance from the wall at every
 * size. With the "origin" anchor the prefab's origin stays on the mount. The unit's pivot must
 * be the middle of the back: [0.5, 0.5, 0]. */
export const mountPrefab: LayingAlgorithm<MountPrefabParams, null> = {
  info: {
    accepts: ["point"],
    summary: 'One building prefab at each point "mount", "mount1", ..., scaled to the installation size.',
    params: {
      width: "Installation width in metres. Default: the prefab's own.",
      height: "Installation height in metres. Default: the prefab's own.",
      unitParams: "Values the renderer reads from the laid unit.",
      row: "The prefabs stand in a row { count, spacing }; width is the whole row's. Default: one prefab.",
      anchor: 'What stands on the mount: "center" of the bounds or the prefab\'s "origin". Default: "center".'
    }
  },
  // A rule may remove the mount, as when another house hides it: nothing is laid then.
  plan: (context) => ({ count: mountsOf(context.geometry.ids("point")).length, data: null }),
  unitAt(context, _data, index) {
    const bounds = context.unit.bounds;
    if (!bounds) throw Error("mountPrefab needs the prefab's bounds");
    const own = bounds.max[0] - bounds.min[0],
      row = context.params.row,
      natural = own + (row ? (row.count - 1) * row.spacing : 0);
    const width = ((context.params.width ?? natural) / natural) * own,
      height = context.params.height ?? bounds.max[1] - bounds.min[1];
    const sx = width / (bounds.max[0] - bounds.min[0]),
      sy = height / (bounds.max[1] - bounds.min[1]),
      sz = context.params.evenPlan ? sx : Math.min(sx, sy);
    const frame = context.geometry.point(mountsOf(context.geometry.ids("point"))[index]);
    const back = bounds.min[2];
    const offset =
      context.params.anchor === "origin"
        ? [((bounds.min[0] + bounds.max[0]) / 2) * sx, ((bounds.min[1] + bounds.max[1]) / 2) * sy, back * sz]
        : [0, 0, back];
    const at = [0, 1, 2].map(
      (k) => frame.origin[k] + frame.x[k] * offset[0] + frame.y[k] * offset[1] + frame.z[k] * offset[2]
    ) as unknown as Vec3;
    return {
      key: `${index}`,
      frame: { ...frame, origin: at },
      size: [width, height, (bounds.max[2] - bounds.min[2]) * sz],
      ...(context.params.unitParams && { params: { ...context.params.unitParams } })
    };
  }
};

/** Part types of prefabs mounted on house walls. */
export const WALL_MOUNTS = ["window", "door", "lamp"] as const;

/** Registers the wall mount part types into a registry. */
export function registerOpeningTypes(registry: BuildingRegistry): BuildingRegistry {
  registry.surfaces.register("wallOpening", wallOpeningSurface);
  registry.geometry.register("houseWallMount", houseWallMountGeometry);
  registry.geometry.register("houseCornerMount", houseCornerMountGeometry);
  registry.algorithms.register("mountPrefab", mountPrefab);
  registry.algorithms.register("thresholdStones", thresholdStones);
  registry.rules.register("wallOpening", wallOpening);
  registry.rules.register("openingCutsBand", openingCutsBand);
  registry.rules.register("mountHidden", mountHidden);
  for (const type of WALL_MOUNTS) {
    registry.defaults.attach(type, ["wall"], "wallOpening");
    registry.defaults.attach(type, ["wall", "wall", "wall", "wall"], "wallOpening");
    registry.defaults.join(type, "floorBand", "openingCutsBand");
    registry.detectors.register(joinPairKey(type, "floorBand"), openingMeetsBand);
    registry.defaults.join(type, "wall", "mountHidden");
    registry.detectors.register(joinPairKey(type, "wall"), mountInsideHouse);
  }
  return registry;
}
