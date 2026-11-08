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
  type GeometryGenerator,
  type JoinDetector,
  type ParticipantView,
  type Rect,
  type SurfaceKind,
  type Vec3
} from "../core";
import { wallChartSampler, type WallChartParams } from "./House";

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
 * opening in its own x/y plane, the members that bend along the wall, and how much its
 * opening narrows on a curved wall. */
export interface PrefabFacts {
  readonly bounds: { readonly min: readonly number[]; readonly max: readonly number[] };
  readonly openings: readonly { readonly min: readonly number[]; readonly max: readonly number[] }[];
  readonly units: readonly { readonly matrix: readonly number[]; readonly span?: readonly [number, number] }[];
  readonly curvedNarrowing: number;
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
  const a = sample.at(Math.max(0, s - p.width / 2)),
    b = sample.at(Math.min(sample.length, s + p.width / 2));
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
  follows.forEach((follow, i) => {
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

interface MountPrefabParams {
  readonly width: number;
  readonly height: number;
  /** Renderer values carried on the laid unit. */
  readonly unitParams?: Readonly<Record<string, unknown>>;
}
/** Lays a part's building prefab at its mount, scaled to the installation size. The prefab's
 * origin lies on the wall line and the center of its bounds on the mount across and up the
 * wall; it is resized about its back, so it keeps its distance from the wall at every size.
 * The unit's pivot must be the middle of the back: [0.5, 0.5, 0]. */
export const mountPrefab: LayingAlgorithm<MountPrefabParams, null> = {
  info: {
    accepts: ["point"],
    summary: 'One building prefab at the point "mount", scaled to the installation size.',
    params: {
      width: "Installation width in metres.",
      height: "Installation height in metres.",
      unitParams: "Values the renderer reads from the laid unit."
    }
  },
  plan: () => ({ count: 1, data: null }),
  unitAt(context) {
    const bounds = context.unit.bounds;
    if (!bounds) throw Error("mountPrefab needs the prefab's bounds");
    const { width, height } = context.params;
    const sx = width / (bounds.max[0] - bounds.min[0]),
      sy = height / (bounds.max[1] - bounds.min[1]),
      sz = Math.min(sx, sy);
    const frame = context.geometry.point("mount");
    const back = bounds.min[2];
    return {
      key: "0",
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
  registry.algorithms.register("mountPrefab", mountPrefab);
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
