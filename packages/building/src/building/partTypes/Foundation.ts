// Part-type layer: the raised foundation a house stands on.
// A house with a foundation height above zero stands on a level base at the height of the
// ground under its center plus that height. The walls read the same shared value and start
// on the base. The base is solid, a skirt from the ground up to the base around the house,
// or it stands on pillars: a slab 0.24 m deep around the house, carried by columns, each
// with a foot, a shaft and a head.
import {
  joinPairKey,
  unitFits,
  type BuildingEnvironment,
  type ConnectionRule,
  type EffectiveGeometry,
  type JoinDetector,
  type ParticipantView,
  type BuildingRegistry,
  type GeometryElement,
  type GeometryGenerator,
  type LayingAlgorithm,
  type Vec3
} from "../core";
import { profileShape } from "../runtime/ProfileGeometry";
import { constructionWallOutlinePoint, profileWallEnvelope } from "../runtime/ConstructionWallEnvelope";
import { resolveConstructionFoundation } from "../runtime/ConstructionFoundation";
import { supportShapeFrame } from "../runtime/ConstructionSupportFrame";
import { unitFootprintScale, type MaterialFootprint } from "../runtime/MaterialFootprint";
import type { HouseShared, WallChartParams } from "./House";
import type { RoofDeckParams } from "./Roof";

/** The base a house stands on. Height 0 means the walls stand on the ground. */
export interface HouseFoundation {
  readonly height: number;
  /** "solid" fills the base down to the ground; "pillars" (and "auto") carries it on columns. */
  readonly mode?: "auto" | "pillars" | "solid";
}
/** Depth of the slab that the pillars carry, in metres. */
const SLAB = 0.24;

const flat = () => 0;
function terrain(environment: BuildingEnvironment) {
  const g = environment.ground ?? flat;
  return (x: number, z: number) => {
    const y = g(x, z);
    if (!Number.isFinite(y)) throw Error("The ground height must be finite");
    return y;
  };
}
function foundationOf(p: HouseShared): HouseFoundation {
  const f = p.foundation;
  if (!f || !(f.height > 0)) throw Error("A foundation part needs a foundation height above 0");
  return f;
}
/** A closed level chart: points, bottom and top heights. */
function levelChart(points: readonly (readonly number[])[], bottom: number, top: number, outer = 0): WallChartParams {
  const pts = points.map((q) => [q[0], bottom, q[2]]);
  return {
    points: pts,
    closed: true,
    top: pts.map(() => top),
    third: pts.map(() => 0),
    minGround: bottom,
    maxYGable: top,
    topY: top,
    nominalOuter: outer,
    finishOuter: outer
  };
}
const surface = (kind: string, params: object): GeometryElement => ({
  kind: "surface",
  surface: { kind, params }
});
const ring = (points: readonly (readonly number[])[], y: number): GeometryElement => ({
  kind: "curve",
  curve: { points: points.map((q) => [q[0], y, q[2]] as Vec3), closed: true }
});

/** The house perimeter where the foundation meets the ground, and the base's top height. */
function contactOf(p: HouseShared, environment: BuildingEnvironment) {
  const f = foundationOf(p);
  const shape = profileShape(p.footprint),
    envelope = profileWallEnvelope(p.footprint, p.wallUnit),
    ground = terrain(environment);
  const contact = resolveConstructionFoundation({ shape, height: f.height, terrain: ground, hostTerrain: true });
  const centre = contact.profile.points.slice(0, -1).map((q) => [q[0], q[1], q[2]]);
  const outline = centre.map((q) => constructionWallOutlinePoint(shape, q, envelope.finishOuter));
  return { shape, envelope, ground, contact, centre, outline };
}

/** A solid foundation. Element "face": the skirt around the house, a closed wall chart along
 * the wall's centre line whose finish face is the skirt's face. It runs from the ground, at
 * the centre line or at the finish face, whichever is lower, up to the level base. Element
 * "top": the base's outline at its top height, a closed curve. */
export const houseFoundationGeometry: GeometryGenerator<HouseShared> = (p, { environment }) => {
  const { envelope, ground, contact, centre, outline } = contactOf(p, environment);
  const points = centre.map((q, i) => [q[0], Math.min(q[1], ground(outline[i][0], outline[i][2])), q[2]]);
  points.push([...points[0]]);
  const chart: WallChartParams = {
    points,
    closed: true,
    top: points.map(() => contact.topY),
    third: points.map(() => 0),
    minGround: Math.min(...points.map((q) => q[1])),
    maxYGable: contact.topY,
    topY: contact.topY,
    nominalOuter: envelope.finishOuter,
    finishOuter: envelope.finishOuter
  };
  return { elements: { face: surface("wallChart", chart), top: ring(outline, contact.topY) } };
};

/** A foundation on pillars. Element "bearing": the slab's edge around the house, a closed wall
 * chart on the finish face, 0.24 m deep under the base. Elements "top" and "underside": the
 * slab's outline at its top and its bottom; the underside runs the other way round, so that it
 * faces down. Elements "pillar<i>/foot", "/shaft" and "/head": the sides of each column's
 * blocks, closed wall charts, and "pillar<i>/<block>/cap" the top of each block, a level deck.
 * A rectangle carries a column at each corner and about every 3 m between; a circle 4 to 7
 * columns, more on a longer perimeter. A column stands where the slab clears the ground by
 * more than 0.05 m, and grows wider under a higher slab. */
export const housePillarFoundationGeometry: GeometryGenerator<HouseShared> = (p, { environment }) => {
  const { shape, ground, contact, outline } = contactOf(p, environment);
  const top = contact.topY,
    underside = top - SLAB;
  const elements: Record<string, GeometryElement> = {
    bearing: surface("wallChart", levelChart([...outline, outline[0]], underside, top)),
    top: ring(outline, top),
    underside: ring(outline.slice().reverse(), underside)
  };
  const frame = supportShapeFrame(shape);
  const inset = Math.min(0.4, frame.width * 0.15, frame.depth * 0.15);
  const candidates: number[][] = [];
  if (shape.type === "circle") {
    const radius = Math.max(0.1, shape.radius - inset),
      count = Math.floor(4 + 3 * Math.min(1, Math.max(0, (Math.PI * 2 * shape.radius - 20) / 30)) + 0.5);
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI * 2) / count;
      candidates.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
  } else {
    const w = frame.width / 2 - inset,
      d = frame.depth / 2 - inset;
    const corners = [
      [-w, -d],
      [w, -d],
      [w, d],
      [-w, d]
    ];
    for (let i = 0; i < 4; i++) {
      const a = corners[i],
        b = corners[(i + 1) % 4],
        n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
      for (let j = 0; j < n; j++) candidates.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
    }
  }
  // One block of a column, square in the house's frame: its sides run clockwise seen from
  // above, so that each side faces out; its cap faces up.
  const block = (key: string, x: number, z: number, width: number, y0: number, y1: number) => {
    const h = width / 2;
    const corners = [
      [x - h, z - h],
      [x - h, z + h],
      [x + h, z + h],
      [x + h, z - h],
      [x - h, z - h]
    ].map(([u, v]) => frame.point(u, y0, v));
    elements[key] = surface("wallChart", levelChart(corners, y0, y1));
    const deck: RoofDeckParams = {
      origin: frame.point(x - h, y1, z + h) as unknown as Vec3,
      x: [frame.c, 0, frame.s],
      y: [frame.s, 0, -frame.c],
      size: [width, width]
    };
    elements[`${key}/cap`] = surface("roofDeck", deck);
  };
  candidates.forEach(([x, z], index) => {
    const point = frame.point(x, 0, z);
    const below = ground(point[0], point[2]);
    if (below + 0.05 >= underside) return;
    const t = Math.min(1, Math.max(0, (underside - below - 5) / 5)),
      smooth = t * t * (3 - 2 * t);
    const width = Math.min(0.7 * (1 + 0.5 * smooth), frame.width * 0.28, frame.depth * 0.28),
      footWidth = width * 1.35;
    // The foot reaches the ground under each of its corners, downhill as well.
    let start = below;
    for (const dx of [-footWidth / 2, footWidth / 2])
      for (const dz of [-footWidth / 2, footWidth / 2]) {
        const q = frame.point(x + dx, 0, z + dz);
        start = Math.min(start, ground(q[0], q[2]));
      }
    start -= 0.04;
    const key = `pillar${index}`,
      footTop = Math.min(underside, start + 0.18),
      headBottom = Math.max(footTop, underside - 0.16);
    block(`${key}/foot`, x, z, footWidth, start, footTop);
    if (headBottom > footTop) block(`${key}/shaft`, x, z, width, footTop, headBottom);
    if (underside > headBottom) block(`${key}/head`, x, z, width * 1.15, headBottom, underside);
  });
  return { elements };
};

/** One face that foundation courses lay: a straight run of a wall chart, or a level deck.
 * `chart` is where the face starts on the part's placement chart, which runs face after face. */
export interface FoundationFace {
  readonly element: string;
  /** First edge of a wall chart run and its number of edges; edge i runs from points[i - 1] to
   * points[i], and a run of a closed chart may wrap past its last edge. Absent on a deck. */
  readonly edges?: readonly [number, number];
  /** Start of the face along its chart's perimeter, and its length. */
  readonly u: number;
  readonly width: number;
  readonly chart: number;
}
/** Turns sharper than this are corners: only corners break units. */
const CORNER_COS = Math.cos(Math.PI / 6);
/** The straight runs of a wall chart, between its corners. */
function chartRuns(chart: WallChartParams) {
  const pts = chart.points;
  const edges: { edge: number; u: number; l: number; d: [number, number] }[] = [];
  let u = 0;
  for (let edge = 1; edge < pts.length; edge++) {
    const l = Math.hypot(pts[edge][0] - pts[edge - 1][0], pts[edge][2] - pts[edge - 1][2]);
    if (l < 1e-8) continue;
    edges.push({ edge, u, l, d: [(pts[edge][0] - pts[edge - 1][0]) / l, (pts[edge][2] - pts[edge - 1][2]) / l] });
    u += l;
  }
  const length = u,
    n = edges.length;
  const corner = (k: number) => {
    const p = edges[(k - 1 + n) % n].d,
      q = edges[k].d;
    return p[0] * q[0] + p[1] * q[1] < CORNER_COS;
  };
  // A closed chart starts its runs at a corner, so that no run ends at the chart's seam.
  const corners = edges.map((_, k) => k).filter((k) => (k > 0 || chart.closed) && corner(k));
  const start = chart.closed ? (corners[0] ?? 0) : 0;
  const runs: { first: number; count: number; u: number; width: number }[] = [];
  for (let i = 0; i < n; i++) {
    const k = (start + i) % n;
    const e = edges[k];
    const eu = e.u + (k < start ? length : 0);
    if (i === 0 || corner(k)) runs.push({ first: e.edge, count: 1, u: eu, width: e.l });
    else {
      const run = runs[runs.length - 1];
      run.count++;
      run.width += e.l;
    }
  }
  return { runs, edges, length };
}
/** The edges of a wall chart run, with where each starts and ends along the run. */
export function runEdges(chart: WallChartParams, f: FoundationFace) {
  const { edges } = chartRuns(chart);
  const index = edges.findIndex((e) => e.edge === f.edges![0]);
  const out: { a: readonly number[]; b: readonly number[]; ta: number; tb: number; s0: number; s1: number }[] = [];
  let s = 0;
  for (let k = 0; k < f.edges![1]; k++) {
    const e = edges[(index + k) % edges.length];
    out.push({
      a: chart.points[e.edge - 1],
      b: chart.points[e.edge],
      ta: chart.top[e.edge - 1],
      tb: chart.top[e.edge],
      s0: s,
      s1: s + e.l
    });
    s += e.l;
  }
  return out;
}
/** The faces of a foundation's surfaces that its modifications keep, in element order. */
export function foundationFaces(geometry: EffectiveGeometry): FoundationFace[] {
  const out: FoundationFace[] = [];
  const kept = new Set(geometry.ids("surface"));
  let chart = 0;
  for (const [element, e] of Object.entries(geometry.original.elements)) {
    if (e.kind !== "surface" || !kept.has(element)) continue;
    if (e.surface.kind === "roofDeck") {
      const width = (e.surface.params as RoofDeckParams).size[0];
      out.push({ element, u: 0, width, chart });
      chart += width;
    } else if (e.surface.kind === "wallChart") {
      const { runs, length } = chartRuns(e.surface.params as WallChartParams);
      for (const r of runs)
        out.push({ element, edges: [r.first, r.count], u: r.u, width: r.width, chart: chart + r.u });
      chart += (runs[0]?.u ?? 0) + length;
    }
  }
  return out;
}

type CourseRule = "staggered_rows" | "overlap_rows" | "parallel_rows" | "horizontal_rows";
type FoundationCourseParams = {
  footprint: MaterialFootprint;
  rule?: CourseRule;
  courses?: "hung" | "stacked";
  depth?: number;
  proud?: number;
};
interface FoundationCourseLayout {
  /** Each face, its first slot, rows, first column and columns per row. */
  faces: (FoundationFace & { offset: number; rows: number; first: number; columns: number })[];
  phase: number;
}
const isShifted = (rule: CourseRule) => rule === "staggered_rows" || rule === "overlap_rows";
const pitchOf = (rule: CourseRule, scale: { width: number }) =>
  (rule === "parallel_rows" ? 0.22 : rule === "horizontal_rows" ? 1.4 : 0.5) * scale.width;
const rowOf = (rule: CourseRule, scale: { height: number }, height: number) =>
  (rule === "parallel_rows" ? height : rule === "horizontal_rows" ? 0.3944 : 0.25) * scale.height;

/** Courses of a foundation: rows of units across each face, broken only at corners. Hung
 * courses run level round the house, hung from the top of its chart: the lowest unit of each
 * column reaches 0.04 m into the ground, and none is laid where the ground stands above the
 * top. Stacked courses start again at the bottom and the start of each face. */
export const foundationCourses: LayingAlgorithm<FoundationCourseParams, FoundationCourseLayout> = {
  info: {
    accepts: ["surface"],
    summary: "Rows of units across each face of a foundation, hung from its top or stacked on each face.",
    params: {
      footprint:
        "Unit footprint { width, height, depth } against 0.5 × 0.4375 × 0.1 m; scales the 0.5 × 0.25 m course.",
      rule: "staggered_rows (default), overlap_rows, parallel_rows or horizontal_rows.",
      courses: "hung (level round the house, from the top; default) or stacked (from each face's bottom).",
      depth: "Unit depth in metres. Default: to the centre line, twice the chart's finish offset.",
      proud: "How far a unit stands out of its face, in metres. Default: 0."
    }
  },
  plan(context) {
    const p = context.params,
      rule = p.rule ?? "staggered_rows",
      scale = unitFootprintScale(p.footprint),
      pitch = pitchOf(rule, scale);
    const elements = context.geometry.original.elements;
    const hung = (p.courses ?? "hung") === "hung";
    let offset = 0;
    const faces = foundationFaces(context.geometry).map((f) => {
      const g = faceGeometry(elements, f);
      const lo = g.lowest(0, f.width);
      const rowHeight = rowOf(rule, scale, hung ? g.chartHeight : g.top - lo);
      const rows = Math.max(0, Math.ceil((g.top - lo) / rowHeight - 1e-9));
      const start = hung ? f.u : 0;
      const first = Math.floor(start / pitch) - 1,
        columns = Math.ceil((start + f.width) / pitch) + 1 - first;
      const entry = { ...f, offset, rows, first, columns };
      offset += rows * columns;
      return entry;
    });
    return { count: offset, data: { faces, phase: context.random("phase").next() } };
  },
  unitAt(context, d, index) {
    const p = context.params,
      rule = p.rule ?? "staggered_rows",
      scale = unitFootprintScale(p.footprint),
      pitch = pitchOf(rule, scale),
      hung = (p.courses ?? "hung") === "hung";
    const elements = context.geometry.original.elements;
    // The last face whose first slot is at or before the index.
    let lo_ = 0,
      hi_ = d.faces.length - 1;
    while (lo_ < hi_) {
      const mid = (lo_ + hi_ + 1) >> 1;
      if (d.faces[mid].offset <= index) lo_ = mid;
      else hi_ = mid - 1;
    }
    const f = d.faces[lo_];
    const local = index - f.offset,
      row = Math.floor(local / f.columns),
      col = f.first + (local % f.columns);
    const shift = (d.phase + (isShifted(rule) ? (row % 2) * 0.5 : 0)) % 1;
    const g = faceGeometry(elements, f);
    const top = g.top,
      lo = g.lowest(0, f.width);
    const rowHeight = rowOf(rule, scale, hung ? g.chartHeight : top - lo);
    const start = hung ? f.u : 0;
    let x0 = Math.max(start, (col + shift) * pitch) - start,
      x1 = Math.min(start + f.width, (col + shift + 1) * pitch) - start;
    if (!(x1 - x0 > 0.01)) return;
    let y0: number, y1: number;
    if (hung) {
      // Only where the ground lies below the top.
      const exposed = g.below(x0, x1, top);
      if (!exposed) return;
      [x0, x1] = exposed;
      if (!(x1 - x0 > 0.01)) return;
      // Down from the level top; the lowest piece of a column reaches into the ground.
      y1 = top - row * rowHeight;
      y0 = Math.max(y1 - rowHeight * (rule === "overlap_rows" ? 1.15 : 1), g.lowest(x0, x1) - 0.04);
    } else {
      y0 = lo + row * rowHeight;
      y1 = Math.min(top, lo + (row + (rule === "overlap_rows" ? 1.15 : 1)) * rowHeight);
    }
    if (!(y1 - y0 > 0.01)) return;
    const depth = p.depth ?? 2 * g.outer,
      proud = p.proud ?? 0;
    const size: Vec3 = [x1 - x0, y1 - y0, depth];
    // A piece too small for the unit's range is left out.
    if (!unitFits(context.unit, size)) return;
    return {
      key: `${f.element}/${f.edges?.[0] ?? 0}/${row}/${col}`,
      frame: g.frame(x0, x1, (y0 + y1) / 2, g.outer + proud - depth / 2),
      size,
      params: { anchor_uv: [f.chart + (x0 + x1) / 2, (y0 + y1) / 2 - g.bottom] }
    };
  }
};
const cross = (a: readonly number[], b: readonly number[]): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
/** A face as a laying algorithm sees it: its top, the ground along it and the frame of a unit
 * from `x0` to `x1` along it, at height `y`, `out` metres out of its chart's points. A deck's
 * rows run across its depth, from 0. `bottom` is the base of the placement chart. */
function faceGeometry(elements: Readonly<Record<string, GeometryElement>>, f: FoundationFace) {
  const e = elements[f.element];
  if (e.kind !== "surface") throw Error("A foundation face is a surface");
  if (e.surface.kind === "roofDeck") {
    const deck = e.surface.params as RoofDeckParams;
    const z = cross(deck.x, deck.y);
    return {
      top: deck.size[1],
      bottom: 0,
      chartHeight: deck.size[1],
      outer: 0,
      lowest: () => 0,
      below: (x0: number, x1: number): [number, number] => [x0, x1],
      frame: (x0: number, x1: number, y: number, out: number) => ({
        origin: [0, 1, 2].map(
          (k) => deck.origin[k] + deck.x[k] * (x0 + x1) * 0.5 + deck.y[k] * y + z[k] * out
        ) as unknown as Vec3,
        x: [...deck.x] as Vec3,
        y: [...deck.y] as Vec3,
        z
      })
    };
  }
  const chart = e.surface.params as WallChartParams;
  const edges = runEdges(chart, f);
  const at = (s: number) => {
    const e = edges.find((q) => s <= q.s1) ?? edges[edges.length - 1];
    const t = (s - e.s0) / (e.s1 - e.s0);
    return [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t, e.a[2] + (e.b[2] - e.a[2]) * t];
  };
  // The ground at both ends and at each point between.
  const knots = (x0: number, x1: number) => [
    [x0, at(x0)[1]],
    ...edges.filter((q) => q.s1 > x0 && q.s1 < x1).map((q) => [q.s1, q.b[1]]),
    [x1, at(x1)[1]]
  ];
  return {
    top: chart.topY,
    bottom: chart.minGround,
    chartHeight: chart.topY - chart.minGround,
    outer: chart.finishOuter,
    lowest: (x0: number, x1: number) => Math.min(...knots(x0, x1).map((k) => k[1])),
    /** Where the ground lies below `top`, from its first such point to its last. */
    below(x0: number, x1: number, top: number): [number, number] | undefined {
      const k = knots(x0, x1);
      let first = Infinity,
        last = -Infinity;
      for (let i = 0; i + 1 < k.length; i++) {
        const [sa, ga] = k[i],
          [sb, gb] = k[i + 1];
        if (ga >= top && gb >= top) continue;
        const at = sa + ((top - ga) / (gb - ga)) * (sb - sa);
        first = Math.min(first, ga < top ? sa : at);
        last = Math.max(last, gb < top ? sb : at);
      }
      return first < last ? [first, last] : undefined;
    },
    frame(x0: number, x1: number, y: number, out: number) {
      const a = at(x0),
        b = at(x1),
        l = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const tx = (b[0] - a[0]) / l,
        tz = (b[2] - a[2]) / l;
      return {
        origin: [(a[0] + b[0]) / 2 - tz * out, y, (a[2] + b[2]) / 2 + tx * out] as Vec3,
        x: [tx, 0, tz] as Vec3,
        y: [0, 1, 0] as Vec3,
        z: [-tz, 0, tx] as Vec3
      };
    }
  };
}

/** The columns of a foundation that stand inside another house's walls, where its slab's
 * underside lies between their base and their top: the elements of each such column. */
function columnsInside(foundation: ParticipantView, wall: ParticipantView): string[] {
  if (foundation.group === wall.group) return [];
  const elements = foundation.geometry.original.elements;
  const underside = elements.underside;
  const face = wall.geometry.original.elements.face,
    line = wall.geometry.original.elements.outline;
  if (underside?.kind !== "curve" || face?.kind !== "surface" || face.surface.kind !== "wallChart") return [];
  const chart = face.surface.params as WallChartParams;
  const y = underside.curve.points[0][1];
  if (y < chart.minGround || y > Math.max(chart.maxYGable, ...chart.top)) return [];
  const polygon = line?.kind === "curve" ? line.curve.points : chart.points;
  const kept = new Set(foundation.geometry.ids());
  const out: string[] = [];
  for (const id of kept) {
    const m = /^(pillar\d+)\/foot$/.exec(id);
    const foot = elements[id];
    if (!m || foot.kind !== "surface") continue;
    const corners = (foot.surface.params as WallChartParams).points.slice(0, 4);
    const x = corners.reduce((n, q) => n + q[0], 0) / 4,
      z = corners.reduce((n, q) => n + q[2], 0) / 4;
    if (inside(polygon, x, z)) out.push(...[...kept].filter((k) => k.startsWith(m[1] + "/")));
  }
  return out;
}
function inside(polygon: readonly (readonly number[])[], x: number, z: number) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a[2] > z !== b[2] > z && x < ((b[0] - a[0]) * (z - a[2])) / (b[2] - a[2]) + a[0]) hit = !hit;
  }
  return hit;
}
const foundationAndWall = (a: ParticipantView, b: ParticipantView): [ParticipantView, ParticipantView] =>
  a.type === "foundation" ? [a, b] : [b, a];
/** A foundation meets another house's wall where one of its columns stands inside that house. */
export const columnsUnderNeighbour: JoinDetector = (a, b) => columnsInside(...foundationAndWall(a, b)).length > 0;
/** Peer rule between a foundation and another house's wall: the columns that would pierce that
 * house are left out. */
export const foundationUnderNeighbour: ConnectionRule = ({ parts }) => {
  const [foundation, wall] = foundationAndWall(parts[0], parts[1]);
  return {
    modify: columnsInside(foundation, wall).map((element) => ({
      part: foundation.key,
      modification: { element, op: "removeElement" as const }
    }))
  };
};

export function registerFoundationTypes(registry: BuildingRegistry): BuildingRegistry {
  registry.geometry.register("houseFoundation", houseFoundationGeometry);
  registry.geometry.register("housePillarFoundation", housePillarFoundationGeometry);
  registry.algorithms.register("foundationCourses", foundationCourses);
  registry.rules.register("foundationUnderNeighbour", foundationUnderNeighbour);
  registry.defaults.join("foundation", "wall", "foundationUnderNeighbour");
  registry.detectors.register(joinPairKey("foundation", "wall"), columnsUnderNeighbour);
  return registry;
}
