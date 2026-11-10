// Part-type layer: timber walls. A timber wall is a house wall laid with horizontal boards
// instead of masonry. The boards run on a line 0.125 m out from the wall's centre line, so
// that the boards of two sides cross at a corner. Rows fill the wall from its base to above
// its highest roof point; the renderer cuts the boards at the roof joint, as it cuts bricks.
import {
  Random,
  type BuildingRegistry,
  type GeometryElement,
  type LayingAlgorithm,
  type Rect,
  type Vec3
} from "../core";
import { unitFootprintScale, type MaterialFootprint } from "../runtime/MaterialFootprint";
import { wallChartSampler, type WallChartParams } from "./House";

type BoardParams = {
  footprint: MaterialFootprint;
  /** The board line's distance out from the chart's points, in metres. Default: 0.125, scaled
   * with the unit depth. */
  out?: number;
  /** How far the rows reach above the chart's highest top, in metres. Default: 0.2. */
  overshoot?: number;
};
/** A straight run of the board line: its start and direction in plan, its length, and the
 * stretch of the wall chart it covers. */
interface BoardRun {
  readonly element: string;
  readonly from: readonly [number, number];
  readonly dir: readonly [number, number];
  readonly length: number;
  readonly u0: number;
  readonly u1: number;
}
/** A region of a run that boards fill: x along the run, y up. */
interface BoardRegion {
  readonly run: number;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly rows: number;
  /** Boards a row of the region can split into, and the region's first slot. */
  readonly slots: number;
  readonly offset: number;
  /** The rows of the region laid with this run: every `step`-th, from row `phase`. */
  readonly phase: number;
  readonly step: number;
}
interface BoardLayout {
  runs: BoardRun[];
  regions: BoardRegion[];
}

/** Turns sharper than this break the boards: boards are straight. */
const KINK_COS = Math.cos((0.5 * Math.PI) / 180);
/** The board line's distance out from the wall's centre line, against a 0.1 m unit depth. */
const OUT = 0.125;
/** Row pitch and longest board, against the reference unit. */
const PITCH = 0.3944;
const LONGEST = 5;
/** Regions lower than this join a neighbour above or below. */
const NARROW = 0.1;
/** Turns gentler than this let a board span two facets of a round wall. */
const SOFT_COS = Math.cos((30 * Math.PI) / 180);
/** The furthest a board may stand off a facet it spans, in metres. */
const SAG = 0.1;
/** Boards shorter than this join the board next to them, against the reference unit. */
const SHORTEST = 0.3;

function chartOf(element: GeometryElement | undefined): WallChartParams {
  if (element?.kind !== "surface" || element.surface.kind !== "wallChart")
    throw Error("boardCourses lays a wall chart");
  return element.surface.params as WallChartParams;
}
/** The board line in straight runs, `out` metres out from the chart's points with mitred
 * corners, each with the stretch of the chart it covers. */
function boardRuns(element: string, chart: WallChartParams, out: number, phase?: number): BoardRun[] {
  const pts = chart.points.map((q) => [q[0], q[2]]);
  // A chart that ends where it starts goes all the way round.
  const closed = chart.closed === true || Math.hypot(pts[0][0] - pts.at(-1)![0], pts[0][1] - pts.at(-1)![1]) < 1e-4;
  if (closed) pts.pop();
  const n = pts.length;
  const u = [0];
  for (let i = 1; i <= (closed ? n : n - 1); i++) {
    const a = pts[i - 1],
      b = pts[i % n];
    u.push(u[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const perimeter = u[u.length - 1];
  const dirOf = (i: number) => {
    const a = pts[((i % n) + n) % n],
      b = pts[(((i + 1) % n) + n) % n],
      l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const offsetAt = (i: number) => {
    const prev = closed || i > 0 ? dirOf(i - 1) : dirOf(0),
      next = closed || i < n - 1 ? dirOf(i) : dirOf(n - 2);
    const np = [-prev[1], prev[0]],
      nn = [-next[1], next[0]];
    const k = out / Math.max(0.2, 1 + np[0] * nn[0] + np[1] * nn[1]);
    return [pts[i % n][0] + (np[0] + nn[0]) * k, pts[i % n][1] + (np[1] + nn[1]) * k];
  };
  const turns = (i: number) => {
    if (!closed && (i === 0 || i === n - 1)) return true;
    const p = dirOf(i - 1),
      q = dirOf(i);
    return p[0] * q[0] + p[1] * q[1] < KINK_COS;
  };
  let breaks = Array.from({ length: n }, (_, i) => i).filter(turns);
  if (closed && !breaks.length) breaks.push(0);
  // Every other facet of a round wall joins the next one in this row of boards.
  if (phase !== undefined) {
    // With an odd number of facets, the last facet is in the other rows' way: it stays alone
    // in one phase and joins the board before it in the other.
    const last = breaks.length - (breaks.length % 2);
    breaks = breaks.filter((_, k) => (k >= last ? phase === 0 : k % 2 !== phase));
  }
  const runs: BoardRun[] = [];
  const count = closed ? breaks.length : breaks.length - 1;
  for (let r = 0; r < count; r++) {
    const i = breaks[r],
      j = breaks[(r + 1) % breaks.length];
    const a = offsetAt(i),
      b = offsetAt(j),
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) continue;
    runs.push({
      element,
      from: [a[0], a[1]],
      dir: [(b[0] - a[0]) / length, (b[1] - a[1]) / length],
      length,
      u0: u[i],
      u1: j > i ? u[j] : u[j] + perimeter
    });
  }
  return runs;
}
/** Whether the boards of a closed, gently turning wall can span two facets each: every turn is
 * soft, and a board across two facets stands close enough to the facets' common point. */
function spansFacets(chart: WallChartParams): boolean {
  const pts = chart.points.map((q) => [q[0], q[2]]);
  if (Math.hypot(pts[0][0] - pts.at(-1)![0], pts[0][1] - pts.at(-1)![1]) < 1e-4) pts.pop();
  if (!chart.closed || pts.length < 4) return false;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [a, b, c] = [pts[(i + n - 1) % n], pts[i], pts[(i + 1) % n]];
    const p = [b[0] - a[0], b[1] - a[1]],
      q = [c[0] - b[0], c[1] - b[1]],
      lp = Math.hypot(p[0], p[1]) || 1,
      lq = Math.hypot(q[0], q[1]) || 1;
    if ((p[0] * q[0] + p[1] * q[1]) / (lp * lq) < SOFT_COS) return false;
    const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    if (Math.hypot(b[0] - m[0], b[1] - m[1]) > SAG) return false;
  }
  return true;
}
/** Run x of a chart u, and back. */
const xOf = (run: BoardRun, u: number) => ((u - run.u0) / (run.u1 - run.u0)) * run.length;
const uOf = (run: BoardRun, x: number) => run.u0 + (x / run.length) * (run.u1 - run.u0);

/** Rectangles minus a hole: the parts below and above it, and those beside it at its height. */
function subtract(regions: Rect[], hole: Rect): Rect[] {
  const out: Rect[] = [];
  for (const r of regions) {
    const [x0, y0, x1, y1] = r,
      [a, b, c, d] = hole;
    if (!(x0 < c && a < x1 && y0 < d && b < y1)) {
      out.push(r);
      continue;
    }
    const push = (q: Rect) => q[2] - q[0] > 1e-6 && q[3] - q[1] > 1e-6 && out.push(q);
    push([x0, y0, x1, Math.min(b, y1)]);
    push([x0, Math.max(d, y0), x1, y1]);
    const low = Math.max(y0, b),
      high = Math.min(y1, d);
    if (low < high) {
      push([x0, low, Math.min(a, x1), high]);
      push([Math.max(c, x0), low, x1, high]);
    }
  }
  return out;
}
/** Regions with the same span that touch become one; a region lower than 0.1 m joins the
 * touching region it overlaps most, over their common span. */
function settle(input: Rect[]): Rect[] {
  let regions = input.slice();
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < regions.length; i++)
      for (let j = 0; j < regions.length; j++) {
        if (i === j) continue;
        const [a, b] = [regions[i], regions[j]];
        if (
          Math.abs(a[0] - b[0]) <= 0.01 &&
          Math.abs(a[2] - b[2]) <= 0.01 &&
          a[1] <= b[3] + 0.001 &&
          b[1] <= a[3] + 0.001
        ) {
          const merged: Rect = [a[0], Math.min(a[1], b[1]), a[2], Math.max(a[3], b[3])];
          regions = [...regions.filter((_, k) => k !== i && k !== j), merged];
          changed = true;
          break outer;
        }
      }
  }
  for (let guard = 0; guard < 1024; guard++) {
    const i = regions.findIndex((r) => r[3] - r[1] < NARROW);
    if (i < 0) break;
    const r = regions[i];
    let best = -1,
      overlap = 0;
    regions.forEach((q, j) => {
      if (j === i) return;
      const span = Math.min(r[2], q[2]) - Math.max(r[0], q[0]);
      if (span > 0 && r[1] <= q[3] + 0.01 && q[1] <= r[3] + 0.01 && span >= overlap) {
        best = j;
        overlap = span;
      }
    });
    if (best < 0) {
      regions.splice(i, 1);
      continue;
    }
    const q = regions[best],
      lo = Math.max(r[0], q[0]),
      hi = Math.min(r[2], q[2]);
    const rest = regions.filter((_, k) => k !== i && k !== best);
    for (const [s, t] of [
      [r, [r[0], lo]],
      [r, [hi, r[2]]],
      [q, [q[0], lo]],
      [q, [hi, q[2]]]
    ] as [Rect, [number, number]][])
      if (t[1] - t[0] > 1e-6) rest.push([t[0], s[1], t[1], s[3]]);
    rest.push([lo, Math.min(r[1], q[1]), hi, Math.max(r[3], q[3])]);
    regions = rest;
  }
  return regions.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
/** The boards of a row between `x0` and `x1`, a part of the whole row. A board shorter than
 * `shortest` joins the one next to it, unless that makes it longer than `longest`. */
function clipBoards(
  boards: [number, number][],
  x0: number,
  x1: number,
  shortest: number,
  longest: number
): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of boards) {
    const lo = Math.max(a, x0),
      hi = Math.min(b, x1);
    if (hi - lo > 1e-6) out.push([lo, hi]);
  }
  for (let i = out.length - 1; i >= 0 && out.length > 1; i--)
    if (out[i][1] - out[i][0] < shortest) {
      const other = out[i > 0 ? i - 1 : 1];
      if (Math.max(other[1], out[i][1]) - Math.min(other[0], out[i][0]) > longest) continue;
      if (i > 0) other[1] = out[i][1];
      else other[0] = out[0][0];
      out.splice(i, 1);
    }
  return out;
}
/** The boards of one row: split at random between 15% and 85% while longer than `limit`. */
function rowBoards(x0: number, x1: number, limit: number, random: Random): [number, number][] {
  const out: [number, number][] = [];
  const split = (a: number, b: number) => {
    if (b - a <= limit) {
      out.push([a, b]);
      return;
    }
    const at = a + (b - a) * random.range(0.15, 0.85);
    split(a, at);
    split(at, b);
  };
  split(x0, x1);
  return out;
}

/** Horizontal boards around a wall chart. Rows of about 0.3944 m fill each straight run of
 * the board line from the wall's base to 0.2 m above its highest roof point, around the
 * areas removed from the wall: each region left between openings gets its own whole number
 * of rows. A row longer than 5 m splits at random along its whole run, and an opening only
 * cuts the boards it meets. On a round wall each board spans two facets, in alternating rows. Each board is 0.29–0.35 m thick, up to
 * 0.05 m shorter than its span and up to 0.075 m taller than its row; boards above the roof
 * or under the ground are left out. Sizes scale with the unit footprint. */
export const boardCourses: LayingAlgorithm<BoardParams, BoardLayout> = {
  info: {
    accepts: ["surface"],
    summary: "Horizontal boards round a wall chart, in rows fitted between its openings.",
    params: {
      footprint: "Unit footprint { width, height, depth } against 0.5 × 0.4375 × 0.1 m; scales the boards.",
      out: "Distance of the board line out from the chart's points, in metres. Default: 0.125, scaled with the depth.",
      overshoot: "How far the rows reach above the chart's highest top, in metres. Default: 0.2."
    }
  },
  plan(context) {
    const p = context.params;
    const scale = unitFootprintScale(p.footprint);
    const pitch = PITCH * scale.height,
      limit = LONGEST * scale.width;
    const runs: BoardRun[] = [],
      regions: BoardRegion[] = [];
    let slot = 0;
    for (const element of context.geometry.ids("surface")) {
      const chart = chartOf(context.geometry.original.elements[element]);
      const sample = wallChartSampler(chart);
      let top = sample.at(sample.length).roof;
      for (let u = 0; u < sample.length; u += 0.25) top = Math.max(top, sample.at(u).roof);
      top += p.overshoot ?? 0.2;
      const bottom = chart.minGround;
      const surface = context.geometry.surface(element);
      const out = p.out ?? OUT * scale.depth;
      // A round wall's rows take turns at which facets their boards join, so that the joints
      // of neighbouring rows fall apart.
      const phases = spansFacets(chart) ? [0, 1] : [undefined];
      for (const [phaseIndex, phase] of phases.entries())
        for (const run of boardRuns(element, chart, out, phase)) {
          const index = runs.push(run) - 1;
          let parts: Rect[] = [[0, bottom, run.length, top]];
          for (const r of surface.removedOver(run.u0, run.u1))
            parts = subtract(parts, [xOf(run, r[0]), r[1], xOf(run, r[2]), r[3]]);
          for (const [x0, y0, x1, y1] of settle(parts)) {
            const rows = Math.max(1, Math.round((y1 - y0) / pitch));
            // A row splits as a whole along its run; an opening only cuts the boards it meets.
            const slots = run.length <= limit ? 1 : Math.ceil(run.length / (0.15 * limit));
            const step = phases.length;
            regions.push({ run: index, x0, x1, y0, y1, rows, slots, offset: slot, phase: phaseIndex, step });
            slot += Math.ceil((rows - phaseIndex) / step) * slots;
          }
        }
    }
    return { count: slot, data: { runs, regions } };
  },
  unitAt(context, d, index) {
    const scale = unitFootprintScale(context.params.footprint);
    let lo = 0,
      hi = d.regions.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (d.regions[mid].offset <= index) lo = mid;
      else hi = mid - 1;
    }
    const region = d.regions[lo],
      run = d.runs[region.run],
      chart = chartOf(context.geometry.original.elements[run.element]);
    const local = index - region.offset,
      row = region.phase + region.step * Math.floor(local / region.slots),
      piece = local % region.slots;
    if (row >= region.rows) return;
    const key = `${run.element}/${region.run}/${Math.round(region.x0 * 1000)}/${Math.round(region.y0 * 1000)}/${row}`;
    const pitchRow = Math.round((region.y0 + (row * (region.y1 - region.y0)) / region.rows) / (PITCH * scale.height));
    const boards = clipBoards(
      rowBoards(
        0,
        run.length,
        LONGEST * scale.width,
        context.random(`${run.element}/${region.run}/${pitchRow}`, "split")
      ),
      region.x0,
      region.x1,
      SHORTEST * scale.width,
      LONGEST * scale.width
    );
    if (piece >= boards.length) return;
    const [x0, x1] = boards[piece];
    const h = (region.y1 - region.y0) / region.rows,
      y0 = region.y0 + row * h,
      y1 = y0 + h;
    // The roof and the ground over the board's span.
    const sample = wallChartSampler(chart);
    const offset = chart.uOffset ?? 0;
    const at = (x: number) => sample.at(((uOf(run, x) % sample.length) + sample.length) % sample.length);
    const span = [x0, (x0 + x1) / 2, x1].map(at);
    const roof = Math.max(...span.map((s) => s.roof)),
      ground = Math.min(...span.map((s) => s.ground));
    const top = Math.min(y1, roof);
    if (top - y0 < 0.05 * scale.height || y1 <= ground) return;
    const random = context.random(`${key}/${piece}`, "board");
    const thickness = (0.32 + random.range(-0.03, 0.03)) * scale.depth;
    const r = random.next();
    const jitter = 0.05 * r * scale.height,
      length = x1 - x0 - 0.05 * (1 - r) * scale.width;
    if (!(length > 0)) return;
    const height = top - y0 + 1.5 * jitter;
    const mid = (x0 + x1) / 2;
    const [tx, tz] = run.dir;
    const origin: Vec3 = [run.from[0] + tx * mid, y0 + (top - y0) / 2, run.from[1] + tz * mid];
    return {
      key: `${key}/${piece}`,
      // Planks run along their y axis, with their thickness across x and their height up z.
      frame: { origin, x: [-tz, 0, tx], y: [tx, 0, tz], z: [0, 1, 0] },
      size: [thickness, length, height],
      params: {
        wallU: [uOf(run, x0) + offset, uOf(run, x1) + offset],
        wallV: [y0, top],
        // Bevelled ends kept at their size, and short boards marked, as the native boards.
        plankFlags: 224 | (x1 - x0 + jitter < 1.5 * scale.width ? 1 : 0)
      }
    };
  }
};

export function registerTimberTypes(registry: BuildingRegistry): BuildingRegistry {
  registry.algorithms.register("boardCourses", boardCourses);
  return registry;
}
