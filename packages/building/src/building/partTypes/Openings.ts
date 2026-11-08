// Part-type layer: prefabs mounted on house walls, such as windows, doors and wall lamps.
// - A mounted part has a point "mount" on its wall and, when it opens the wall, a surface
//   "opening": the area it takes out of the wall.
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
 * that point, and the size of its installation. The opening is relative to the
 * installation's center, in metres. */
export interface WallMountParams {
  readonly u: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  readonly opening?: { readonly width: number; readonly height: number; readonly offset?: readonly [number, number] };
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

/** Elements "mount" and, with an opening, "opening". The mount sits on the wall at the
 * middle of the chord the installation spans, at the installation's center height; it
 * faces out of the wall. */
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
  if (p.opening) {
    const [du, dv] = p.opening.offset ?? [0, 0];
    const rect: Rect = [
      s + du - p.opening.width / 2,
      center + dv - p.opening.height / 2,
      s + du + p.opening.width / 2,
      center + dv + p.opening.height / 2
    ];
    const at = sample.at(Math.max(0, rect[0]));
    const params: WallOpeningParams = {
      host: host.index,
      rect,
      perimeter: [rect[0] + offset, rect[1], rect[2] + offset, rect[3]],
      origin: [at.x, rect[1], at.z],
      x
    };
    elements.opening = { kind: "surface", surface: { kind: "wallOpening", params } };
  }
  return { elements };
};

const openingOf = (part: ParticipantView): WallOpeningParams | undefined => {
  const element = part.geometry.original.elements.opening;
  return element?.kind === "surface" && element.surface.kind === "wallOpening"
    ? (element.surface.params as WallOpeningParams)
    : undefined;
};
/** Attach rule of a mounted part: its opening comes out of the wall it sits on. An opening
 * must stay inside its wall. */
export const wallOpening: ConnectionRule = ({ guest, hosts }) => {
  const opening = guest && openingOf(guest);
  if (!guest || !opening) return {};
  const wall = hosts[opening.host];
  const chart = wall && chartOf(wall);
  if (!chart) return { diagnostics: ["wallOpening needs the host wall's chart"] };
  const length = chartLength(chart);
  if (opening.rect[0] < -1e-6 || opening.rect[2] > length + 1e-6)
    return { diagnostics: [`${guest.key} crosses the end of its wall`] };
  return { modify: [{ part: wall.key, modification: { element: "face", op: "removeArea", rect: opening.rect } }] };
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
  const [opening, bands] = openingOf(a) ? [openingOf(a)!, bandsOf(b)] : [openingOf(b), bandsOf(a)];
  return !!opening && bands.some((band) => crosses(opening, band.chart));
};
/** Peer rule between an opening and a floor band: the band gives way to the opening on every
 * level the opening crosses. Band charts run along the house perimeter. */
export const openingCutsBand: ConnectionRule = ({ parts }) => {
  const mounted = parts.find((p) => openingOf(p)),
    band = parts.find((p) => !openingOf(p));
  if (!mounted || !band) return {};
  const opening = openingOf(mounted)!;
  return {
    modify: bandsOf(band)
      .filter((b) => crosses(opening, b.chart))
      .map((b) => ({
        part: band.key,
        modification: { element: b.id, op: "removeArea" as const, rect: opening.perimeter }
      }))
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
  for (const type of WALL_MOUNTS) {
    registry.defaults.attach(type, ["wall"], "wallOpening");
    registry.defaults.attach(type, ["wall", "wall", "wall", "wall"], "wallOpening");
    registry.defaults.join(type, "floorBand", "openingCutsBand");
    registry.detectors.register(joinPairKey(type, "floorBand"), openingMeetsBand);
  }
  return registry;
}
