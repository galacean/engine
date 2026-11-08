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
  type BuildingRegistry,
  type ConnectionRule,
  type GeometryGenerator,
  type JoinDetector,
  type ParticipantView,
  type Rect,
  type SurfaceKind,
  type Vec3
} from "../core";
import { wallChartSampler, type WallChartParams } from "./House";

/** Where a mounted part sits: a fraction of the perimeter, a height above the wall's base at
 * that point, and the size of its installation. Openings and follows are relative to the
 * installation's center, in metres: a follow runs along the wall from `from` to `to`, at
 * `height` above the center. */
export interface WallMountParams {
  readonly u: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  readonly openings?: readonly {
    readonly width: number;
    readonly height: number;
    readonly offset?: readonly [number, number];
  }[];
  readonly follows?: readonly { readonly from: number; readonly to: number; readonly height: number }[];
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

/** Elements "mount", "opening<i>" and "follow<i>". The mount sits on the wall at the middle
 * of the chord the installation spans, at the installation's center height; it faces out of
 * the wall. A follow samples the wall line at most 0.1 m apart. */
export const houseWallMountGeometry: GeometryGenerator<WallMountParams> = (p, { hosts }) => {
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
  const a = sample.at(Math.max(0, s - p.width / 2)),
    b = sample.at(Math.min(sample.length, s + p.width / 2));
  const chord = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const x: Vec3 = [(b.x - a.x) / chord, 0, (b.z - a.z) / chord];
  const center = sample.at(s).ground + p.bottom + p.height / 2;
  const origin: Vec3 = [(a.x + b.x) / 2, center, (a.z + b.z) / 2];
  const elements: Record<string, import("../core").GeometryElement> = {
    mount: {
      kind: "point",
      frame: { origin, x, y: [0, 1, 0], z: [-x[2], 0, x[0]] },
      on: { host: host.index, element: "face", u: s, v: center }
    }
  };
  (p.openings ?? []).forEach((opening, i) => {
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
  (p.follows ?? []).forEach((follow, i) => {
    const steps = Math.max(2, Math.ceil((follow.to - follow.from) / 0.1));
    const points = Array.from({ length: steps + 1 }, (_, k): Vec3 => {
      const at = sample.at(
        Math.min(sample.length, Math.max(0, s + follow.from + ((follow.to - follow.from) * k) / steps))
      );
      return [at.x, center + follow.height, at.z];
    });
    elements[`follow${i}`] = { kind: "curve", curve: { points } };
  });
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
  const wall = hosts[openings[0].host];
  const chart = wall && chartOf(wall);
  if (!chart) return { diagnostics: ["wallOpening needs the host wall's chart"] };
  const length = chartLength(chart);
  if (openings.some((o) => o.rect[0] < -1e-6 || o.rect[2] > length + 1e-6))
    return { diagnostics: [`${guest.key} crosses the end of its wall`] };
  return {
    modify: openings.map((o) => ({
      part: wall.key,
      modification: { element: "face", op: "removeArea" as const, rect: o.rect }
    }))
  };
};

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

/** Part types of prefabs mounted on house walls. */
export const WALL_MOUNTS = ["window", "door", "lamp"] as const;

/** Registers the wall mount part types into a registry. */
export function registerOpeningTypes(registry: BuildingRegistry): BuildingRegistry {
  registry.surfaces.register("wallOpening", wallOpeningSurface);
  registry.geometry.register("houseWallMount", houseWallMountGeometry);
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
