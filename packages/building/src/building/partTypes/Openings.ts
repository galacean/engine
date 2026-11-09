// Part-type layer: prefabs mounted on house walls, such as windows, doors and wall lamps.
// - A mounted part has a point "mount" on its wall. When it opens the wall, it has surfaces
//   "opening0", "opening1", ...: rectangles that together form the area it takes out of the
//   wall. A member that bends along the wall has a curve "follow0", "follow1", ...: the
//   wall line under it.
// - It attaches to the house walls; the attach rule removes its opening from the wall it sits
//   on. A finish continues the wall faces, so it loses the opening too.
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
  type ParticipantView,
  type Rect,
  type SurfaceKind,
  type Vec3
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
/** What the asset layer measured about a building prefab (`{ prefab: key }`): its bounds, its
 * opening in its own x/y plane, the members that bend along the wall, how much its opening
 * narrows on a curved wall, and the right half of the small roof it carries out of a roof. */
export interface PrefabFacts {
  readonly bounds: { readonly min: readonly number[]; readonly max: readonly number[] };
  readonly openings: readonly { readonly min: readonly number[]; readonly max: readonly number[] }[];
  readonly units: readonly { readonly matrix: readonly number[]; readonly span?: readonly [number, number] }[];
  readonly curvedNarrowing: number;
  readonly roofProfile?: readonly (readonly [number, number])[];
  /** How far in front of the wall an eave dormer's arch starts, on a straight and a curved wall. */
  readonly eaveOut?: number;
  readonly eaveOutCurved?: number;
  /** The height of the stone threshold laid under a door that stands on the ground. */
  readonly threshold?: number;
  /** How far the origin of a corner window stands in from its wall corner. */
  readonly cornerOut?: number;
  /** How far a corner window reaches along each wall from its corner. */
  readonly cornerReach?: number;
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
/** The mount point at which `mountPrefab` lays a prefab with its origin at `at`, on axes x
 * (across), y (up) and z (out): the center of the prefab's bounds across and up, resized about
 * its back. */
export function mountFor(
  at: Vec3,
  axes: { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 },
  facts: PrefabFacts,
  sx: number,
  sy: number
): Vec3 {
  const { min, max } = facts.bounds;
  const cx = ((min[0] + max[0]) / 2) * sx,
    cy = ((min[1] + max[1]) / 2) * sy,
    cz = -min[2] * (1 - Math.min(sx, sy));
  return [0, 1, 2].map((k) => at[k] + axes.x[k] * cx + axes.y[k] * cy + axes.z[k] * cz) as unknown as Vec3;
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
/** How far a threshold reaches past its opening on each side, in metres at the prefab's size. */
const THRESHOLD_OVERHANG = 0.08;
/** Elements "mount", "opening<i>" and "follow<i>". The mount sits on the wall at the middle
 * of the chord the installation spans, at the installation's center height; it faces out of
 * the wall. The prefab's opening and its members that bend along the wall come from the
 * asset layer: each opening rectangle, centered on the prefab's bounds, becomes a wall area,
 * narrower where the wall curves under the installation; each such member gets the wall
 * line under its span, sampled at most 0.1 m apart. */
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
  const a = along(s - p.width / 2),
    b = along(s + p.width / 2);
  const chord = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const x: Vec3 = [(b.x - a.x) / chord, 0, (b.z - a.z) / chord];
  const center = sample.at(s).ground + p.bottom + p.height / 2;
  const origin: Vec3 = [(a.x + b.x) / 2, center, (a.z + b.z) / 2];
  const [sx, sy] = prefabScale(facts, p.width, p.height);
  const cx = (facts.bounds.min[0] + facts.bounds.max[0]) / 2,
    cy = (facts.bounds.min[1] + facts.bounds.max[1]) / 2;
  const curved = a.tangent[0] * b.tangent[0] + a.tangent[1] * b.tangent[1] < 1 - 1e-9;
  const narrowing = curved ? facts.curvedNarrowing : 0;
  const openings = facts.openings.map((o) => ({
    width: (o.max[0] - o.min[0] - narrowing) * sx,
    height: (o.max[1] - o.min[1]) * sy,
    offset: [((o.min[0] + o.max[0]) / 2 - cx) * sx, ((o.min[1] + o.max[1]) / 2 - cy) * sy]
  }));
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
  openings.forEach((opening, i) => {
    const [du, dv] = opening.offset ?? [0, 0];
    const rect: Rect = [
      s + du - opening.width / 2,
      center + dv - opening.height / 2,
      s + du + opening.width / 2,
      center + dv + opening.height / 2
    ];
    const at = sample.at(Math.max(0, rect[0]));
    const params: WallOpeningParams = {
      host: host.index,
      rect,
      perimeter: [rect[0] + offset, rect[1], rect[2] + offset, rect[3]],
      origin: [at.x, rect[1], at.z],
      x
    };
    elements[`opening${i}`] = { kind: "surface", surface: { kind: "wallOpening", params } };
  });
  // A door on the ground steps out over a threshold, along the wall under its opening, as far
  // as the wall goes. The curve "thresholdTop" is level at the height of its top.
  const sill = elements.opening0;
  if (facts.threshold && p.bottom <= THRESHOLD_ON_GROUND && sill?.kind === "surface") {
    const [from, , to] = (sill.surface.params as WallOpeningParams).rect;
    const over = THRESHOLD_OVERHANG * sx;
    const lo = chart.closed ? from - over : Math.max(0, from - over),
      hi = chart.closed ? to + over : Math.min(sample.length, to + over);
    const steps = Math.max(2, Math.ceil((hi - lo) / 0.25));
    const points = Array.from({ length: steps + 1 }, (_, k): Vec3 => {
      const at = along(lo + ((hi - lo) * k) / steps);
      return [at.x, at.ground, at.z];
    });
    const level = Math.max(...points.map((q) => q[1])) + facts.threshold * sy;
    elements.threshold = { kind: "curve", curve: { points } };
    elements.thresholdTop = {
      kind: "curve",
      curve: { points: [points[0], points[steps]].map((q): Vec3 => [q[0], level, q[2]]) }
    };
  }
  follows.forEach((follow, i) => {
    const steps = Math.max(2, Math.ceil((follow.to - follow.from) / 0.1));
    const points = Array.from({ length: steps + 1 }, (_, k): Vec3 => {
      const at = along(s + follow.from + ((follow.to - follow.from) * k) / steps);
      return [at.x, center + follow.height, at.z];
    });
    elements[`follow${i}`] = { kind: "curve", curve: { points } };
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
/** Elements "mount" and "opening<i>" of a window that spans a wall corner. It stands across the
 * corner, facing out along the corner's bisector, and scales evenly in plan so that it keeps
 * the corner's angle. Its openings run along the perimeter from the corner, on both of the walls
 * they cross. The curve "cornerSpan" stands at the corner from below the window to above its
 * lintels: the corner's stones leave those heights free. `u` must lie within 1 cm of a corner; a
 * round wall has none. */
export const houseCornerMountGeometry: GeometryGenerator<CornerMountParams> = (p, { hosts, environment }) => {
  const facts = prefabFacts(environment, p.prefab);
  if (!facts.cornerOut) throw Error(`Building prefab "${p.prefab}" does not span a corner`);
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
    return wallChartSampler(w.chart).at(v - offsetOf(w));
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
  const need = (facts.cornerReach ?? 0) * sx + 0.04;
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
  const origin: Vec3 = [corner[0] - z[0] * facts.cornerOut * sx, pivotY, corner[1] - z[2] * facts.cornerOut * sx];
  // The prefab scales evenly in plan and about its back: its origin stays where it was placed.
  const center = [0, 1, 2].map(
    (k) =>
      origin[k] + x[k] * ((min[0] + max[0]) / 2) * sx + y[k] * ((min[1] + max[1]) / 2) * sy + z[k] * min[2] * (sx - 1)
  ) as unknown as Vec3;
  const host = walls.find(
    (w) => wrap(at + CORNER_PROBE) - offsetOf(w) >= 0 && wrap(at + CORNER_PROBE) - offsetOf(w) <= chartLength(w.chart)
  )!;
  const elements: Record<string, import("../core").GeometryElement> = {
    mount: {
      kind: "point",
      frame: { origin: center, x, y, z },
      on: { host: host.index, element: "face", u: at, v: pivotY }
    }
  };
  elements.cornerSpan = {
    kind: "curve",
    curve: {
      points: [
        [corner[0], pivotY + min[1] * sy - 0.05, corner[1]],
        [corner[0], top + 0.1, corner[1]]
      ]
    }
  };
  let i = 0;
  for (const o of facts.openings) {
    const [a, b] = [at + o.min[0] * sx, at + o.max[0] * sx];
    const [lo, hi] = [pivotY + o.min[1] * sy, pivotY + o.max[1] * sy];
    // Each wall loses the part of the span that lies on it.
    for (const w of walls) {
      const start = offsetOf(w),
        end = start + chartLength(w.chart);
      for (const shift of [-perimeter, 0, perimeter]) {
        const from = Math.max(a + shift, start),
          to = Math.min(b + shift, end);
        if (!(to - from > 1e-6)) continue;
        const sample = wallChartSampler(w.chart).at(from - start);
        const params: WallOpeningParams = {
          host: w.index,
          rect: [from - start, lo, to - start, hi],
          perimeter: [from, lo, to, hi],
          origin: [sample.x, lo, sample.z],
          x: [sample.tangent[0], 0, sample.tangent[1]]
        };
        elements[`opening${i++}`] = { kind: "surface", surface: { kind: "wallOpening", params } };
      }
    }
  }
  return { elements };
};

/** The opening rectangles of a mounted part. */
export const wallOpeningsOf = (part: ParticipantView): WallOpeningParams[] =>
  Object.values(part.geometry.original.elements).flatMap((e) =>
    e.kind === "surface" && e.surface.kind === "wallOpening" ? [e.surface.params as WallOpeningParams] : []
  );
/** Attach rule of a mounted part: its opening comes out of the wall it sits on. An opening
 * must stay inside its wall. */
export const wallOpening: ConnectionRule = ({ guest, hosts }) => {
  const openings = guest ? wallOpeningsOf(guest) : [];
  if (!guest || !openings.length) return {};
  const modify = [];
  // A masonry wall carries the threshold of a door in its own stone.
  const step = guest.geometry.original.elements.threshold;
  const facts = hosts[openings[0].host]?.unit;
  const derive =
    step?.kind === "curve" && facts?.source === "brick"
      ? [
          {
            localId: "threshold",
            type: "threshold",
            geometry: { elements: { step, top: guest.geometry.original.elements.thresholdTop } },
            algorithm: {
              type: "thresholdStones",
              params: { wallU: [openings[0].perimeter[0], openings[0].perimeter[2]] }
            },
            unit: { ...facts, range: { min: [0.05, 0.05, 0.1] as Vec3, max: [10, 10, 10] as Vec3 } }
          }
        ]
      : [];
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

interface ThresholdParams {
  /** Where the threshold lies along the house perimeter, in metres. */
  readonly wallU: readonly [number, number];
  /** Depth through the wall, in metres. Default: 0.76, wider than the wall's bricks. */
  readonly depth?: number;
}
/** The stones of a door's threshold: about 0.7 m each along the curve "step" on the ground, up
 * to the level of the curve "top". */
export const thresholdStones: LayingAlgorithm<ThresholdParams, { count: number }> = {
  info: {
    accepts: ["curve"],
    summary: "A door's threshold: a row of low stones along a curve on the ground.",
    params: {
      wallU: "Where the threshold lies along the house perimeter, in metres.",
      depth: "Depth through the wall, in metres. Default: 0.76."
    }
  },
  plan(context) {
    const points = curvePoints(context.geometry.original.elements.step);
    const length = points.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - points[i][0], q[2] - points[i][2]), 0);
    const count = Math.max(1, Math.round(length / 0.7));
    return { count, data: { count } };
  },
  unitAt(context, { count }, index) {
    const points = curvePoints(context.geometry.original.elements.step);
    const joint = (i: number) =>
      i === 0 || i === count ? i / count : (i + (context.random(`joint/${i}`, "joint").next() - 0.5) * 0.3) / count;
    const a = pointAlong(points, joint(index)),
      b = pointAlong(points, joint(index + 1));
    const top = curvePoints(context.geometry.original.elements.top)[0][1];
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
      size: [l, top - y0, context.params.depth ?? 0.76],
      params: {
        deformation: [a[1] - y0, b[1] - y0, 0, 0],
        flags: 0,
        wallU: [u0 + (u1 - u0) * joint(index), u0 + (u1 - u0) * joint(index + 1)]
      }
    };
  }
};
function curvePoints(element: GeometryElement | undefined): readonly Vec3[] {
  if (element?.kind !== "curve") throw Error("thresholdStones lays a curve");
  return element.curve.points;
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
const crosses = (o: WallOpeningParams, band: WallChartParams) =>
  o.perimeter[1] < band.topY && band.minGround < o.perimeter[3];
/** An opening meets a floor band when it crosses one of the band's levels. */
export const openingMeetsBand: JoinDetector = (a, b) => {
  const [openings, bands] = wallOpeningsOf(a).length
    ? [wallOpeningsOf(a), bandsOf(b)]
    : [wallOpeningsOf(b), bandsOf(a)];
  return openings.some((opening) => bands.some((band) => crosses(opening, band.chart)));
};
/** Peer rule between an opening and a floor band: the band gives way to the opening on every
 * level the opening crosses. Band charts run along the house perimeter. */
export const openingCutsBand: ConnectionRule = ({ parts }) => {
  const mounted = parts.find((p) => wallOpeningsOf(p).length),
    band = parts.find((p) => !wallOpeningsOf(p).length);
  if (!mounted || !band) return {};
  return {
    modify: wallOpeningsOf(mounted).flatMap((opening) =>
      bandsOf(band)
        .filter((b) => crosses(opening, b.chart))
        .map((b) => ({
          part: band.key,
          modification: { element: b.id, op: "removeArea" as const, rect: opening.perimeter }
        }))
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
  const e = wall.geometry.original.elements.outline;
  return e?.kind === "curve" ? e.curve.points : undefined;
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
}
/** Lays a part's building prefab at each of its mounts ("mount", "mount1", "mount2", ...),
 * scaled to the installation size. The center of the prefab's bounds lies on the mount across
 * and up; it is resized about its back, which stays where the unscaled prefab's back would be,
 * so a wall prefab keeps its distance from the wall at every size. The unit's pivot must be
 * the middle of the back: [0.5, 0.5, 0]. */
export const mountPrefab: LayingAlgorithm<MountPrefabParams, null> = {
  info: {
    accepts: ["point"],
    summary: 'One building prefab at each point "mount", "mount1", ..., scaled to the installation size.',
    params: {
      width: "Installation width in metres. Default: the prefab's own.",
      height: "Installation height in metres. Default: the prefab's own.",
      unitParams: "Values the renderer reads from the laid unit.",
      row: "The prefabs stand in a row { count, spacing }; width is the whole row's. Default: one prefab."
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
    return {
      key: `${index}`,
      frame: { ...frame, origin: [0, 1, 2].map((k) => frame.origin[k] + frame.z[k] * back) as unknown as Vec3 },
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
