// Part-type layer: house walls and roofs.
// A house group shares its footprint, wall height and roof parameters. The wall
// reads them to build its profile, whose top already follows the roof. The roof
// attaches to the wall and reads the wall's top height and outer face.
// The profile maths are the existing European geometry functions.
import {
  deriveSeed,
  joinPairKey,
  Random,
  sinCos,
  unitFits,
  type BuildingUnit,
  type ConnectionRule,
  type DerivedPartSpec,
  type JoinDetector,
  type LaidUnitSpec,
  type Rect,
  type BuildingEnvironment,
  type BuildingRegistry,
  type Frame,
  type GeometryElement,
  type GeometryGenerator,
  type LayingAlgorithm,
  type LayingContext,
  type SurfaceKind,
  type Vec3
} from "../core";
import { profileShape, publishProfileWall } from "../runtime/ProfileGeometry";
import { profileWallEnvelope } from "../runtime/ConstructionWallEnvelope";
import { wallRoofJointHeight, type ConstructionWallRoofJoint } from "../runtime/ConstructionWallRoofJoint";
import { unitFootprintScale, type MaterialFootprint } from "../runtime/MaterialFootprint";
import type { ProfileFootprint, ProfileRoofParameters } from "../runtime/ProfileParameters";
import { registerRoofTypes } from "./Roof";
import { registerOpeningTypes } from "./Openings";
import { registerDormerTypes } from "./Dormers";
import { registerShedDormerTypes } from "./ShedDormers";
import { isFlatRoofHeight } from "../runtime/RoofMode";
import { registerFoundationTypes, type HouseFoundation } from "./Foundation";
import { registerTimberTypes } from "./Timber";
import { registerEaveDormerTypes } from "./EaveDormers";
import { registerArchTypes } from "./Arches";

/** The wall chart: the perimeter unrolled along u, height along v. Plain JSON. */
export interface WallChartParams {
  /** Perimeter points (x, ground y, z); edge i runs from points[i - 1] to points[i]. */
  readonly points: readonly (readonly number[])[];
  /** Top and lower lift at each point. */
  readonly top: readonly number[];
  readonly third: readonly number[];
  readonly minGround: number;
  readonly maxYGable: number;
  readonly topY: number;
  /** Where the wall meets the roof, when it has one. */
  readonly joint?: ConstructionWallRoofJoint;
  /** Outer faces of the wall: laid units sit on the nominal one, the roof on the finish one. */
  readonly nominalOuter: number;
  /** Wall unit depth against the 0.1 m reference; it scales the wall thickness. */
  readonly depthScale?: number;
  /** The chart runs around the whole house: u wraps at the perimeter length. */
  readonly closed?: boolean;
  readonly finishOuter: number;
  /** Where this chart starts on the house perimeter, in metres. Lets the walls of one
   * house share continuous courses. Default: 0. */
  readonly uOffset?: number;
}

const flat = () => 0;
const ground = (environment: BuildingEnvironment) => environment.ground ?? flat;

function edges(p: WallChartParams) {
  const out: { edge: number; u: number; l: number }[] = [];
  let u = 0;
  for (let edge = 1; edge < p.points.length; edge++) {
    const a = p.points[edge - 1],
      b = p.points[edge],
      l = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (l < 1e-8) continue;
    out.push({ edge, u, l });
    u += l;
  }
  return out;
}

/** u = metres along the perimeter, v = height. Axes stay upright on every edge. */
export const wallChartSurface: SurfaceKind<WallChartParams> = {
  domain: (p) => {
    const e = edges(p),
      last = e[e.length - 1];
    return { u: [0, last ? last.u + last.l : 0], v: [p.minGround, p.maxYGable + 0.12], closedU: p.closed === true };
  },
  // The wall itself: from the ground up to its top, which follows the roof joint.
  region: (p) => {
    const sample = wallChartSampler(p);
    const us: number[] = [];
    for (const e of edges(p)) {
      const steps = Math.max(1, Math.ceil(e.l / 0.25));
      for (let k = 0; k < steps; k++) us.push(e.u + (e.l * k) / steps);
    }
    us.push(sample.length);
    const bottom = us.map((u): [number, number] => [u, sample.at(u).ground]);
    const top = us.map((u): [number, number] => [u, sample.at(u).roof]).reverse();
    return [...bottom, ...top];
  },
  frame: (p, u, v): Frame => {
    const all = edges(p);
    const e = all.find((x) => u <= x.u + x.l) ?? all[all.length - 1];
    const a = p.points[e.edge - 1],
      b = p.points[e.edge],
      s = (u - e.u) / e.l;
    const tangent = [(b[0] - a[0]) / e.l, 0, (b[2] - a[2]) / e.l] as const;
    return {
      origin: [a[0] + s * (b[0] - a[0]), v, a[2] + s * (b[2] - a[2])],
      x: [tangent[0], 0, tangent[2]],
      y: [0, 1, 0],
      z: [-tangent[2], 0, tangent[0]]
    };
  }
};

export interface HouseShared {
  readonly footprint: ProfileFootprint;
  readonly height: number;
  readonly roof?: ProfileRoofParameters;
  /** Unit footprint of the wall material; it sets the wall's thickness. */
  readonly wallUnit?: MaterialFootprint;
  /** Storey height of the floor bands, in metres. Default: 3.5. */
  readonly floorInterval?: number;
  /** The base the house stands on; its walls start on it. Default: the ground. */
  readonly foundation?: HouseFoundation;
}

/** Element "face": the wall chart around the whole house, closed. Its top follows the roof
 * from the shared parameters. */
export const houseWallGeometry: GeometryGenerator<HouseShared> = (p, { environment }) => {
  const envelope = profileWallEnvelope(p.footprint, p.wallUnit);
  const profile = publishProfileWall(
    {
      shape: profileShape(p.footprint),
      height: p.height,
      roof: p.roof,
      ...(p.foundation && { foundation: { height: p.foundation.height } })
    },
    ground(environment),
    true,
    envelope
  );
  const points = profile.points.map((q) => [...q]);
  // The perimeter ends where it starts; the published points agree up to float32 rounding.
  const [first, last] = [points[0], points[points.length - 1]];
  if (Math.hypot(first[0] - last[0], first[2] - last[2]) < 1e-4) points[points.length - 1] = [...first];
  const params: WallChartParams = {
    points,
    closed: true,
    top: [...profile.top],
    third: [...profile.third],
    minGround: profile.minGround,
    maxYGable: profile.maxYGable,
    topY: profile.topY,
    ...(profile.wallRoofJoint && { joint: profile.wallRoofJoint }),
    nominalOuter: envelope.nominalOuter,
    finishOuter: envelope.finishOuter,
    depthScale: envelope.depthScale
  };
  return { elements: { face: { kind: "surface", surface: { kind: "wallChart", params } } } };
};

/** The corners of a wall chart along the house perimeter, in metres: the start of one side of
 * a house, or each sharp turn of a chart around the whole house. */
export function wallChartCorners(chart: WallChartParams): number[] {
  const offset = chart.uOffset ?? 0;
  if (!chart.closed) return [offset];
  const us = [0];
  for (let i = 1; i < chart.points.length; i++)
    us.push(
      us[i - 1] + Math.hypot(chart.points[i][0] - chart.points[i - 1][0], chart.points[i][2] - chart.points[i - 1][2])
    );
  return sharpCorners(chart.points).map((i) => offset + us[i]);
}
/** Point indexes where the closed perimeter turns by more than 30°. */
function sharpCorners(points: readonly (readonly number[])[]): number[] {
  const n = points.length - 1;
  const dir = (i: number) => {
    const a = points[i],
      b = points[i + 1],
      l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    return [(b[0] - a[0]) / l, (b[2] - a[2]) / l];
  };
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = dir((i - 1 + n) % n),
      [bx, bz] = dir(i);
    if (ax * bx + az * bz < CORNER_COS) out.push(i);
  }
  return out;
}
/** Element "face": one side of the house, between two sharp corners of the shared profile.
 * Courses stay continuous with the other sides through `uOffset`. Element "outline": the
 * wall line around the whole house, a closed curve. */
export const houseWallSideGeometry: GeometryGenerator<HouseShared & { side: number }> = (p, context) => {
  const whole = houseWallGeometry(p, context).elements.face;
  if (whole.kind !== "surface") throw Error("Unexpected wall chart");
  const chart = whole.surface.params as WallChartParams;
  const corners = sharpCorners(chart.points);
  if (!(p.side >= 0 && p.side < corners.length)) throw Error(`The house has no side ${p.side}`);
  const n = chart.points.length - 1;
  const from = corners[p.side],
    to = corners[(p.side + 1) % corners.length];
  const indexes: number[] = [];
  for (let i = from; ; i = (i + 1) % n) {
    indexes.push(i);
    if (indexes.length > 1 && i === to) break;
  }
  let uOffset = 0;
  for (let i = 0; i < from; i++)
    uOffset += Math.hypot(chart.points[i + 1][0] - chart.points[i][0], chart.points[i + 1][2] - chart.points[i][2]);
  const side: WallChartParams = {
    ...chart,
    closed: false,
    points: indexes.map((i) => [...chart.points[i]]),
    top: indexes.map((i) => chart.top[i]),
    third: indexes.map((i) => chart.third[i]),
    uOffset
  };
  return {
    elements: {
      face: { kind: "surface", surface: { kind: "wallChart", params: side } },
      // The wall line around the whole house, so that rules can tell what lies inside it.
      outline: {
        kind: "curve",
        curve: { points: chart.points.slice(0, n).map((q) => [q[0], q[1], q[2]] as Vec3), closed: true }
      }
    }
  };
};

type CourseRule = "staggered_rows" | "overlap_rows" | "parallel_rows" | "horizontal_rows";
interface CourseEdge {
  edge: number;
  u: number;
  l: number;
  /** First and end column for even and odd rows. */
  c0: [number, number];
  c1: [number, number];
  offset: number;
  count: number;
  columns: number;
}
interface CourseLayout {
  rule: CourseRule;
  pitch: number;
  rowHeight: number;
  rows: number;
  edges: CourseEdge[];
  /** Slots per course position: the most pieces the removed areas cut one unit into. */
  pieces: number;
}
/** A thin joint between bricks, at most a fifth of the span. */
const joint = (span: number, gap: number) => span - Math.min(gap, span * 0.2);

/** The removed areas of a chart in its own u, also one perimeter either way on a closed chart. */
function chartHoles(context: LayingContext<{ element?: string }>, chart: WallChartParams): Rect[] {
  const removed = context.geometry.surface(context.params.element ?? "face").removed;
  if (!chart.closed) return [...removed];
  const length = wallChartSampler(chart).length;
  return removed.flatMap((r) => [-length, 0, length].map((d): Rect => [r[0] + d, r[1], r[2] + d, r[3]]));
}
/** A course position as a rectangle on the chart, or nothing where none fits. */
function courseCell(chart: WallChartParams, d: CourseLayout, e: CourseEdge, row: number, col: number) {
  const parity = row % 2;
  if (col >= e.c1[parity]) return;
  const shift = d.rule === "staggered_rows" || d.rule === "overlap_rows" ? parity * 0.5 : 0;
  const a = chart.points[e.edge - 1],
    b = chart.points[e.edge],
    { u, l } = e,
    pitch = d.pitch,
    rowHeight = d.rowHeight;
  const normal = [-(b[2] - a[2]) / l, 0, (b[0] - a[0]) / l];
  // The same arithmetic, in the same order, as the existing arrangedWallCells.
  const x = Math.max(u, (col + shift) * pitch),
    X = Math.min(u + l, (col + shift + 1) * pitch),
    t = ((x + X) / 2 - u) / l;
  const lowerA = a[1] + Math.max(0, chart.third[e.edge - 1]),
    lowerB = b[1] + Math.max(0, chart.third[e.edge]);
  const bottom =
    chart.third[e.edge - 1] > 0 || chart.third[e.edge] > 0
      ? Math.max(lowerA + ((x - u) / l) * (lowerB - lowerA), lowerA + ((X - u) / l) * (lowerB - lowerA))
      : a[1] + t * (b[1] - a[1]);
  const top = chart.joint
    ? Math.max(
        ...[x, (x + X) / 2, X].map((q) => {
          const s = (q - u) / l;
          return wallRoofJointHeight(
            chart.joint!,
            a[0] + s * (b[0] - a[0]) + normal[0] * chart.nominalOuter,
            a[2] + s * (b[2] - a[2]) + normal[2] * chart.nominalOuter
          );
        })
      )
    : chart.top[e.edge - 1] + t * (chart.top[e.edge] - chart.top[e.edge - 1]) + 0.12;
  const y = Math.max(bottom, chart.minGround + row * rowHeight),
    Y = Math.min(top, chart.minGround + (row + (d.rule === "overlap_rows" ? 1.15 : 1)) * rowHeight);
  if (X - x < 0.015 || Y - y < 0.015) return;
  return { u0: x, u1: X, lo: y, hi: Y };
}
/** A course position's pieces around the removed areas. */
const coursePieces = (cell: Piece, holes: readonly Rect[]) =>
  holes.reduce<Piece[]>((list, h) => list.flatMap((q) => subtract(q, h, cell.lo, cell.hi)), [cell]);

/** Brick courses around a wall chart: one slot per edge, row, column and piece. Each brick is
 * clipped to its edge, to the ground below and to the roof joint above, and laid in pieces
 * around the areas removed from the wall. */
export const gridCourses: LayingAlgorithm<
  { rule: CourseRule; footprint: MaterialFootprint; gap?: number; element?: string },
  CourseLayout
> = {
  info: {
    accepts: ["surface"],
    summary: "Regular courses around a wall chart, edge by edge, clipped to the ground and the roof joint.",
    params: {
      rule: "staggered_rows, overlap_rows, parallel_rows or horizontal_rows.",
      footprint: "Unit size { width, height, depth } in metres; sets the pitch and row height.",
      gap: "Joint between bricks in metres, at most a fifth of the span. Default: 0.008.",
      element: "Wall chart element id. Default: face."
    }
  },
  plan(context) {
    const p = context.params;
    const chart = chart_(context.geometry.original.elements[p.element ?? "face"]);
    const scale = unitFootprintScale(p.footprint);
    const pitch =
      p.rule === "parallel_rows"
        ? 0.22 * scale.width
        : p.rule === "horizontal_rows"
          ? 1.4 * scale.width
          : p.footprint.width;
    const rowHeight =
      p.rule === "parallel_rows"
        ? Math.max(0.2, chart.maxYGable - chart.minGround + 0.12) * scale.height
        : p.rule === "horizontal_rows"
          ? 0.3944 * scale.height
          : p.footprint.height;
    const rows = Math.ceil((chart.maxYGable + 0.12 - chart.minGround) / rowHeight);
    const shifted = p.rule === "staggered_rows" || p.rule === "overlap_rows";
    let offset = 0;
    const list: CourseEdge[] = edges(chart).map(({ edge, u, l }) => {
      const range = (shift: number): [number, number] => [
        Math.floor(u / pitch - shift),
        Math.ceil((u + l) / pitch - shift)
      ];
      const even = range(0),
        odd = range(shifted ? 0.5 : 0);
      const columns = Math.max(even[1] - even[0], odd[1] - odd[0], 0);
      const entry = {
        edge,
        u,
        l,
        c0: [even[0], odd[0]],
        c1: [even[1], odd[1]],
        offset,
        count: rows * columns,
        columns
      };
      offset += entry.count;
      return entry as CourseEdge;
    });
    const data: CourseLayout = { rule: p.rule, pitch, rowHeight, rows, edges: list, pieces: 1 };
    const holes = chartHoles(context, chart);
    if (holes.length)
      for (const e of list)
        for (let row = 0; row < rows; row++)
          for (let c = 0; c < e.columns; c++) {
            const cell = courseCell(chart, data, e, row, e.c0[row % 2] + c);
            if (cell) data.pieces = Math.max(data.pieces, coursePieces(cell, holes).length);
          }
    return { count: offset * data.pieces, data };
  },
  unitAt(context, d, index) {
    const p = context.params;
    const chart = chart_(context.geometry.original.elements[p.element ?? "face"]);
    const slot = Math.floor(index / d.pieces),
      n = index % d.pieces;
    const e = d.edges.find((x) => slot >= x.offset && slot < x.offset + x.count)!;
    const local = slot - e.offset,
      row = Math.floor(local / e.columns);
    const col = e.c0[row % 2] + (local % e.columns);
    const cell = courseCell(chart, d, e, row, col);
    if (!cell) return;
    const piece = (d.pieces > 1 ? coursePieces(cell, chartHoles(context, chart)) : [cell])[n];
    if (!piece || piece.u1 - piece.u0 < 0.015 || piece.hi - piece.lo < 0.015) return;
    const a = chart.points[e.edge - 1],
      b = chart.points[e.edge],
      { u, l } = e;
    const tangent = [(b[0] - a[0]) / l, 0, (b[2] - a[2]) / l],
      normal = [-tangent[2], 0, tangent[0]];
    const gap = p.gap ?? 0.008;
    const size: [number, number, number] = [
      joint(piece.u1 - piece.u0, gap),
      joint(piece.hi - piece.lo, gap),
      p.footprint.depth
    ];
    // A piece too small for the brick's range is left out.
    if (!unitFits(context.unit, size)) return;
    const s = ((piece.u0 + piece.u1) / 2 - u) / l;
    const uOffset = chart.uOffset ?? 0;
    return {
      key: `${e.edge}/${row}/${col}/${n}`,
      frame: {
        origin: [
          a[0] + s * (b[0] - a[0]) + normal[0] * (chart.nominalOuter - size[2] / 2),
          (piece.lo + piece.hi) / 2,
          a[2] + s * (b[2] - a[2]) + normal[2] * (chart.nominalOuter - size[2] / 2)
        ],
        x: [tangent[0], tangent[1], tangent[2]],
        y: [0, 1, 0],
        z: [normal[0], normal[1], normal[2]]
      },
      size,
      params: {
        anchor_uv: [(piece.u0 + piece.u1) / 2, (piece.lo + piece.hi) / 2 - chart.minGround],
        wallU: [uOffset + piece.u0, uOffset + piece.u1]
      }
    };
  }
};
function chart_(element: unknown): WallChartParams {
  const e = element as { kind?: string; surface?: { kind: string; params: WallChartParams } };
  if (e?.kind !== "surface" || e.surface?.kind !== "wallChart") throw Error("gridCourses lays a wall chart");
  return e.surface.params;
}

const TAU = Math.PI * 2;
/** Chart segments that turn less than this continue one run of bricks: only real corners
 * break bricks; curved walls, sampled every 0.5 m, keep their bricks whole. */
const KINK_COS = Math.cos(Math.PI / 6);
/** Only turns sharper than this are corners. */
const CORNER_COS = Math.cos(Math.PI / 6);
/** Joints closer than this to the end of a run move onto it, in metres. */
const CORNER_SNAP = 0.15;
/** Reference unit footprint that the nominal sizes are measured against. */
const REFERENCE = { width: 0.5, height: 0.4375, depth: 0.1 };

function direction(chart: WallChartParams, edge: number): [number, number] {
  const a = chart.points[edge - 1],
    b = chart.points[edge],
    l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
  return [(b[0] - a[0]) / l, (b[2] - a[2]) / l];
}
interface Run {
  u: number;
  l: number;
}
/** Chart segments merged into straight runs: bricks only break where the wall turns. */
function runs(chart: WallChartParams): Run[] {
  const out: (Run & { last: number })[] = [];
  for (const e of edges(chart)) {
    const prev = out[out.length - 1];
    if (prev) {
      const [ax, az] = direction(chart, prev.last),
        [bx, bz] = direction(chart, e.edge);
      if (ax * bx + az * bz > KINK_COS) {
        prev.l = e.u + e.l - prev.u;
        prev.last = e.edge;
        continue;
      }
    }
    out.push({ u: e.u, l: e.l, last: e.edge });
  }
  return out.map(({ u, l }) => ({ u, l }));
}
/** Position, tangent, ground and roof top of a wall chart at u. */
export function wallChartSampler(chart: WallChartParams) {
  const list = edges(chart);
  const find = (u: number) => list.find((e) => u <= e.u + e.l) ?? list[list.length - 1];
  return {
    length: list.length ? list[list.length - 1].u + list[list.length - 1].l : 0,
    at(u: number) {
      const e = find(u),
        a = chart.points[e.edge - 1],
        b = chart.points[e.edge],
        t = Math.min(1, Math.max(0, (u - e.u) / e.l));
      const tangent = [(b[0] - a[0]) / e.l, (b[2] - a[2]) / e.l];
      const x = a[0] + t * (b[0] - a[0]),
        z = a[2] + t * (b[2] - a[2]);
      const lift = Math.max(0, chart.third[e.edge - 1] + t * (chart.third[e.edge] - chart.third[e.edge - 1]));
      const ground = a[1] + t * (b[1] - a[1]) + lift;
      const roof = chart.joint
        ? wallRoofJointHeight(chart.joint, x - tangent[1] * chart.nominalOuter, z + tangent[0] * chart.nominalOuter)
        : // Without a roof joint, such as under a flat roof, the masonry ends at the wall top.
          chart.top[e.edge - 1] + t * (chart.top[e.edge] - chart.top[e.edge - 1]);
      return { x, z, tangent, ground, roof };
    }
  };
}
const scaleOf = (footprint: MaterialFootprint) => ({
  width: footprint.width / REFERENCE.width,
  height: footprint.height / REFERENCE.height,
  depth: footprint.depth / REFERENCE.depth
});

type MasonryParams = {
  /** Default: the unit's scale. */
  footprint?: MaterialFootprint;
  gap?: number;
  rowJitter?: number;
  jointJitter?: number;
  wave?: number;
  nominal?: number;
  depth?: number;
  depthJitter?: number;
  flags?: number;
  /** Chance that a tall uncut brick splits into two courses. Default: 0.4. */
  split?: number;
  /** Seed shared by the walls of one house, so their courses meet at the corners. */
  courseSeed?: number;
  /** Battlements along the top: each straight run splits into an even number of slots of
   * about `pitch` metres, and every other slot, starting with the first, is cut `height`
   * metres down from the top. Default: no battlements. */
  crenels?: { pitch?: number; height?: number };
  element?: string;
};
interface MasonryLayout {
  runs: Run[];
  length: number;
  uOffset: number;
  h: number;
  w: number;
  rows: number;
  /** First perimeter joint index of this chart, and bricks per row. */
  firstJoint: number;
  perRow: number;
  /** Slots per brick for the runs it crosses, and per run for its pieces after removed
   * areas and splits. Both are the largest counts that plan found. */
  runSlots: number;
  pieces: number;
  /** Cuts of the battlements, in chart coordinates. */
  crenels: Rect[];
}
interface Piece {
  u0: number;
  u1: number;
  lo: number;
  hi: number;
}
/** A piece minus a removed rect, by how many of the piece's corners the rect covers, as in
 * the native masonry:
 * - all four: nothing stays;
 * - two, along one side: the piece is cut back to the rect's edge;
 * - one: an L shape: the column clear of the rect keeps its full height, the other column
 *   loses the covered part;
 * - none, while the rect crosses the piece: the parts below, above, left and right stay. */
function subtract(p: Piece, h: Rect, bottom: number, top: number): Piece[] {
  const lo = Math.max(p.lo, bottom),
    hi = Math.min(p.hi, top);
  if (!(h[0] < p.u1 && p.u0 < h[2] && h[1] < hi && lo < h[3])) return [p];
  const inside = (u: number, y: number) => u >= h[0] && u <= h[2] && y >= h[1] && y <= h[3];
  const [bl, br, tl, tr] = [inside(p.u0, lo), inside(p.u1, lo), inside(p.u0, hi), inside(p.u1, hi)];
  const covered = [bl, br, tl, tr].filter(Boolean).length;
  if (covered === 4) return [];
  if (covered === 2) {
    if (bl && tl) return [{ ...p, u0: h[2] }];
    if (br && tr) return [{ ...p, u1: h[0] }];
    if (bl && br) return [{ ...p, lo: h[3] }];
    return [{ ...p, hi: h[1] }];
  }
  if (covered === 1) {
    const left = bl || tl,
      below = bl || br,
      cut = left ? h[2] : h[0];
    const clear = left ? { u0: cut, u1: p.u1 } : { u0: p.u0, u1: cut };
    const shortened = left ? { u0: p.u0, u1: cut } : { u0: cut, u1: p.u1 };
    return [
      { ...p, ...clear },
      { ...p, ...shortened, ...(below ? { lo: Math.max(p.lo, h[3]) } : { hi: Math.min(p.hi, h[1]) }) }
    ];
  }
  const out: Piece[] = [];
  if (lo < h[1]) out.push({ ...p, hi: Math.min(p.hi, h[1]) });
  if (h[3] < hi) out.push({ ...p, lo: Math.max(p.lo, h[3]) });
  const band = { lo: Math.max(p.lo, h[1]), hi: Math.min(p.hi, h[3]) };
  if (p.u0 < h[0]) out.push({ u0: p.u0, u1: h[0], ...band });
  if (h[2] < p.u1) out.push({ u0: h[2], u1: p.u1, ...band });
  return out;
}

interface CourseLines {
  /** Course line k at chart position u. */
  line(k: number, u: number): number;
  /** Joint k of row r, in chart coordinates. */
  jointAt(r: number, k: number): number;
}
/** Course lines and joints of one wall chart. Line 0 is the ground course and stays flat.
 * Lines and joints use the house perimeter and `courseSeed`, so the walls of one house
 * continue each other's courses. */
function masonryCourseLines(context: LayingContext<MasonryParams>, d: MasonryLayout): CourseLines {
  const p = context.params;
  const { chart } = masonryWall(context);
  const shared = (key: string, channel: string) =>
    (p.courseSeed === undefined
      ? context.random(key, channel)
      : new Random(deriveSeed(p.courseSeed, key, channel))
    ).next();
  const amplitude = p.wave ?? 0.012;
  // The random values of each line and joint, drawn once per wall.
  const lines = new Map<number, { jitter: number; phase1: number; phase2: number }>();
  const joints = new Map<string, number>();
  const lineOf = (k: number) => {
    let line = lines.get(k);
    if (!line) {
      line = {
        jitter: (shared(`line:${k}`, "height") - 0.5) * 2 * (p.rowJitter ?? 0.23) * d.h,
        phase1: TAU * shared(`line:${k}`, "wave1"),
        phase2: TAU * shared(`line:${k}`, "wave2")
      };
      lines.set(k, line);
    }
    return line;
  };
  return {
    line(k, u) {
      if (k === 0) return chart.minGround;
      const along = d.uOffset + u;
      const { jitter, phase1, phase2 } = lineOf(k);
      const wave =
        amplitude * (sinCos((TAU * along) / 2.3 + phase1)[0] + 0.5 * sinCos((TAU * along) / 0.9 + phase2)[0]);
      return chart.minGround + k * d.h + jitter + wave;
    },
    // Joints near the end of a run snap to it.
    jointAt(r, k) {
      const id = `${r}:${k}`;
      let u = joints.get(id);
      if (u === undefined) {
        u =
          (k + shared(`row:${r}`, "offset")) * d.w +
          (shared(`joint:${r}:${k}`, "width") - 0.5) * 2 * (p.jointJitter ?? 0.25) * d.w -
          d.uOffset;
        const free = u;
        snap: for (const run of d.runs)
          for (const end of [run.u, run.u + run.l])
            if (Math.abs(end - free) < CORNER_SNAP) {
              u = end;
              break snap;
            }
        joints.set(id, u);
      }
      return u;
    }
  };
}
/** Brick j of row r, broken where the wall turns: entry n is its part on the n-th run it touches. */
function brickRuns(courses: CourseLines, d: MasonryLayout, r: number, j: number): (readonly [number, number])[] {
  const k = d.firstJoint + j;
  const x0 = Math.max(0, courses.jointAt(r, k)),
    x1 = Math.min(d.length, courses.jointAt(r, k + 1));
  if (!(x1 - x0 > 0.03)) return [];
  return d.runs
    .map((run) => [Math.max(x0, run.u), Math.min(x1, run.u + run.l)] as const)
    .filter(([a, b]) => b - a > 0.03);
}
/** The pieces of one brick run after removed areas, such as the rows taken by corner stones,
 * and after the random split of a tall brick. */
function brickPieces(
  context: LayingContext<MasonryParams>,
  courses: CourseLines,
  d: MasonryLayout,
  r: number,
  j: number,
  parts: readonly (readonly [number, number])[],
  runPiece: number
): { pieces: Piece[] } {
  const p = context.params;
  const run = parts[runPiece];
  const whole: Piece = { u0: run[0], u1: run[1], lo: -Infinity, hi: Infinity };
  let pieces: Piece[] = [whole];
  const bottom = Math.min(courses.line(r, run[0]), courses.line(r, run[1])),
    top = Math.max(courses.line(r + 1, run[0]), courses.line(r + 1, run[1]));
  for (const hole of [...masonryWall(context).removed, ...d.crenels])
    pieces = pieces.flatMap((q) => subtract(q, hole, bottom, top));
  // A tall brick splits into two thinner ones about 40% of the time. The split height comes
  // from the brick's own seed. Only a brick that no removed area touched splits, as in the
  // native masonry.
  const splitKey = `${r}/${j}/${runPiece}`;
  if (pieces[0] === whole && top - bottom > d.h && context.random(splitKey, "split").next() < (p.split ?? 0.4)) {
    const at = bottom + (top - bottom) * (0.35 + 0.3 * context.random(splitKey, "splitAt").next());
    pieces = [
      { ...whole, hi: at },
      { ...whole, lo: at }
    ];
  }
  return { pieces };
}
/** What every brick of one part reads: the chart, its sampler, the removed areas and the
 * course lines. Kept per laying context, which belongs to one part, so the values are pure. */
interface MasonryWall {
  chart: WallChartParams;
  sample: ReturnType<typeof wallChartSampler>;
  removed: readonly Rect[];
  courses?: { data: MasonryLayout; lines: CourseLines };
}
const masonryWalls = new WeakMap<object, MasonryWall>();
function masonryWall(context: LayingContext<MasonryParams>): MasonryWall {
  let wall = masonryWalls.get(context);
  if (!wall) {
    const element = context.params.element ?? "face";
    const chart = chart_(context.geometry.original.elements[element]);
    const surface = context.geometry.surface(element);
    // Units give way both where the wall is gone and where other units occupy it.
    wall = { chart, sample: wallChartSampler(chart), removed: [...surface.removed, ...surface.reserved] };
    masonryWalls.set(context, wall);
  }
  return wall;
}
function masonryCourses_(context: LayingContext<MasonryParams>, d: MasonryLayout): CourseLines {
  const wall = masonryWall(context);
  if (wall.courses?.data !== d) wall.courses = { data: d, lines: masonryCourseLines(context, d) };
  return wall.courses.lines;
}
/** The brick size the courses scale against. */
function masonryFootprint(context: LayingContext<MasonryParams>): MaterialFootprint {
  if (context.params.footprint) return context.params.footprint;
  const [width, height, depth] = context.unit.scale ?? [1, 1, 1];
  return { width, height, depth };
}
/** Battlement cuts along the top of a chart: each run splits into an even number of slots,
 * and the even slots are cut down from the top. */
function crenelCuts(chart: WallChartParams, pitch: number, height: number): Rect[] {
  if (!(pitch > 0) || !(height > 0)) throw Error("Crenels need a positive pitch and height");
  const top = Math.max(...chart.top);
  return runs(chart).flatMap((run) => {
    const n = Math.ceil(run.l / pitch);
    const count = Math.max(2, n + (n % 2)),
      slot = run.l / count;
    return Array.from(
      { length: count / 2 },
      (_, i): Rect => [run.u + 2 * i * slot, top - height, run.u + (2 * i + 1) * slot, top + 1]
    );
  });
}
/** Element "face": the finish over the house walls, one chart around the whole house. It
 * continues the face of every host wall, so openings in the walls are openings in the finish;
 * corner stones only reserve wall area and stay under the finish. */
export const housePlasterGeometry: GeometryGenerator<HouseShared> = (p, context) => {
  const whole = houseWallGeometry(p, context).elements.face;
  if (whole.kind !== "surface") throw Error("Unexpected wall chart");
  const inherit = context.hosts.flatMap((host, index) => {
    const face = host.geometry.original.elements.face;
    if (face?.kind !== "surface" || face.surface.kind !== "wallChart") return [];
    const chart = face.surface.params as WallChartParams;
    return [{ host: index, element: "face", offset: [chart.uOffset ?? 0, 0] as [number, number] }];
  });
  if (!inherit.length) throw Error("A finish attaches to house walls");
  const wall = whole.surface.params as WallChartParams;
  // Over a flat roof with a parapet, the finish runs up the parapet and stops below its
  // battlements, one course under the roof base.
  const parapet = p.roof && isFlatRoofHeight(p.roof.height) && p.roof.flat_rim === 0;
  const top = wall.topY - 0.46 * scaleOf(p.wallUnit ?? REFERENCE).height;
  const chart: WallChartParams = {
    ...wall,
    ...(parapet && { top: wall.top.map(() => top), maxYGable: Math.max(wall.maxYGable, top) }),
    closed: true
  };
  return { elements: { face: { kind: "surface", surface: { kind: "wallChart", params: chart }, inherit } } };
};
/** Storey levels above the wall base: the wall height rounds to whole storeys, half a storey
 * up, and a band sits between every two storeys. */
export function floorLevels(height: number, interval: number): number[] {
  if (!(height >= 0) || !(interval > 0)) throw Error("Floor bands need a height and a positive interval");
  const floors = Math.max(1, Math.round(height / interval));
  return Array.from({ length: floors - 1 }, (_, i) => (i + 1) * interval);
}
/** Elements "level:k": one band chart around the whole house per storey level. A band is
 * 0.2 m tall (scaled with the wall unit) and its bottom follows the ground where the ground
 * rises above it. */
export const houseFloorBandsGeometry: GeometryGenerator<HouseShared> = (p, context) => {
  const whole = houseWallGeometry(p, context).elements.face;
  if (whole.kind !== "surface") throw Error("Unexpected wall chart");
  const wall = whole.surface.params as WallChartParams;
  const base = Math.max(...wall.points.map((q) => q[1]));
  const half = (0.2 * scaleOf(p.wallUnit ?? REFERENCE).height) / 2;
  const elements: Record<string, GeometryElement> = {};
  floorLevels(p.height, p.floorInterval ?? 3.5).forEach((level, k) => {
    const y = base + level;
    const band: WallChartParams = {
      points: wall.points.map((q) => [q[0], Math.max(y - half, q[1]), q[2]]),
      top: wall.points.map(() => y + half),
      third: wall.points.map(() => 0),
      minGround: y - half,
      maxYGable: y + half,
      topY: y + half,
      nominalOuter: wall.nominalOuter,
      finishOuter: wall.finishOuter,
      depthScale: wall.depthScale
    };
    elements[`level:${k}`] = { kind: "surface", surface: { kind: "wallChart", params: band } };
  });
  return { elements };
};
type BeltParams = {
  /** Mean brick length and joint jitter in metres, before scaling. Default: 0.69 and 0.32. */
  pitch?: number;
  jitter?: number;
  /** Band depth through the wall in metres, before scaling. Default: 0.76. */
  depth?: number;
  /** Brick shader flags. Default: 4, irregular bricks. */
  flags?: number;
};
interface BeltLayout {
  /** Per element and run: first slot, joint count and run span. */
  runs: { element: string; u: number; l: number; joints: number; offset: number }[];
  pieces: number;
}
/** One row of long bricks along each band chart, split at random joints along every
 * straight run and cut around removed areas. */
export const beltCourses: LayingAlgorithm<BeltParams, BeltLayout> = {
  info: {
    accepts: ["surface"],
    summary: "One row of long bricks along wall bands, split at random joints, cut around removed areas.",
    params: {
      pitch: "Mean brick length in metres before scaling. Default: 0.69.",
      jitter: "Joint jitter in metres before scaling. Default: 0.32.",
      depth: "Band depth through the wall in metres before scaling. Default: 0.76.",
      flags: "Brick shader flags. Default: 4."
    }
  },
  plan(context) {
    const scale = scaleOf(masonryFootprint(context as LayingContext<MasonryParams>));
    const pitch = (context.params.pitch ?? 0.69) * scale.width;
    const out: BeltLayout = { runs: [], pieces: 1 };
    let offset = 0;
    for (const element of context.geometry.ids("surface")) {
      const chart = chart_(context.geometry.original.elements[element]);
      for (const run of runs(chart)) {
        const joints = Math.max(2, Math.trunc(run.l / pitch) + 1);
        out.runs.push({ element, u: run.u, l: run.l, joints, offset });
        offset += joints - 1;
      }
    }
    // Size the piece slots from the bricks themselves.
    for (let i = 0; i < offset; i++) out.pieces = Math.max(out.pieces, beltPieces(context, out, i).length);
    return { count: offset * out.pieces, data: out };
  },
  unitAt(context, d, index) {
    const slot = Math.floor(index / d.pieces),
      piece = beltPieces(context, d, slot)[index % d.pieces];
    if (!piece) return;
    const run = d.runs.find((r) => slot >= r.offset && slot < r.offset + r.joints - 1)!;
    const chart = chart_(context.geometry.original.elements[run.element]);
    const sample = wallChartSampler(chart);
    const at0 = sample.at(piece.u0),
      at1 = sample.at(piece.u1);
    const bl = Math.max(at0.ground, piece.lo),
      br = Math.max(at1.ground, piece.lo),
      tl = Math.min(chart.topY, piece.hi),
      tr = Math.min(chart.topY, piece.hi);
    const scale = scaleOf(masonryFootprint(context as LayingContext<MasonryParams>));
    // A piece shorter than 0.1 m is not laid.
    if (Math.min(tl - bl, tr - br) < 0.1 * scale.height || piece.u1 - piece.u0 < 0.03) return;
    const chord = Math.hypot(at1.x - at0.x, at1.z - at0.z) || 1;
    return masonryUnit(
      context.unit,
      `${run.element}/${slot - slotStart(d, run)}/${index % d.pieces}`,
      { x: (at0.x + at1.x) / 2, z: (at0.z + at1.z) / 2, tangent: [(at1.x - at0.x) / chord, (at1.z - at0.z) / chord] },
      piece.u0,
      piece.u1,
      [bl, br, tl, tr],
      (context.params.depth ?? 0.76) * scale.depth,
      {
        anchor_uv: [(piece.u0 + piece.u1) / 2, (bl + br + tl + tr) / 4 - chart.minGround],
        flags: context.params.flags ?? 4,
        gap: 0,
        wallU: [(chart.uOffset ?? 0) + piece.u0, (chart.uOffset ?? 0) + piece.u1]
      }
    );
  }
};
/** First slot of a run's element, so unit keys count bricks per element. */
const slotStart = (d: BeltLayout, run: BeltLayout["runs"][number]) =>
  d.runs.find((r) => r.element === run.element)!.offset;
/** The pieces of belt brick `slot` after removed areas. */
function beltPieces(context: LayingContext<BeltParams>, d: BeltLayout, slot: number): Piece[] {
  const run = d.runs.find((r) => slot >= r.offset && slot < r.offset + r.joints - 1);
  if (!run) return [];
  const chart = chart_(context.geometry.original.elements[run.element]);
  const scale = scaleOf(masonryFootprint(context as LayingContext<MasonryParams>));
  const step = 1 / (run.joints - 1),
    amplitude = Math.min(((context.params.jitter ?? 0.32) * scale.width) / run.l, step * 0.495);
  const key = (j: number) => `${run.element}:${run.u.toFixed(6)}:${j}`;
  const joint = (j: number) =>
    run.u +
    run.l *
      (j === 0 || j === run.joints - 1
        ? j * step
        : j * step + (context.random(key(j), "joint").next() - 0.5) * amplitude);
  const j = slot - run.offset;
  let pieces: Piece[] = [{ u0: joint(j), u1: joint(j + 1), lo: chart.minGround, hi: chart.topY }];
  const surface = context.geometry.surface(run.element);
  for (const hole of [...surface.removed, ...surface.reserved])
    pieces = pieces.flatMap((q) => subtract(q, hole, chart.minGround, chart.topY));
  return pieces;
}
/** Our own masonry: random courses with wavy joints along a wall chart. Every brick is
 * computed alone, from its row, its index in the row and its piece:
 * - course line k: nominal height plus a jitter and a wave, from line k's seed;
 * - joint j of row r: regular position plus the row's offset and a jitter from (r, j);
 * - lines and joints use the house perimeter and `courseSeed`, so the walls of one house
 *   continue each other's courses;
 * - a brick breaks where the wall turns, and gives way to removed areas such as corner stones;
 * - corners follow the ground below and the roof joint above, through brick deformation. */
export const masonryCourses: LayingAlgorithm<MasonryParams, MasonryLayout> = {
  info: {
    accepts: ["surface"],
    summary: "Masonry along a wall chart: random courses with wavy joints, giving way to removed areas.",
    params: {
      footprint:
        "Unit footprint { width, height, depth }; scales the nominal size against 0.5 × 0.4375 × 0.1. Default: the unit's scale.",
      nominal: "Nominal course height and brick width in metres before scaling. Default: 0.46.",
      depth: "Brick depth through the wall in metres, scaled by the footprint depth. Default: 0.56.",
      depthJitter: "Random depth variation per brick in metres. Default: 0.07.",
      flags: "Brick shader flags; 4 turns on irregular brick shapes. Default: 4.",
      gap: "Joint between bricks in metres, at most a fifth of the span. Default: 0 (the shader draws the joints).",
      rowJitter: "Course height jitter as a fraction of the brick height. Default: 0.23.",
      jointJitter: "Joint position jitter as a fraction of the brick width. Default: 0.25.",
      wave: "Amplitude of the wavy course lines in metres. Default: 0.012.",
      courseSeed: "Seed shared by the walls of one house. Default: the part's own seed.",
      split: "Chance that a tall uncut brick splits into two thinner ones. Default: 0.4.",
      crenels:
        "Battlements { pitch, height }: every other slot of about `pitch` metres (default 0.69) along each straight run is cut `height` metres (default one course) down from the top. Default: none.",
      element: "Wall chart element id. Default: face."
    }
  },
  plan(context) {
    const p = context.params;
    const chart = chart_(context.geometry.original.elements[p.element ?? "face"]);
    const scale = scaleOf(masonryFootprint(context));
    // Calibrated against the online native masonry: 0.46 m courses and bricks.
    const h = (p.nominal ?? 0.46) * scale.height,
      w = (p.nominal ?? 0.46) * scale.width;
    const length = wallChartSampler(chart).length,
      uOffset = chart.uOffset ?? 0;
    const rows = Math.ceil((chart.maxYGable + 0.12 - chart.minGround) / h) + 1;
    const firstJoint = Math.floor(uOffset / w) - 1,
      perRow = Math.ceil((uOffset + length) / w) + 2 - firstJoint;
    const data: MasonryLayout = {
      runs: runs(chart),
      length,
      uOffset,
      h,
      w,
      rows,
      firstJoint,
      perRow,
      runSlots: 0,
      pieces: 0,
      crenels: p.crenels ? crenelCuts(chart, p.crenels.pitch ?? 0.69, p.crenels.height ?? h) : []
    };
    // Size the slots from the bricks themselves, so that empty slots stay rare.
    const courses = masonryCourses_(context, data);
    for (let r = 0; r < rows; r++)
      for (let j = 0; j < perRow; j++) {
        const parts = brickRuns(courses, data, r, j);
        data.runSlots = Math.max(data.runSlots, parts.length);
        parts.forEach((_, runPiece) => {
          data.pieces = Math.max(data.pieces, brickPieces(context, courses, data, r, j, parts, runPiece).pieces.length);
        });
      }
    return { count: rows * perRow * data.runSlots * data.pieces, data };
  },
  unitAt(context, d, index) {
    const p = context.params;
    const { chart, sample, removed } = masonryWall(context);
    const scale = scaleOf(masonryFootprint(context));
    const holePiece = index % d.pieces,
      runPiece = Math.floor(index / d.pieces) % d.runSlots,
      j = Math.floor(index / (d.pieces * d.runSlots)) % d.perRow,
      r = Math.floor(index / (d.pieces * d.runSlots * d.perRow));
    const courses = masonryCourses_(context, d);
    const { line } = courses;
    const parts = brickRuns(courses, d, r, j);
    if (!parts[runPiece]) return;
    const { pieces } = brickPieces(context, courses, d, r, j, parts, runPiece);
    if (pieces.length > d.pieces)
      throw Error(`Brick ${r}/${j}/${runPiece} has ${pieces.length} pieces; the layout has ${d.pieces} slots`);
    const piece = pieces[holePiece];
    if (!piece) return;
    const at0 = sample.at(piece.u0),
      at1 = sample.at(piece.u1);
    const bl = Math.max(line(r, piece.u0), at0.ground, piece.lo),
      br = Math.max(line(r, piece.u1), at1.ground, piece.lo),
      tl = Math.min(line(r + 1, piece.u0), at0.roof, piece.hi),
      tr = Math.min(line(r + 1, piece.u1), at1.roof, piece.hi);
    if (tl - bl < 0.03 || tr - br < 0.03 || piece.u1 - piece.u0 < 0.03) return;
    const key = `${r}/${j}/${runPiece}/${holePiece}`;
    // Bricks within half a brick of a removed area are accent stones, as in the native masonry.
    const accent = removed.some(
      (h) =>
        h[0] - d.w / 2 < piece.u1 &&
        piece.u0 < h[2] + d.w / 2 &&
        h[1] - d.h / 2 < Math.max(tl, tr) &&
        Math.min(bl, br) < h[3] + d.h / 2
    );
    const depth =
      ((p.depth ?? 0.56) + (context.random(key, "depth").next() - 0.5) * (p.depthJitter ?? 0.07)) * scale.depth;
    // Along a curved wall a brick follows the chord between its ends, as in the native masonry.
    const chord = Math.hypot(at1.x - at0.x, at1.z - at0.z) || 1;
    return masonryUnit(
      context.unit,
      key,
      { x: (at0.x + at1.x) / 2, z: (at0.z + at1.z) / 2, tangent: [(at1.x - at0.x) / chord, (at1.z - at0.z) / chord] },
      piece.u0,
      piece.u1,
      [bl, br, tl, tr],
      depth,
      {
        anchor_uv: [(piece.u0 + piece.u1) / 2, (bl + br + tl + tr) / 4 - chart.minGround],
        flags: p.flags ?? 4,
        gap: p.gap ?? 0,
        accent,
        wallU: [d.uOffset + piece.u0, d.uOffset + piece.u1]
      }
    );
  }
};
/** One brick or stone from its span along the wall and the heights of its four corners. */
function masonryUnit(
  unit: BuildingUnit,
  key: string,
  center: { x: number; z: number; tangent: number[] },
  u0: number,
  u1: number,
  [bl, br, tl, tr]: number[],
  depth: number,
  extra: { anchor_uv: number[]; flags: number; gap: number; accent?: boolean; wallU?: number[] }
): LaidUnitSpec | undefined {
  const y0 = (bl + br) / 2,
    y1 = (tl + tr) / 2;
  const size: [number, number, number] = [joint(u1 - u0, extra.gap), joint(y1 - y0, extra.gap), depth];
  if (!unitFits(unit, size)) return;
  const [tx, tz] = center.tangent;
  // Units run through the wall: their centers lie on the wall line, as in the native masonry.
  return {
    key,
    frame: { origin: [center.x, (y0 + y1) / 2, center.z], x: [tx, 0, tz], y: [0, 1, 0], z: [-tz, 0, tx] },
    size,
    params: {
      anchor_uv: extra.anchor_uv,
      // Vertical corner offsets: bottom-left, bottom-right, top-left, top-right.
      deformation: [bl - y0, br - y0, tl - y1, tr - y1],
      flags: extra.flags,
      // Accent stones look like a different stone: corner stones, and bricks next to them or to openings.
      ...(extra.accent && { accent: true }),
      // Where the unit lies along the house perimeter, in metres; the renderer maps textures by it.
      ...(extra.wallU && { wallU: extra.wallU })
    }
  };
}

/** Boundaries of the corner stone rows from bottom to top: about 0.69 m each, with a jitter. */
export function cornerStoneRows(seed: number, bottom: number, top: number, heightScale: number): number[] {
  const span = top - bottom;
  if (!(span > 0)) return [];
  const count = Math.max(2, Math.ceil(span / (0.69 * heightScale)));
  const step = 1 / (count - 1),
    amplitude = Math.min((0.21 * heightScale) / span, 0.495 * step);
  return Array.from({ length: count }, (_, i) => {
    const t =
      i === 0 || i === count - 1
        ? i * step
        : i * step + (new Random(deriveSeed(seed, "row", i)).next() - 0.5) * amplitude;
    return bottom + t * span;
  });
}
/** Width of corner stone row `row`: 0.92 m ± 0.16 m, the top row 0.76 m. */
function cornerStoneWidth(seed: number, row: number, rows: number, widthScale: number): number {
  if (row === rows - 1) return 0.76 * widthScale;
  return (0.92 + (new Random(deriveSeed(seed, "width", row)).next() - 0.5) * 0.32) * widthScale;
}
const overhang = (depthScale: number) => (0.28 + 0.0385) * depthScale;

interface CornerStoneParams {
  seed: number;
  bottom: number;
  top: number;
  scale: [number, number, number];
  /** Directions of the wall before the corner and of the wall after it. */
  before: [number, number];
  after: [number, number];
  /** Position of the corner along the house perimeter, in metres. */
  cornerU?: number;
  /** Height ranges above the base with no stones. */
  gaps?: readonly (readonly [number, number])[];
}
/** Corner stones stacked at one corner: even rows along the wall after the corner, odd rows
 * along the wall before it, each reaching past the corner by half its depth. */
/** Whether a row of corner stones overlaps one of the height ranges kept free above the base. */
const inGap = (y0: number, y1: number, bottom: number, gaps: readonly (readonly [number, number])[]) =>
  gaps.some(([from, to]) => y0 - bottom < to && y1 - bottom > from);
export const cornerStones: LayingAlgorithm<CornerStoneParams, { rows: number }> = {
  info: {
    accepts: ["point"],
    summary: "Alternating corner stones stacked at a wall corner.",
    params: {
      seed: "Seed of the corner; the wall corner rule passes it so the walls give way to the same rows.",
      bottom: "Height of the first row.",
      top: "Height of the last row.",
      scale: "Unit footprint scale [width, height, depth] against 0.5 × 0.4375 × 0.1.",
      before: "Direction [x, z] of the wall before the corner.",
      after: "Direction [x, z] of the wall after the corner."
    }
  },
  plan(context) {
    const p = context.params;
    return { count: Math.max(0, cornerStoneRows(p.seed, p.bottom, p.top, p.scale[1]).length - 1), data: { rows: 0 } };
  },
  unitAt(context, _data, row) {
    const p = context.params;
    const ys = cornerStoneRows(p.seed, p.bottom, p.top, p.scale[1]);
    if (inGap(ys[row], ys[row + 1], p.bottom, p.gaps ?? [])) return;
    const rows = ys.length - 1;
    const width = cornerStoneWidth(p.seed, row, rows, p.scale[0]),
      over = overhang(p.scale[2]);
    const corner = context.geometry.point("corner").origin;
    const [dx, dz] = row % 2 === 0 ? p.after : p.before;
    const sign = row % 2 === 0 ? 1 : -1,
      shift = width / 2 - over;
    return masonryUnit(
      context.unit,
      String(row),
      { x: corner[0] + sign * dx * shift, z: corner[2] + sign * dz * shift, tangent: [dx, dz] },
      0,
      width,
      [ys[row], ys[row], ys[row + 1], ys[row + 1]],
      0.637 * p.scale[2],
      {
        anchor_uv: [0, (ys[row] + ys[row + 1]) / 2 - p.bottom],
        flags: 4,
        gap: 0,
        accent: true,
        wallU:
          row % 2 === 0
            ? [(p.cornerU ?? 0) - over, (p.cornerU ?? 0) - over + width]
            : [(p.cornerU ?? 0) + over - width, (p.cornerU ?? 0) + over]
      }
    );
  }
};

function chartOf(view: { geometry: { original: { elements: Record<string, unknown> } } }) {
  const e = view.geometry.original.elements.face as {
    kind?: string;
    surface?: { kind: string; params: WallChartParams };
  };
  return e?.kind === "surface" && e.surface?.kind === "wallChart" ? e.surface.params : undefined;
}
const near = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[2] - b[2]) < 1e-6;
/** Two walls meet when one ends where the other starts. */
export const wallsMeet: JoinDetector = (a, b) => {
  const ca = chartOf(a),
    cb = chartOf(b);
  if (!ca || !cb) return false;
  return near(ca.points[ca.points.length - 1], cb.points[0]) || near(cb.points[cb.points.length - 1], ca.points[0]);
};
/** Peer rule between two walls that meet at a corner: both give way to a stack of
 * alternating corner stones, which the connection derives as its own part.
 * Connection param `angle`: [min, max] turn in degrees that gets stones. Default: [80, 100].
 * A part attached to the walls with a curve "cornerSpan" standing at this corner keeps the
 * heights of that curve free of stones. */
export const wallCorner: ConnectionRule = ({ parts, seed, params, attached }) => {
  const [a, b] = parts;
  const ca = chartOf(a),
    cb = chartOf(b);
  if (!ca || !cb) return { diagnostics: ["wallCorner joins wall charts"] };
  const aFirst = near(ca.points[ca.points.length - 1], cb.points[0]);
  if (!aFirst && !near(cb.points[cb.points.length - 1], ca.points[0])) return {};
  const [before, after] = aFirst ? [a, b] : [b, a];
  const cBefore = aFirst ? ca : cb,
    cAfter = aFirst ? cb : ca;
  const dirBefore = direction(cBefore, cBefore.points.length - 1),
    dirAfter = direction(cAfter, 1);
  // Corner stones only where the walls turn by 80° to 100°, as in the native masonry.
  const [minAngle, maxAngle] = (params.angle as [number, number] | undefined) ?? [80, 100];
  const turn = dirBefore[0] * dirAfter[0] + dirBefore[1] * dirAfter[1];
  if (!(turn >= sinCos((maxAngle * Math.PI) / 180)[1] && turn < sinCos((minAngle * Math.PI) / 180)[1])) return {};
  const unit = after.unit;
  if (!unit?.scale) return { diagnostics: ["wallCorner needs the wall unit's scale"] };
  const scale: [number, number, number] = [
    unit.scale[0] / REFERENCE.width,
    unit.scale[1] / REFERENCE.height,
    unit.scale[2] / REFERENCE.depth
  ];
  const corner = cAfter.points[0];
  const bottom = Math.min(corner[1], cBefore.points[cBefore.points.length - 1][1]),
    top = cAfter.top[0];
  const ys = cornerStoneRows(seed, bottom, top, scale[1]);
  const rows = ys.length - 1,
    over = overhang(scale[2]);
  const lengthBefore = wallChartSampler(cBefore).length;
  // What stands across this corner, such as a corner window, keeps its heights free of stones.
  const gaps = attached.flatMap((guest): [number, number][] => {
    const span = guest.geometry.original.elements.cornerSpan;
    if (span?.kind !== "curve") return [];
    const [lo, hi] = span.curve.points;
    return Math.hypot(lo[0] - corner[0], lo[2] - corner[2]) < 1e-3 ? [[lo[1] - bottom, hi[1] - bottom]] : [];
  });
  const modify = [];
  for (let row = 0; row < rows; row++) {
    if (inGap(ys[row], ys[row + 1], bottom, gaps)) continue;
    const width = cornerStoneWidth(seed, row, rows, scale[0]);
    const [y0, y1] = [ys[row], ys[row + 1]];
    // Even rows: the stone lies along the wall after the corner; its end shows on the wall before.
    const onAfter: Rect = [0, y0, row % 2 === 0 ? width - over : over, y1];
    const onBefore: Rect = [lengthBefore - (row % 2 === 0 ? over : width - over), y0, lengthBefore, y1];
    modify.push({ part: after.key, modification: { element: "face", op: "reserveArea" as const, rect: onAfter } });
    modify.push({ part: before.key, modification: { element: "face", op: "reserveArea" as const, rect: onBefore } });
  }
  const frame = {
    origin: [corner[0], bottom, corner[2]] as [number, number, number],
    x: [dirAfter[0], 0, dirAfter[1]] as [number, number, number],
    y: [0, 1, 0] as [number, number, number],
    z: [-dirAfter[1], 0, dirAfter[0]] as [number, number, number]
  };
  return {
    modify,
    derive: [
      {
        localId: "stones",
        type: "cornerStone",
        geometry: { elements: { corner: { kind: "point", frame } } },
        algorithm: {
          type: "cornerStones",
          params: { seed, bottom, top, scale, before: dirBefore, after: dirAfter, cornerU: cAfter.uOffset ?? 0, gaps }
        },
        // Stones reach about 1.1 m wide, 0.8 m tall and 0.67 m deep.
        unit: { ...unit, range: { min: [0.05, 0.05, 1], max: [3, 3, 8] } }
      }
    ]
  };
};

/** Where the outer faces of two walls cross: the point, each face's outward normal there and
 * each wall's chart u. Crossings closer than `clear` to an end of either face are left out:
 * corners have their own stones. */
function outerCrossings(ca: WallChartParams, cb: WallChartParams, clear: number) {
  const faces = (c: WallChartParams) =>
    edges(c).map((e) => {
      const a = c.points[e.edge - 1],
        b = c.points[e.edge];
      const tx = (b[0] - a[0]) / e.l,
        tz = (b[2] - a[2]) / e.l;
      const n = [-tz, tx];
      return {
        u: e.u,
        l: e.l,
        n,
        a: [a[0] + n[0] * c.nominalOuter, a[2] + n[1] * c.nominalOuter],
        d: [b[0] - a[0], b[2] - a[2]]
      };
    });
  const fa = faces(ca),
    fb = faces(cb);
  const ends = [
    fa[0].a,
    fb[0].a,
    ...[fa, fb].map((f) => [f.at(-1)!.a[0] + f.at(-1)!.d[0], f.at(-1)!.a[1] + f.at(-1)!.d[1]])
  ];
  const out: { point: number[]; normals: [number[], number[]]; u: [number, number] }[] = [];
  for (const a of fa)
    for (const b of fb) {
      const det = a.d[0] * b.d[1] - a.d[1] * b.d[0];
      if (Math.abs(det) < 1e-12) continue;
      const w = [b.a[0] - a.a[0], b.a[1] - a.a[1]];
      const s = (w[0] * b.d[1] - w[1] * b.d[0]) / det,
        t = (w[0] * a.d[1] - w[1] * a.d[0]) / det;
      if (s < 0 || s > 1 || t < 0 || t > 1) continue;
      const point = [a.a[0] + a.d[0] * s, a.a[1] + a.d[1] * s];
      // Faces that run nearly together have no seam between them.
      if (a.n[0] * b.n[0] + a.n[1] * b.n[1] >= 0.9) continue;
      if (ends.some((e) => Math.hypot(e[0] - point[0], e[1] - point[1]) < clear)) continue;
      out.push({ point, normals: [a.n, b.n], u: [a.u + a.l * s, b.u + b.l * t] });
    }
  return out;
}
/** Two walls of different houses cross when their outer faces do. */
const wallsCross = (ca: WallChartParams, cb: WallChartParams) => outerCrossings(ca, cb, 0).length > 0;
/** Two walls meet at a corner, where one ends and the other starts, or cross, where their
 * outer faces pass through each other. */
export const wallsTouch: JoinDetector = (a, b) => {
  const ca = chartOf(a),
    cb = chartOf(b);
  return !!ca && !!cb && (wallsMeet(a, b) || wallsCross(ca, cb));
};

/** Peer rule between two walls whose outer faces cross: the connection derives a column of
 * seam stones at each crossing. The stones face between the two faces and run from the
 * higher wall base to the lower wall top. Crossings near a corner of either wall are left to
 * its corner stones. */
export const wallCrossing: ConnectionRule = ({ parts, seed }) => {
  const [a, b] = parts;
  const ca = chartOf(a),
    cb = chartOf(b);
  if (!ca || !cb) return { diagnostics: ["wallCrossing joins wall charts"] };
  // Seam stones are the masonry's: a crossing of two timber walls has none, and next to a
  // timber wall they belong to the masonry wall's house.
  const k: number = a.unit?.source === "brick" ? 0 : b.unit?.source === "brick" ? 1 : -1;
  if (k < 0) return {};
  const unit = [a.unit, b.unit][k]!;
  const own = [a, b][1 - k].unit?.source === "brick" ? {} : { group: [a, b][k].group };
  if (!unit.scale) return { diagnostics: ["wallCrossing needs the wall unit's scale"] };
  const scale: [number, number, number] = [
    unit.scale[0] / REFERENCE.width,
    unit.scale[1] / REFERENCE.height,
    unit.scale[2] / REFERENCE.depth
  ];
  const [sa, sb] = [wallChartSampler(ca), wallChartSampler(cb)];
  const derive = outerCrossings(ca, cb, 0.2 * scale[0]).flatMap((x, i): DerivedPartSpec[] => {
    const [pa, pb] = [sa.at(x.u[0]), sb.at(x.u[1])];
    const bottom = Math.max(pa.ground, pb.ground),
      top = Math.min(pa.roof, pb.roof);
    const n = [x.normals[0][0] + x.normals[1][0], x.normals[0][1] + x.normals[1][1]];
    const length = Math.hypot(n[0], n[1]);
    if (!(top - bottom > 0.1 * scale[1]) || length < 1e-6) return [];
    const normal: [number, number] = [n[0] / length, n[1] / length];
    const frame = {
      origin: [x.point[0], bottom, x.point[1]] as [number, number, number],
      x: [normal[1], 0, -normal[0]] as [number, number, number],
      y: [0, 1, 0] as [number, number, number],
      z: [normal[0], 0, normal[1]] as [number, number, number]
    };
    return [
      {
        localId: `seam${i}`,
        type: "wallSeam",
        geometry: { elements: { seam: { kind: "point" as const, frame } } },
        algorithm: {
          type: "seamStones",
          params: {
            seed: deriveSeed(seed, "seam", i),
            bottom,
            top,
            scale,
            wallU: ([ca, cb][k].uOffset ?? 0) + x.u[k]
          }
        },
        unit: { ...unit, range: { min: [0.05, 0.05, 0.5], max: [3, 3, 8] } },
        ...own
      }
    ];
  });
  return { derive };
};
/** Peer rule between two walls: corner stones where they meet at a corner, seam stones where
 * their outer faces cross. */
export const wallJoin: ConnectionRule = (context) => {
  const [a, b] = context.parts;
  return wallsMeet(a, b) ? wallCorner(context) : wallCrossing(context);
};

interface SeamStoneParams {
  seed: number;
  bottom: number;
  top: number;
  scale: [number, number, number];
  wallU: number;
}
/** Boundaries of the seam stones from bottom to top: about half a metre each, with a jitter. */
function seamRows(p: SeamStoneParams): number[] {
  const span = p.top - p.bottom;
  const count = Math.max(2, Math.ceil((2 * span) / p.scale[1]));
  return Array.from({ length: count + 1 }, (_, i) =>
    i === 0 || i === count
      ? p.bottom + (i / count) * span
      : p.bottom + ((i + (new Random(deriveSeed(p.seed, "row", i)).next() - 0.5) * 0.6) / count) * span
  );
}
/** A column of stones over a seam where two walls cross. */
export const seamStones: LayingAlgorithm<SeamStoneParams, { rows: number }> = {
  info: {
    accepts: ["point"],
    summary: "A column of stones over the seam where two walls cross.",
    params: {
      seed: "Seed of the seam.",
      bottom: "Height of the first stone's base.",
      top: "Height of the last stone's top.",
      scale: "Unit footprint scale [width, height, depth] against 0.5 × 0.4375 × 0.1.",
      wallU: "Where the seam lies along the first wall's house perimeter, in metres."
    }
  },
  plan(context) {
    return { count: seamRows(context.params).length - 1, data: { rows: 0 } };
  },
  unitAt(context, _data, row) {
    const p = context.params;
    const ys = seamRows(p);
    const frame = context.geometry.point("seam");
    const width = (0.4 + 0.1 * (new Random(deriveSeed(p.seed, "width", row)).next() - 0.5)) * p.scale[0];
    const gap = 0.05 * p.scale[1];
    return masonryUnit(
      context.unit,
      String(row),
      { x: frame.origin[0], z: frame.origin[2], tangent: [frame.x[0], frame.x[2]] },
      0,
      width,
      [ys[row] + gap, ys[row] + gap, ys[row + 1] - gap, ys[row + 1] - gap],
      0.3 * p.scale[2],
      {
        anchor_uv: [0, (ys[row] + ys[row + 1]) / 2 - p.bottom],
        flags: 4,
        gap: 0,
        accent: true,
        wallU: [p.wallU - width / 2, p.wallU + width / 2]
      }
    );
  }
};

/** Registers the house part types into a registry. */
export function registerHouseTypes(registry: BuildingRegistry): BuildingRegistry {
  registry.surfaces.register("wallChart", wallChartSurface);
  registry.geometry.register("houseWall", houseWallGeometry);
  registry.algorithms.register("gridCourses", gridCourses);
  registry.algorithms.register("masonryCourses", masonryCourses);
  registry.algorithms.register("cornerStones", cornerStones);
  registry.algorithms.register("beltCourses", beltCourses);
  registry.geometry.register("houseFloorBands", houseFloorBandsGeometry);
  registry.geometry.register("housePlaster", housePlasterGeometry);
  registry.defaults.attach("plaster", ["wall"], "none");
  registry.defaults.attach("plaster", ["wall", "wall", "wall", "wall"], "none");
  registry.defaults.attach("floorBand", ["wall"], "none");
  registry.defaults.attach("floorBand", ["wall", "wall", "wall", "wall"], "none");
  registry.geometry.register("houseWallSide", houseWallSideGeometry);
  registry.rules.register("wallCorner", wallCorner);
  registry.rules.register("wallCrossing", wallCrossing);
  registry.rules.register("wallJoin", wallJoin);
  registry.algorithms.register("seamStones", seamStones);
  registry.defaults.join("wall", "wall", "wallJoin");
  registry.detectors.register(joinPairKey("wall", "wall"), wallsTouch);
  return registerArchTypes(
    registerEaveDormerTypes(
      registerTimberTypes(
        registerFoundationTypes(
          registerShedDormerTypes(registerDormerTypes(registerOpeningTypes(registerRoofTypes(registry))))
        )
      )
    )
  );
}
