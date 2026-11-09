// Part-type layer: ground-open arches through house walls.
// - An arch has a mount at its crown, the curve "base" on the wall line along its span, the curve
//   "arc" above it, and surfaces "opening0", "opening1", ...: rectangles that together take the
//   opening out of the wall, up to the arc. Stone covers their stepped top edge.
// - On masonry the arc is a curved shoulder rising to the crown, laid with voussoirs on two
//   stone piers. On timber it is a level lintel, drawn by the renderer as beams and braces.
import {
  joinPairKey,
  type BuildingRegistry,
  type GeometryElement,
  type GeometryGenerator,
  type LayingAlgorithm,
  type Rect,
  type Vec3
} from "../core";
import { wallChartSampler, type WallChartParams } from "./House";
import { openingMeetsBand, type WallOpeningParams } from "./Openings";

/** An arch: a fraction of the perimeter, its span between the pier axes and its height from the
 * wall's ground at its middle up to the crown. `lintel` makes it level, for timber walls. */
export interface ArchParams {
  readonly u: number;
  readonly width: number;
  readonly height: number;
  readonly lintel?: boolean;
}
/** Metres the arch's stones (or its frame, on a lintel) stand above its crown. */
const STONE_CROWN = 0.21,
  LINTEL_CROWN = 0.25;
/** Steps of the opening are at most this much apart in height or along the wall. */
const STEP_RISE = 0.15;
const STEP_RUN = 0.3;
const VOUSSOIR = 0.56;
const SAMPLES = 25;
/** Corners sharper than this are corners. */
const CORNER_COS = Math.cos(Math.PI / 6);

/** The stone arc's height above each ground sample: a cubic shoulder from half the height at
 * the piers up to the crown. */
function stoneHeights(ys: readonly number[], apex: number, scale: number): number[] {
  const n = ys.length - 1,
    base = apex - scale;
  return ys.map((y, i) => {
    const ratio = Math.min(1, Math.max(0, (apex - y) / scale));
    const shoulder = ratio * 0.5;
    const off = Math.abs(i / n - 0.5) * 2;
    const weight = 1 - off * off * off * (1 - shoulder);
    return (apex - y) * weight + Math.max(0, base - 1 - y) * (1 - weight);
  });
}

/** Elements "mount", "base", "arc" and "opening<i>". An arch that crosses a corner of its wall,
 * has its crown under the ground, or leaves no room under the wall top for its stones or frame
 * is an error. */
export const houseArchGeometry: GeometryGenerator<ArchParams> = (p, { hosts }) => {
  const walls = hosts.map((host, index) => {
    const face = host.geometry.original.elements.face;
    if (face?.kind !== "surface" || face.surface.kind !== "wallChart") throw Error("An arch attaches to house walls");
    return { index, chart: face.surface.params as WallChartParams };
  });
  const perimeter = walls.reduce((n, w) => Math.max(n, (w.chart.uOffset ?? 0) + wallChartSampler(w.chart).length), 0);
  const at = (((p.u % 1) + 1) % 1) * perimeter;
  const host = walls.find(
    (w) => at >= (w.chart.uOffset ?? 0) && at <= (w.chart.uOffset ?? 0) + wallChartSampler(w.chart).length
  );
  if (!host) throw Error(`No wall at perimeter position ${p.u}`);
  const { chart } = host,
    offset = chart.uOffset ?? 0,
    s = at - offset;
  const sample = wallChartSampler(chart);
  const along = (u: number) => {
    if (chart.closed) return sample.at(((u % sample.length) + sample.length) % sample.length);
    if (u < -1e-6 || u > sample.length + 1e-6) throw Error("The arch crosses a corner of its wall");
    return sample.at(Math.min(sample.length, Math.max(0, u)));
  };
  // Its piers stand clear of the wall's corners.
  const half = (p.width + (p.lintel ? 0.43 : 0.72)) / 2;
  const middle = along(s);
  for (let d = -half; d <= half + 1e-9; d += 0.1) {
    const t = along(s + d).tangent;
    if (t[0] * middle.tangent[0] + t[1] * middle.tangent[1] < CORNER_COS)
      throw Error("The arch crosses a corner of its wall");
  }
  const us = Array.from({ length: SAMPLES }, (_, i) => s - p.width / 2 + (p.width * i) / (SAMPLES - 1));
  const points = us.map(along);
  const ys = points.map((q) => q.ground);
  const apex = middle.ground + p.height;
  if (ys.some((y) => !(y < apex))) throw Error("The arch's crown must stand above its ground");
  // A stone arc stops at the wall top; a lintel must fit under it, frame and all.
  const heights = p.lintel
    ? ys.map((y) => apex - y)
    : stoneHeights(ys, apex, p.height).map((h, i) => Math.min(h, points[i].roof - ys[i]));
  if (points.some((q, i) => q.roof < ys[i] + heights[i] + (p.lintel ? LINTEL_CROWN : STONE_CROWN)))
    throw Error("The wall has no room above the arch for its crown");
  const base = points.map((q, i): Vec3 => [q.x, ys[i], q.z]);
  const arc = points.map((q, i): Vec3 => [q.x, ys[i] + heights[i], q.z]);
  const [x0, z0] = [points[0].x, points[0].z],
    [x1, z1] = [points.at(-1)!.x, points.at(-1)!.z],
    chord = Math.hypot(x1 - x0, z1 - z0) || 1;
  const x: Vec3 = [(x1 - x0) / chord, 0, (z1 - z0) / chord];
  const elements: Record<string, GeometryElement> = {
    mount: {
      kind: "point",
      frame: { origin: [middle.x, apex, middle.z], x, y: [0, 1, 0], z: [-x[2], 0, x[0]] },
      on: { host: host.index, element: "face", u: s, v: apex }
    },
    base: { kind: "curve", curve: { points: base } },
    arc: { kind: "curve", curve: { points: arc } }
  };
  // The opening in steps: a new step where the arc has risen or run far enough. A lintel is one.
  const steps: Rect[] = [];
  let from = 0;
  const bottom = Math.min(...ys) - 1;
  for (let i = 1; i <= SAMPLES - 1; i++) {
    const last = i === SAMPLES - 1;
    if (!p.lintel && !last && Math.abs(arc[i][1] - arc[from][1]) < STEP_RISE && us[i] - us[from] < STEP_RUN) continue;
    if (p.lintel && !last) continue;
    steps.push([us[from], bottom, us[i], (arc[from][1] + arc[i][1]) / 2]);
    from = i;
  }
  steps.forEach((rect, i) => {
    const params: WallOpeningParams = {
      host: host.index,
      rect,
      perimeter: [rect[0] + offset, rect[1], rect[2] + offset, rect[3]],
      origin: [along(rect[0]).x, rect[1], along(rect[0]).z],
      x
    };
    elements[`opening${i}`] = { kind: "surface", surface: { kind: "wallOpening", params } };
  });
  return { elements };
};

type ArchLayout = { arcs: number; piers: number[] };
const curve = (e: GeometryElement | undefined) => {
  if (e?.kind !== "curve") throw Error("archStones lays an arch");
  return e.curve.points;
};
const lengthOf = (list: readonly Vec3[]) =>
  list.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - list[i][0], q[1] - list[i][1], q[2] - list[i][2]), 0);
/** The point at arc length `t` of a polyline. */
function pointAt(list: readonly Vec3[], t: number): Vec3 {
  let rest = t;
  for (let i = 1; i < list.length; i++) {
    const [a, b] = [list[i - 1], list[i]],
      l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (rest <= l || i === list.length - 1) {
      const f = l ? rest / l : 0;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
    rest -= l;
  }
  return list[list.length - 1];
}
interface PierPiece {
  y0: number;
  y1: number;
  width: number;
  depth: number;
}
/** The stones of a pier as tall as `height`: rows about 0.56 m high at random joints, with a
 * wider cap on a tall pier and a foot under a taller one. */
function pierPieces(height: number, random: () => number): PierPiece[] {
  // Measured from 0.2 m under the ground.
  const top = height + 0.2;
  const sections = [[0, top, top <= 1.26 ? 0 : 1]];
  const out: PierPiece[] = [];
  for (const [from, to, cap] of sections) {
    const span = to - from - (cap ? 0.25 : 0);
    const n = Math.max(3, Math.ceil(span / VOUSSOIR));
    const amp = Math.min(0.28 / span, 0.495 / (n - 1));
    const joints = Array.from({ length: n }, (_, i) =>
      i === 0 || i === n - 1 ? from + (i / (n - 1)) * span : from + (i / (n - 1) + (random() - 0.5) * amp) * span
    );
    if (cap) joints.push(to);
    for (let i = 0; i + 1 < joints.length; i++) {
      if (joints[i + 1] - joints[i] < 0.01) continue;
      const isCap = !!cap && i === joints.length - 2;
      out.push({
        y0: joints[i],
        y1: joints[i + 1],
        width: isCap ? 0.7 : 0.42 + (random() * 2 - 1) * 0.05,
        depth: isCap ? 0.84 : 0.7 + (random() * 2 - 1) * 0.05
      });
    }
  }
  if (top > 2.1) out.push({ y0: -0.25 - 0.25, y1: 0, width: 0.72, depth: 0.85 });
  return out;
}
/** Voussoirs along an arch's arc, about 0.56 m long, and two stone piers under its ends. */
export const archStones: LayingAlgorithm<{ depthScale?: number }, ArchLayout> = {
  info: {
    accepts: ["curve"],
    summary: "Voussoirs along an arch's arc and stone piers under its ends.",
    params: { depthScale: "Scale of the stones' depth through the wall. Default: 1." }
  },
  plan(context) {
    const { base, arc } = context.geometry.original.elements;
    const [ground, top] = [curve(base), curve(arc)];
    const arcs = Math.max(1, Math.floor(lengthOf(top) / VOUSSOIR + 0.5));
    const heights = [0, ground.length - 1].map((i) => top[i][1] - ground[i][1]);
    // A pier stands only under an end higher than 0.3 m.
    const piers = heights.map((h) => (h > 0.3 ? pierPieces(h, () => 0.5).length : 0));
    return { count: arcs + piers[0] + piers[1], data: { arcs, piers } };
  },
  unitAt(context, d, index) {
    const { base, arc } = context.geometry.original.elements;
    const [ground, top] = [curve(base), curve(arc)];
    const depthScale = context.params.depthScale ?? 1;
    const e = context.geometry.original.elements.mount;
    const first = context.geometry.original.elements.opening0;
    // The mount's u is on its own wall; wall spans run along the house perimeter.
    const toPerimeter =
      first?.kind === "surface"
        ? (first.surface.params as WallOpeningParams).perimeter[0] - (first.surface.params as WallOpeningParams).rect[0]
        : 0;
    const u0 = (e?.kind === "point" && e.on ? e.on.u : 0) + toPerimeter;
    const planLength = ground.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - ground[i][0], q[2] - ground[i][2]), 0);
    const flags = { deformation: [0, 0, 0, 0], flags: 0 };
    if (index < d.arcs) {
      const total = lengthOf(top),
        step = total / d.arcs;
      const a = pointAt(top, index * step),
        b = pointAt(top, (index + 1) * step);
      const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const l = Math.hypot(dir[0], dir[1], dir[2]);
      const x: Vec3 = [dir[0] / l, dir[1] / l, dir[2] / l];
      const h = Math.hypot(x[0], x[2]) || 1;
      const z: Vec3 = [-x[2] / h, 0, x[0] / h];
      const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      const fraction = (t: number) => u0 - planLength / 2 + t * planLength;
      return {
        key: `arc/${index}`,
        frame: { origin: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], x, y, z },
        size: [l, 0.42, 0.7 * depthScale],
        params: { ...flags, wallU: [fraction(index / d.arcs), fraction((index + 1) / d.arcs)] }
      };
    }
    let rest = index - d.arcs,
      side = 0;
    if (rest >= d.piers[0]) {
      rest -= d.piers[0];
      side = 1;
    }
    const end = side ? ground.length - 1 : 0;
    const height = top[end][1] - ground[end][1];
    const random = context.random(`pier/${side}`, "stones");
    const piece = pierPieces(height, () => random.next())[rest];
    if (!piece) return;
    const a = ground[side ? end - 1 : 0],
      b = ground[side ? end : 1];
    const l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    const x: Vec3 = [(b[0] - a[0]) / l, 0, (b[2] - a[2]) / l];
    const base_ = ground[end][1] - 0.2;
    const wallU = u0 + (side ? 0.5 : -0.5) * planLength;
    return {
      key: `pier/${side}/${rest}`,
      frame: {
        origin: [ground[end][0], base_ + (piece.y0 + piece.y1) / 2, ground[end][2]],
        x,
        y: [0, 1, 0],
        z: [-x[2], 0, x[0]]
      },
      size: [piece.width, piece.y1 - piece.y0, piece.depth * depthScale],
      params: { ...flags, wallU: [wallU - 0.23, wallU + 0.23] }
    };
  }
};

/** Part types of arches. */
export const ARCH_MOUNTS = ["arch", "woodArch"] as const;

export function registerArchTypes(registry: BuildingRegistry): BuildingRegistry {
  registry.geometry.register("houseArch", houseArchGeometry);
  registry.algorithms.register("archStones", archStones);
  for (const type of ARCH_MOUNTS) {
    registry.defaults.join(type, "floorBand", "openingCutsBand");
    registry.detectors.register(joinPairKey(type, "floorBand"), openingMeetsBand);
    for (const walls of [1, 4])
      registry.defaults.attach(
        type,
        Array.from({ length: walls }, () => "wall"),
        "wallOpening"
      );
  }
  return registry;
}
