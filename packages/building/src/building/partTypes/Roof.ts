// Part-type layer: pitched roofs, one part per slope.
// - A slope attaches to the house walls and reads their top height and outer face.
// - Two slopes that share a side edge meet at a hip: the join derives a hip cap and clips
//   the tiles of both slopes along the hip.
// - Two slopes whose top edges face each other meet at the ridge: the join derives a ridge cap.
// Our own roof: the shape follows the online roof parameters, and every random value comes
// from our seed channels.
import {
  add,
  cross,
  dot,
  normalize,
  scale,
  sub,
  type BuildingRegistry,
  type ConnectionRule,
  type Frame,
  type GeometryGenerator,
  type JoinDetector,
  type LaidUnitSpec,
  type LayingAlgorithm,
  type LayingContext,
  type ParticipantView,
  type Plane,
  type SurfaceKind,
  type Vec3,
  joinPairKey
} from "../core";
import { profileShape } from "../runtime/ProfileGeometry";
import { isFlatRoofHeight } from "../runtime/RoofMode";
import type { HouseShared, WallChartParams } from "./House";

type V2 = readonly [number, number];

/** One slope: a quad from the eave edge (b0, b1) to the top edge (t0, t1), with b0 on the
 * left as seen from outside. The height follows the profile y = x^exponent, where x runs
 * from the eave edge (0) to the top edge (1). Plain JSON. */
export interface RoofSlopeParams {
  readonly b0: V2;
  readonly b1: V2;
  readonly t0: V2;
  readonly t1: V2;
  /** Eave height: the top of the walls. */
  readonly base: number;
  /** Height of the top edge above the eave. */
  readonly height: number;
  readonly exponent: number;
  /** Ridge cap width and how far it sinks into the roof, in metres. */
  readonly ridgeWidth: number;
  readonly ridgeDrop: number;
}

const PROFILE_POINTS = 20;
const NO_CLIP: Plane = [0, 1, 0, 65504];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp2 = (a: V2, b: V2, t: number): [number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const near2 = (a: V2, b: V2, tolerance = 1e-6) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;

/** The roof height above the eave, from the normalized height and the footprint size. */
export function roofRise(height: number, size: number): number {
  const t = smooth(clamp01((size - 2.25) / 12.75 / 0.4));
  const cap = 12 * t + 9 * (1 - t);
  return Math.min(cap, Math.max(0, height * 12 + (1 - height) * 0.4));
}

/** The four slopes of a rectangular roof, indexed by the wall side below them; gable ends are absent. */
export function roofSlopes(shared: HouseShared, chart: WallChartParams): (RoofSlopeParams | undefined)[] {
  const roof = shared.roof;
  if (!roof) throw Error("A roof needs roof parameters");
  const shape = profileShape(shared.footprint);
  if (shape.type !== "rectangle") throw Error("Roof slopes need a rectangular footprint");
  if (isFlatRoofHeight(roof.height)) throw Error("Flat roofs have no slopes");
  if (roof.tip.some((v) => v !== 0)) throw Error("Roof slopes need a centered tip");
  // Work in a frame where the ridge runs along local x.
  let [w, d] = [shape.width, shape.depth];
  let [ox, oz] = shape.orientation;
  if (roof.ridge_direction === 1) {
    [w, d] = [d, w];
    [ox, oz] = [-oz, ox];
  }
  const [cx, cz] = shape.center;
  const q = roof.profile;
  // The eave flares out with the eave parameter, more for a convex profile.
  const flare = roof.eave * 1.5 * (Math.sqrt(q) + (1 - Math.sqrt(q)) * 0.5);
  const gable = roof.ridge_length === 1;
  let lower = [w + 0.28 + flare, d + 0.28 + flare];
  const upper = [(1 - roof.ridge_length) * 0.1 + roof.ridge_length * w, 0.1];
  if (gable) {
    // A gable roof covers the finish face of the gable walls.
    lower = [w + 2 * chart.finishOuter + flare, d + 2 * chart.finishOuter + flare];
    upper[0] = lower[0];
  }
  const corners = ([x, z]: number[]): V2[] => [
    [-x / 2, -z / 2],
    [-x / 2, z / 2],
    [x / 2, z / 2],
    [x / 2, -z / 2]
  ];
  const world = ([x, z]: V2): V2 => [cx + ox * x - oz * z, cz + oz * x + ox * z];
  const bottom = corners(lower).map(world),
    top = corners(upper).map(world);
  const product = roof.height * q;
  const ridgeWidth = 0.4 + 0.15 * smooth(clamp01((1 - product - 0.8) / 0.2));
  const ridgeDrop = roof.height * 0.08 + (1 - roof.height) * 0.02 + product * 0.15 + (1 - product) * 0.1;
  // Slope k sits over wall side k. In the ridge frame the eave of slope k runs between
  // corners k and k + 1; turning the ridge shifts that order by one side.
  return [0, 1, 2, 3].map((wall) => {
    const side = (wall + roof.ridge_direction) % 4;
    if (gable && side % 2 === 0) return undefined;
    const next = (side + 1) % 4;
    return {
      b0: bottom[side],
      b1: bottom[next],
      t0: top[side],
      t1: top[next],
      base: chart.topY,
      height: roofRise(roof.height, Math.max(w, d)),
      exponent: q * 1.5 + (1 - q) * 0.5,
      ridgeWidth,
      ridgeDrop
    };
  });
}

/** Profile samples of a slope, with arc length along its middle line. */
interface SlopeSampler {
  readonly length: number;
  /** Profile x and y at normalized arc length v. */
  at(v: number): { x: number; y: number; dx: number; dy: number };
}
const samplers = new WeakMap<RoofSlopeParams, SlopeSampler>();
function slopeSampler(p: RoofSlopeParams): SlopeSampler {
  let found = samplers.get(p);
  if (found) return found;
  const xs = Array.from({ length: PROFILE_POINTS }, (_, i) => i / (PROFILE_POINTS - 1));
  const ys = xs.map((x) => Math.pow(x, p.exponent));
  const m0 = lerp2(p.b0, p.b1, 0.5),
    m1 = lerp2(p.t0, p.t1, 0.5);
  const run = Math.hypot(m1[0] - m0[0], m1[1] - m0[1]);
  const knots = [0];
  for (let i = 1; i < xs.length; i++)
    knots.push(knots[i - 1] + Math.hypot((xs[i] - xs[i - 1]) * run, (ys[i] - ys[i - 1]) * p.height));
  const length = knots[knots.length - 1];
  found = {
    length,
    at(v) {
      const s = clamp01(v) * length;
      let i = 0;
      while (i < knots.length - 2 && knots[i + 1] < s) i++;
      const t = (s - knots[i]) / (knots[i + 1] - knots[i]);
      return {
        x: lerp(xs[i], xs[i + 1], t),
        y: lerp(ys[i], ys[i + 1], t),
        dx: xs[i + 1] - xs[i],
        dy: ys[i + 1] - ys[i]
      };
    }
  };
  samplers.set(p, found);
  return found;
}
/** The two ends of the row line at profile position x. */
function rowEnds(p: RoofSlopeParams, x: number): [V2, V2] {
  return [lerp2(p.b0, p.t0, x), lerp2(p.b1, p.t1, x)];
}
/** Slope frame: x along the row (left to right), y up the slope, z out of the roof. */
function slopeFrame(p: RoofSlopeParams, u: number, v: number): Frame {
  const { x, y, dx, dy } = slopeSampler(p).at(v);
  const [l, r] = rowEnds(p, x);
  const at = lerp2(l, r, u);
  const xAxis = normalize([r[0] - l[0], 0, r[1] - l[1]]);
  const climb = lerp2([p.t0[0] - p.b0[0], p.t0[1] - p.b0[1]], [p.t1[0] - p.b1[0], p.t1[1] - p.b1[1]], u);
  const up: Vec3 = [climb[0] * dx, p.height * dy, climb[1] * dx];
  const yAxis = normalize(sub(up, scale(xAxis, dot(up, xAxis))));
  return { origin: [at[0], p.base + p.height * y, at[1]], x: xAxis, y: yAxis, z: cross(xAxis, yAxis) };
}
/** u across the row (0 at the left edge, 1 at the right), v up the slope by arc length. */
export const roofSlopeSurface: SurfaceKind<RoofSlopeParams> = {
  domain: () => ({ u: [0, 1], v: [0, 1], closedU: false }),
  frame: (p, u, v) => slopeFrame(p, u, v)
};

const slopeOf = (part: ParticipantView): RoofSlopeParams | undefined => {
  const element = part.geometry.original.elements.slope;
  return element?.kind === "surface" && element.surface.kind === "roofSlope"
    ? (element.surface.params as RoofSlopeParams)
    : undefined;
};
const hostChart = (hosts: readonly ParticipantView[]): WallChartParams => {
  const wall = hosts[0]?.geometry.original.elements.face;
  if (wall?.kind !== "surface" || wall.surface.kind !== "wallChart")
    throw Error("A roof slope attaches to house walls");
  return wall.surface.params as WallChartParams;
};

/** Element "slope": the roof slope over wall side `side`. The host is that wall. */
export const houseRoofSlopeGeometry: GeometryGenerator<HouseShared & { side: number }> = (p, { hosts }) => {
  const slope = roofSlopes(p, hostChart(hosts))[p.side];
  if (!slope) throw Error(`Roof side ${p.side} is a gable end and has no slope`);
  return { elements: { slope: { kind: "surface", surface: { kind: "roofSlope", params: slope } } } };
};

type TileParams = {
  /** Tile length over the row spacing. Default: 1.43, so rows overlap. */
  overlap?: number;
  /** Random tile length variation, as a fraction. Default: 0.2. */
  lengthJitter?: number;
  /** Random shade offset up the slope. Default: 0.2. */
  shadeJitter?: number;
  /** How deep eave closures are, in metres. Default: 0.1. */
  closureDepth?: number;
};
interface TileLayout {
  rows: number;
  cols: number;
}
const tileSize = (context: LayingContext<unknown>) => {
  const [width, height, depth] = context.unit.scale ?? [1, 1, 1];
  return { width, height, depth };
};
const rowCount = (p: RoofSlopeParams, height: number) => Math.max(2, Math.ceil(slopeSampler(p).length / height)) - 1;
const rowV = (rows: number, r: number) => r / rows;
function rowCols(p: RoofSlopeParams, v: number, width: number): number {
  const [l, r] = rowEnds(p, slopeSampler(p).at(v).x);
  return Math.max(3, Math.ceil(Math.hypot(r[0] - l[0], r[1] - l[1]) / width));
}
/** Where a clip plane starts to cut, measured from a point: the nearest plane wins. */
function nearestClip(planes: readonly Plane[], at: Vec3): Plane {
  let best = NO_CLIP,
    distance = Infinity;
  for (const plane of planes) {
    const d = plane[0] * at[0] + plane[1] * at[1] + plane[2] * at[2] + plane[3];
    if (d < distance) [best, distance] = [plane, d];
  }
  return best;
}

/** Overlapping tile rows up a roof slope. Row r sits at v = r / rows; each row splits
 * evenly into columns of about one unit width; a tile is about 1.43 row spacings long, so
 * the rows overlap. The first row also gets a flat closure tile under the eave. Tiles take
 * the nearest clip plane of the slope. */
export const roofTiles: LayingAlgorithm<TileParams, TileLayout> = {
  info: {
    accepts: ["surface"],
    summary: "Overlapping tile rows up a roof slope, with flat closures under the eave.",
    params: {
      overlap: "Tile length over the row spacing. Default: 1.43.",
      lengthJitter: "Random tile length variation, as a fraction. Default: 0.2.",
      shadeJitter: "Random shade offset up the slope. Default: 0.2.",
      closureDepth: "Depth of the eave closures in metres. Default: 0.1."
    }
  },
  plan(context) {
    const p = slopeParams(context);
    const { width, height } = tileSize(context);
    const rows = rowCount(p, height);
    // The eave row is the widest one.
    const cols = Math.max(...Array.from({ length: rows }, (_, r) => rowCols(p, rowV(rows, r), width)));
    return { count: rows * cols + cols, data: { rows, cols } };
  },
  unitAt(context, d, index) {
    const p = slopeParams(context);
    const closure = index >= d.rows * d.cols;
    const r = closure ? 0 : Math.floor(index / d.cols),
      c = index % d.cols;
    const tile = tileAt(context, p, d.rows, r, c);
    if (!tile || !closure) return tile;
    // The closure lies flat under the eave end of the first-row tile.
    const length = tile.size![1];
    const low = sub(tile.frame.origin, scale(tile.frame.y, -length / 2));
    const high = add(tile.frame.origin, scale(tile.frame.y, -length / 2));
    const reach: Vec3 = [high[0] - low[0], 0, high[2] - low[2]];
    const span = Math.hypot(reach[0], reach[2]);
    if (!(span > 0.1)) return;
    const rowAxis = tile.frame.x;
    const outward: Vec3 = [rowAxis[2], 0, -rowAxis[0]];
    return {
      key: `eave/${c}`,
      frame: { origin: add(low, scale(reach, 0.5)), x: rowAxis, y: outward, z: cross(rowAxis, outward) },
      size: [tile.size![0], span, context.params.closureDepth ?? 0.1],
      params: { ...tile.params, shade: 0, flag: 2 }
    };
  }
};
function slopeParams(context: LayingContext<unknown>): RoofSlopeParams {
  const element = context.geometry.original.elements.slope;
  if (element?.kind !== "surface" || element.surface.kind !== "roofSlope") throw Error("roofTiles lays a roof slope");
  return element.surface.params as RoofSlopeParams;
}
function tileAt(
  context: LayingContext<TileParams>,
  p: RoofSlopeParams,
  rows: number,
  r: number,
  c: number
): LaidUnitSpec | undefined {
  const { width, depth } = tileSize(context);
  const v = rowV(rows, r);
  const cols = rowCols(p, v, width);
  if (c >= cols) return;
  const frame = slopeFrame(p, (c + 0.5) / cols, v);
  const [l, rr] = rowEnds(p, slopeSampler(p).at(v).x);
  const tileWidth = Math.hypot(rr[0] - l[0], rr[1] - l[1]) / cols;
  // Row spacing along the middle of the slope; the top row measures to the row below.
  const mid = (vv: number) => slopeFrame(p, 0.5, vv).origin;
  const other = rows === 1 ? 1 : r < rows - 1 ? rowV(rows, r + 1) : rowV(rows, r - 1);
  const spacing = Math.hypot(...sub(mid(v), mid(other)));
  const key = `${r}/${c}`;
  const jitter = context.params.lengthJitter ?? 0.2;
  const length =
    spacing * (context.params.overlap ?? 1.43) * (1 - jitter + 2 * jitter * context.random(key, "length").next());
  const shade = clamp01(v + context.random(key, "shade").next() * (context.params.shadeJitter ?? 0.2));
  return {
    key,
    // The tile hangs down the slope: its y points down, its x to the left.
    frame: { origin: frame.origin, x: scale(frame.x, -1), y: scale(frame.y, -1), z: frame.z },
    size: [tileWidth, length, depth],
    params: { clip: nearestClip(context.geometry.clips("slope"), frame.origin), shade, flag: r === 0 ? 2 : 1 }
  };
}

type CapParams = {
  /** Cap width and depth in metres. */
  width: number;
  depth: number;
  /** Cap length over the joint spacing. */
  overlap?: number;
  /** Extra cap length in metres. */
  pad?: number;
  /** Where the cap center sits between its joints, as a fraction of the joint spacing. */
  along?: number;
  /** How far the cap sinks into the roof along its own z, in metres. */
  sink?: number;
  /** Shade at the first joint and at the last. */
  shade?: [number, number];
  /** Caps run down the curve (hips) instead of along it (ridges). */
  downhill?: boolean;
  /** Renderer flag of every cap. Default: 2 at both ends, 1 between. */
  flag?: number;
  /** Joint spacing and jitter in metres. Default: 0.625 and 0.125. */
  spacing?: number;
  jitter?: number;
  element?: string;
};
interface CapLayout {
  joints: number;
}
/** Caps along a curve between randomly placed joints. Joint i sits at i / (joints - 1)
 * of the curve, moved by its own random offset. */
export const capCourses: LayingAlgorithm<CapParams, CapLayout> = {
  info: {
    accepts: ["curve"],
    summary: "Ridge or hip caps along a curve, between randomly placed joints.",
    params: {
      width: "Cap width in metres.",
      depth: "Cap depth in metres.",
      overlap: "Cap length over the joint spacing. Default: 1.",
      pad: "Extra cap length in metres. Default: 0.",
      along: "Where the cap center sits between its joints, as a fraction of their spacing. Default: 0.5.",
      sink: "How far the cap sinks into the roof along its own z, in metres. Default: 0.",
      shade: "Shade at the first and the last joint. Default: [0, 1].",
      downhill: "The cap's y runs down the curve, as on a hip. Default: false.",
      flag: "Renderer flag of every cap. Default: 2 at both ends, 1 between.",
      spacing: "Joint spacing in metres. Default: 0.625.",
      jitter: "Joint jitter in metres. Default: 0.125.",
      element: "Curve element id. Default: the first curve."
    }
  },
  plan(context) {
    const curve = context.geometry.curve(capElement(context));
    const joints = Math.max(2, Math.floor(curve.length / (context.params.spacing ?? 0.625) + 0.5));
    return { count: joints - 1, data: { joints } };
  },
  unitAt(context, d, index) {
    const p = context.params;
    const curve = context.geometry.curve(capElement(context));
    const step = 1 / (d.joints - 1),
      amplitude = Math.min((p.jitter ?? 0.125) / curve.length, step * 0.495);
    const joint = (i: number) =>
      i === 0 || i === d.joints - 1
        ? i * step
        : i * step + (context.random(`joint:${i}`, "offset").next() - 0.5) * amplitude;
    const a = joint(index),
      b = joint(index + 1);
    const pa = curve.frame(a * curve.length).origin,
      pb = curve.frame(b * curve.length).origin;
    const chord = sub(pb, pa),
      span = Math.hypot(...chord);
    const tangent = normalize(chord);
    // n is level and square to the curve; z = tangent × n points out of the roof.
    const n = normalize(cross([0, 1, 0], [chord[0], 0, chord[2]]));
    const z = normalize(cross(tangent, n));
    const x = p.downhill ? n : scale(n, -1);
    const origin = sub(add(pa, scale(tangent, span * (p.along ?? 0.5))), scale(z, p.sink ?? 0));
    const [s0, s1] = p.shade ?? [0, 1];
    return {
      key: `${index}`,
      frame: { origin, x, y: cross(z, x), z },
      size: [p.width, span * (p.overlap ?? 1) + (p.pad ?? 0), p.depth],
      params: {
        clip: NO_CLIP,
        shade: lerp(s0, s1, a),
        flag: p.flag ?? (index === 0 || index === d.joints - 2 ? 2 : 1)
      }
    };
  }
};
function capElement(context: LayingContext<CapParams>) {
  return context.params.element ?? context.geometry.ids("curve")[0];
}

/** Two slopes meet at a hip when they share a side edge, and at the ridge when their top
 * edges face each other. */
function slopeMeeting(a: RoofSlopeParams, b: RoofSlopeParams): "hip" | "ridge" | undefined {
  if ((near2(a.b1, b.b0) && near2(a.t1, b.t0)) || (near2(b.b1, a.b0) && near2(b.t1, a.t0))) return "hip";
  const length = Math.hypot(a.t1[0] - a.t0[0], a.t1[1] - a.t0[1]);
  if (length > 0.1 + 1e-6 && near2(a.t0, b.t1, 0.25) && near2(a.t1, b.t0, 0.25)) return "ridge";
}
export const slopesMeet: JoinDetector = (a, b) => {
  const pa = slopeOf(a),
    pb = slopeOf(b);
  return !!pa && !!pb && slopeMeeting(pa, pb) !== undefined;
};
/** The profile line from an eave corner to a top corner, in world space. */
function profileLine(p: RoofSlopeParams, bottom: V2, top: V2): Vec3[] {
  return Array.from({ length: PROFILE_POINTS }, (_, i) => {
    const x = i / (PROFILE_POINTS - 1);
    const at = lerp2(bottom, top, x);
    return [at[0], p.base + p.height * Math.pow(x, p.exponent), at[1]];
  });
}
/** A vertical plane through the hip line, set back `inset` into the slope. */
function hipClip(p: RoofSlopeParams, bottom: V2, top: V2, inset: number): Plane {
  const n = normalize([-(top[1] - bottom[1]), 0, top[0] - bottom[0]]);
  const center = lerp2(lerp2(p.b0, p.b1, 0.5), lerp2(p.t0, p.t1, 0.5), 0.5);
  const side = Math.sign(n[0] * (center[0] - bottom[0]) + n[2] * (center[1] - bottom[1])) || 1;
  const normal: Vec3 = [n[0] * side, 0, n[2] * side];
  return [normal[0], 0, normal[2], -inset - (normal[0] * bottom[0] + normal[2] * bottom[1])];
}
/** Peer rule between two roof slopes.
 * - At a hip: both slopes are clipped `inset` short of the hip line (default 0.075 m),
 *   and the connection derives a hip cap along it.
 * - At the ridge: the connection derives a ridge cap along the middle of the two top edges. */
export const roofSlopes_: ConnectionRule = ({ parts, params }) => {
  const [a, b] = parts;
  const pa = slopeOf(a),
    pb = slopeOf(b);
  if (!pa || !pb) return { diagnostics: ["roofSlopes joins roof slopes"] };
  const meeting = slopeMeeting(pa, pb);
  const unit = a.unit;
  if (!meeting) return {};
  if (!unit) return { diagnostics: ["roofSlopes needs the slope unit"] };
  if (meeting === "hip") {
    const [left, right] = near2(pa.b1, pb.b0) && near2(pa.t1, pb.t0) ? [a, b] : [b, a];
    const pl = slopeOf(left)!;
    const inset = (params.inset as number | undefined) ?? 0.075;
    return {
      modify: [
        { part: left.key, modification: { element: "slope", op: "clip", plane: hipClip(pl, pl.b1, pl.t1, inset) } },
        {
          part: right.key,
          modification: { element: "slope", op: "clip", plane: hipClip(slopeOf(right)!, pl.b1, pl.t1, inset) }
        }
      ],
      derive: [
        {
          localId: "hip",
          type: "hipCap",
          geometry: { elements: { hip: { kind: "curve", curve: { points: profileLine(pl, pl.b1, pl.t1) } } } },
          algorithm: {
            type: "capCourses",
            params: HIP_CAP
          },
          unit
        }
      ]
    };
  }
  const y = pa.base + pa.height;
  const from = lerp2(pa.t0, pb.t1, 0.5),
    to = lerp2(pa.t1, pb.t0, 0.5);
  // Ridge caps run from the end with the smaller x, so that both orders give the same cap.
  const [start, end] = from[0] < to[0] || (from[0] === to[0] && from[1] < to[1]) ? [from, to] : [to, from];
  return {
    derive: [
      {
        localId: "ridge",
        type: "ridgeCap",
        geometry: {
          elements: {
            ridge: {
              kind: "curve",
              curve: {
                points: [
                  [start[0], y, start[1]],
                  [end[0], y, end[1]]
                ]
              }
            }
          }
        },
        algorithm: {
          type: "capCourses",
          params: { width: pa.ridgeWidth, depth: 0.15, overlap: 1.4, sink: pa.ridgeDrop, shade: [0.9, 1] }
        },
        unit
      }
    ]
  };
};

/** The side edges of a slope that run square to its eave: the rakes over gable walls. */
function rakeEdges(p: RoofSlopeParams): [V2, V2][] {
  const eave = normalize([p.b1[0] - p.b0[0], 0, p.b1[1] - p.b0[1]]);
  return (
    [
      [p.b0, p.t0],
      [p.b1, p.t1]
    ] as [V2, V2][]
  ).filter(([b, t]) => {
    const side = [t[0] - b[0], t[1] - b[1]];
    const l = Math.hypot(side[0], side[1]);
    return l > 1e-6 && Math.abs((side[0] * eave[0] + side[1] * eave[2]) / l) < 1e-6;
  });
}
const HIP_CAP = { width: 0.25, depth: 0.18, pad: 0.05, along: 0.3, sink: 0.05, downhill: true, flag: 2 };
/** Attach rule of a roof slope on its walls: each rake over a gable wall gets a rake cap,
 * and the slope's tiles are clipped `inset` short of it (default 0.075 m). */
export const roofOnWalls: ConnectionRule = ({ guest, params }) => {
  const p = guest && slopeOf(guest);
  if (!guest || !p) return {};
  if (!guest.unit) return { diagnostics: ["roofOnWalls needs the slope unit"] };
  const inset = (params.inset as number | undefined) ?? 0.075;
  const rakes = rakeEdges(p);
  return {
    modify: rakes.map(([b, t]) => ({
      part: guest.key,
      modification: { element: "slope", op: "clip" as const, plane: hipClip(p, b, t, inset) }
    })),
    derive: rakes.map(([b, t], i) => ({
      localId: `rake:${i}`,
      type: "rakeCap",
      geometry: { elements: { rake: { kind: "curve" as const, curve: { points: profileLine(p, b, t) } } } },
      algorithm: { type: "capCourses", params: HIP_CAP },
      unit: guest.unit
    }))
  };
};

/** Registers the roof part types into a registry. */
export function registerRoofTypes(registry: BuildingRegistry): BuildingRegistry {
  registry.surfaces.register("roofSlope", roofSlopeSurface);
  registry.geometry.register("houseRoofSlope", houseRoofSlopeGeometry);
  registry.algorithms.register("roofTiles", roofTiles);
  registry.algorithms.register("capCourses", capCourses);
  registry.rules.register("roofSlopes", roofSlopes_);
  registry.rules.register("roofOnWalls", roofOnWalls);
  registry.defaults.attach("roof", ["wall"], "roofOnWalls");
  registry.defaults.attach("roof", ["wall", "wall", "wall", "wall"], "roofOnWalls");
  registry.defaults.join("roof", "roof", "roofSlopes");
  registry.detectors.register(joinPairKey("roof", "roof"), slopesMeet);
  return registry;
}
