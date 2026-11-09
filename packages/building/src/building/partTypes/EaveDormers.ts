// Part-type layer: eave dormers, windows that stand on a wall and break through its eave.
// - An eave dormer is a wall prefab, with the wall mount's point "mount", openings and members
//   that follow the wall. It attaches to the walls and the roof parts of its house, walls first.
// - It carries a small roof out of the roof. A prefab with a roof profile carries an arch, swept
//   back from a little in front of the wall into the roof and cut off at the wall top; the
//   others carry a shed, lofted through the roof's contours from the eave to its back.
// - The attach rule opens the wall, takes the dormer's footprint out of the roof part behind it
//   and derives the small roof. An arch opens the roof from the eave back to the wall line.
import {
  add,
  joinPairKey,
  scale,
  type BuildingRegistry,
  type ConnectionRule,
  type EffectiveSurface,
  type GeometryElement,
  type GeometryGenerator,
  type ParticipantView,
  type Rect,
  type Vec3
} from "../core";
import {
  coveringRise,
  depthToHeight,
  dormerCap,
  dormerTile,
  roofUnder,
  slopeSurface,
  surfaceAtPlan,
  type DormerSweepParams
} from "./Dormers";
import { shedTile, vAtHeight, type LoftParams } from "./ShedDormers";
import {
  houseWallMountGeometry,
  openingMeetsBand,
  prefabFacts,
  prefabScale,
  wallOpening,
  type WallMountParams
} from "./Openings";
import { wallChartSampler, type WallChartParams } from "./House";

/** A wall mount, and the shed of a prefab that carries no arch: how far it reaches past the
 * window on each side and in front at the eave, how much higher its back stands than its front
 * as a fraction of the roof's height, and how much wider than the window the eave is cut, for
 * shutters that open across it. Lengths are in metres at the prefab's own size. */
export interface EaveMountParams extends WallMountParams {
  readonly overhang?: number;
  readonly expand?: number;
  readonly pitch?: number;
  readonly clearance?: number;
}
const UP: Vec3 = [0, 1, 0];
const chartOf = (host: ParticipantView): WallChartParams | undefined => {
  const face = host.geometry.original.elements.face;
  return face?.kind === "surface" && face.surface.kind === "wallChart"
    ? (face.surface.params as WallChartParams)
    : undefined;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** The right half of an outline, cut off where it comes down to `floor`. */
function cutOutline(half: readonly (readonly [number, number])[], floor: number) {
  const out = [half[0]];
  for (let i = 1; i < half.length; i++) {
    const [a, b] = [half[i - 1], half[i]];
    if (b[1] < floor) {
      const t = (floor - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, floor]);
      break;
    }
    out.push(b);
  }
  return out;
}

/** The wall mount's elements, and:
 * - "eave", the roof point behind the window, which records the roof part it lies on;
 * - with a roof profile, "sweep" and "ridge": the outline, cut off at the wall top, swept from
 *   the prefab's `eaveOut` in front of the wall back until the peak meets the roof;
 * - otherwise "shed" and "front": rows along the roof's contours from the wall top to the
 *   height of the shed's back, each `expand` further out at the eave and none at the back,
 *   standing from the window's top up to the back; the curve "front" is the window's width
 *   behind the wall. With a clearance, "clearance" is that width and the clearance.
 * An eave dormer that stays below the wall top, stands above it entirely, sits on a gable-end
 * wall or crosses an edge of its roof part is an error. */
export const houseEaveMountGeometry: GeometryGenerator<EaveMountParams> = (p, context) => {
  const { hosts, environment } = context;
  const count = hosts.findIndex((h) => !chartOf(h));
  if (count <= 0) throw Error("An eave dormer needs walls and a pitched roof");
  const roofs = hosts.slice(count);
  if (roofs.some((h) => !slopeSurface(h))) throw Error("An eave dormer needs a pitched roof");
  const walled = houseWallMountGeometry(p, { ...context, hosts: hosts.slice(0, count) });
  const elements: Record<string, GeometryElement> = { ...walled.elements };
  const mount = elements.mount;
  if (mount?.kind !== "point" || !mount.on) throw Error("An eave dormer needs a wall mount");
  const facts = prefabFacts(environment, p.prefab);
  const { min, max } = facts.bounds;
  const [sx, sy] = prefabScale(facts, p.width, p.height);
  const { x, z } = mount.frame;
  const pivot = add(
    add(mount.frame.origin, scale(x, -((min[0] + max[0]) / 2) * sx)),
    scale(UP, -((min[1] + max[1]) / 2) * sy)
  );
  const chart = chartOf(hosts[mount.on.host])!;
  const sample = wallChartSampler(chart);
  const wallTop = sample.at(mount.on.u).roof;
  const height = (max[1] - min[1]) * sy,
    middle = ((min[1] + max[1]) / 2) * sy;
  const inward = add(pivot, scale(z, -0.3));
  // Behind a gable-end wall no slope comes down to the wall.
  if (!roofs.some((h) => surfaceAtPlan(slopeSurface(h)!, inward[0], inward[2])))
    throw Error("An eave dormer cannot stand on a gable-end wall");
  const roof = roofUnder(roofs, [inward[0], inward[2]]);
  if (roof.z[0] * z[0] + roof.z[2] * z[2] < 0.5) throw Error("An eave dormer cannot stand on a gable-end wall");
  // The window's top half stands clear of the wall.
  if (!(pivot[1] + (height + middle) / 2 > wallTop)) throw Error("The window must cross the eave above it");
  if (!(pivot[1] + min[1] * sy < wallTop)) throw Error("The window stands above its wall");
  const { surface, hit } = roof;
  const host = roofs[roof.index];
  const near = [hit.u, hit.v] as const;
  const onRoof = { host: count + roof.index, element: "slope", u: hit.u, v: hit.v };
  elements.eave = { kind: "point", frame: hit.frame, on: onRoof };
  const half = facts.roofProfile;
  if (half?.length) {
    const [a, b] = [
      sample.at(Math.max(0, mount.on.u - p.width / 2)),
      sample.at(Math.min(sample.length, mount.on.u + p.width / 2))
    ];
    const curved = a.tangent[0] * b.tangent[0] + a.tangent[1] * b.tangent[1] < 1 - 1e-9;
    const out = curved ? (facts.eaveOutCurved ?? 0) : (facts.eaveOut ?? 0);
    const origin = add(pivot, scale(z, out));
    const scaled = half.map(([px, py]) => [px * sx, py * sy] as const);
    const right = cutOutline(scaled, wallTop - pivot[1]);
    const outline = [
      ...right
        .slice(1)
        .reverse()
        .map(([px, py]) => [-px, py] as const),
      ...right
    ];
    const peak = right[0][1];
    const back = scale(z, -1);
    const depth = depthToHeight(surface, origin, back, origin[1] + peak, near);
    if (depth === undefined) throw Error("The dormer reaches above its roof");
    const sweep: DormerSweepParams = { origin, x, z, outline, depth };
    const top = add(origin, [0, peak, 0]);
    elements.sweep = { kind: "surface", surface: { kind: "dormerSweep", params: sweep } };
    // The arch's width where it comes down to the wall top, on the wall line: the eave is open
    // from there out; behind the wall the arch's steps open the roof.
    const reach = 2 * right[right.length - 1][0];
    elements.front = {
      kind: "curve",
      curve: { points: [-0.5, 0, 0.5].map((t) => add(pivot, scale(x, t * reach)) as Vec3) }
    };
    elements.ridge = {
      kind: "curve",
      curve: { points: [add(top, scale(back, depth)), add(top, scale(z, depth * 0.05))] }
    };
    return { elements };
  }
  // A shed: rows along the contours from the wall top to the height of its back.
  const { domain } = surface;
  const lift = coveringRise(host, roof.n);
  const span = (max[0] - min[0]) * sx;
  const width = span + 2 * (p.overhang ?? 0) * sx;
  const along = (s: number, v: number) => {
    const h = 1e-4 * (domain.u[1] - domain.u[0]);
    const a = surface.frame(hit.u, v).origin,
      b = surface.frame(hit.u + h, v).origin;
    const u = hit.u + (s * h) / Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (!domain.closedU && (u < domain.u[0] - 1e-9 || u > domain.u[1] + 1e-9))
      throw Error("The dormer crosses an edge of its roof");
    return u;
  };
  const front = pivot[1] + max[1] * sy;
  const peak = surface.frame(hit.u, domain.v[1]).origin[1],
    base = surface.frame(hit.u, domain.v[0]).origin[1];
  const back = front + (p.pitch ?? 0) * (peak - base);
  const vBack = vAtHeight(surface, hit.u, back - lift);
  if (vBack === undefined || !(back > wallTop)) throw Error("The dormer reaches above its roof");
  const vFront = vAtHeight(surface, hit.u, wallTop) ?? domain.v[0];
  const depth = Math.hypot(...add(surface.frame(hit.u, vBack).origin, scale(surface.frame(hit.u, vFront).origin, -1)));
  const rowCount = Math.max(2, Math.ceil(depth / 0.2) + 1),
    across = 9;
  const expand = (p.expand ?? 0) * sx;
  const rows = Array.from({ length: rowCount }, (_, k) => {
    const t = k / (rowCount - 1);
    const v = k === rowCount - 1 ? vBack : (vAtHeight(surface, hit.u, lerp(wallTop, back - lift, t)) ?? domain.v[0]);
    const samples = Array.from(
      { length: across },
      (_, j) => surface.frame(along(width * (j / (across - 1) - 0.5), v), v).origin
    );
    const out = (1 - t) * expand;
    const y = lerp(front, back, t);
    return {
      points: samples.map((q): Vec3 => [q[0] + roof.z[0] * out, y, q[2] + roof.z[2] * out]),
      floor: samples.map((q) => q[1] + lift)
    };
  });
  elements.shed = { kind: "surface", surface: { kind: "loft", params: { rows } satisfies LoftParams } };
  const across2 = (w: number) => [-0.5, 0, 0.5].map((t) => add(add(inward, scale(x, t * w)), [0, lift, 0]) as Vec3);
  elements.front = { kind: "curve", curve: { points: across2(span) } };
  if (p.clearance) elements.clearance = { kind: "curve", curve: { points: across2(span + p.clearance * sx) } };
  return { elements };
};

/** The depth of one band of an eave opening, in metres, the most bands an opening has, and how
 * far each band overlaps the next, so that no seam opens between them. */
const EAVE_BAND = 0.12;
const EAVE_BANDS = 4;
const EAVE_BAND_OVERLAP = 0.02;
/** The opening an eave dormer makes in the roof, from `untilV` out to the roof's lower edge. The
 * roof's rows fan out towards its hips, so one rectangle would drift sideways over that distance:
 * the opening is a stack of bands, each centred in plan on the level line through `center` along
 * `z`, and `halfWidth` wide at its middle, given how far out that is and the roof's height at the
 * band's lower edge. */
function eaveBands(
  surface: EffectiveSurface,
  near: readonly [number, number],
  center: Vec3,
  x: Vec3,
  z: Vec3,
  untilV: number,
  halfWidth: (out: number, height: number) => number
): Rect[] {
  const v0 = surface.domain.v[0];
  const hitAt = (out: number, side = 0) => {
    const q = add(add(center, scale(z, out)), scale(x, side));
    return surfaceAtPlan(surface, q[0], q[2], near);
  };
  /** How far out along `z` the roof comes down to `v`, between `inner` and `outer`. `offIsInner`
   * says which side a point off the roof lies on. */
  const outAt = (v: number, inner: number, outer: number, offIsInner: boolean) => {
    for (let i = 0; i < 24; i++) {
      const middle = (inner + outer) / 2,
        hit = hitAt(middle);
      if (hit ? hit.v > v : offIsInner) inner = middle;
      else outer = middle;
    }
    return inner;
  };
  const from = hitAt(0)?.v ?? v0;
  const eave = outAt(v0, 0, 8, false);
  const back = untilV > from ? outAt(untilV, -8, 0, true) : outAt(untilV, 0, eave, false);
  const bands = Math.min(EAVE_BANDS, Math.max(1, Math.ceil((eave - back) / EAVE_BAND)));
  const at = (k: number) => lerp(back, eave, k / bands);
  const rects: Rect[] = [];
  for (let k = 0; k < bands; k++) {
    const high = hitAt(at(k)),
      low = hitAt(Math.min(eave, at(k + 1) + EAVE_BAND_OVERLAP));
    if (!high || !low) continue;
    const middle = (at(k) + at(k + 1)) / 2;
    const width = halfWidth(middle, low.frame.origin[1]);
    const a = width > 0 ? hitAt(middle, -width) : undefined,
      b = width > 0 ? hitAt(middle, width) : undefined;
    if (a && b) rects.push([Math.min(a.u, b.u), k === bands - 1 ? v0 : low.v, Math.max(a.u, b.u), high.v]);
  }
  return rects;
}
/** How wide an arch stands at a height above its origin, from its outline. */
function archHalfWidth(outline: DormerSweepParams["outline"], height: number) {
  const right = outline.slice(Math.floor(outline.length / 2));
  if (height > right[0][1]) return 0;
  for (let i = 1; i < right.length; i++)
    if (height >= right[i][1])
      return lerp(right[i - 1][0], right[i][0], (right[i - 1][1] - height) / (right[i - 1][1] - right[i][1]));
  return right[right.length - 1][0];
}
const curveOf = (e: GeometryElement | undefined) => (e?.kind === "curve" ? e.curve.points : undefined);
/** Attach rule of an eave dormer: the window opens its wall, its footprint comes out of the roof
 * part behind it, and the connection derives its small roof, laid with the roof's tile. */
export const eaveDormerOnHouse: ConnectionRule = (context) => {
  const { guest, hosts, params } = context;
  const eave = guest?.geometry.original.elements.eave;
  if (!guest || eave?.kind !== "point" || !eave.on) return {};
  const host = hosts[eave.on.host];
  const surface = host && slopeSurface(host);
  if (!surface || !host.unit) return { diagnostics: ["eaveDormerOnHouse needs the roof behind it and its tile"] };
  const opened = wallOpening(context);
  const near = [eave.on.u, eave.on.v] as const;
  const lift = coveringRise(host, surface.frame(near[0], near[1]).z);
  const elements = guest.geometry.original.elements;
  const removed = (rect: Rect) => ({
    part: host.key,
    modification: { element: "slope", op: "removeArea" as const, rect }
  });
  const sweep = elements.sweep;
  if (sweep?.kind === "surface" && sweep.surface.kind === "dormerSweep") {
    const arch = sweep.surface.params as DormerSweepParams;
    const wall = curveOf(elements.front);
    const line = wall && surfaceAtPlan(surface, wall[1][0], wall[1][2], near);
    // The opening runs from the wall line to the eave. The tiles behind the wall stay whole and
    // the small roof comes up through them.
    const footprint =
      wall && line
        ? eaveBands(surface, near, wall[1], arch.x, arch.z, line.v, (_, height) =>
            archHalfWidth(arch.outline, height + lift - arch.origin[1])
          )
        : [];
    return {
      ...opened,
      modify: [...(opened.modify ?? []), ...footprint.map(removed)],
      derive: [
        {
          localId: "roof",
          type: "dormerRoof",
          geometry: { elements: { sweep } },
          algorithm: { type: "sweepTiles", params: (params.tiles as Record<string, unknown> | undefined) ?? {} },
          unit: dormerTile(host.unit)
        },
        {
          localId: "ridge",
          type: "dormerRidge",
          geometry: { elements: { ridge: elements.ridge } },
          algorithm: {
            type: "capCourses",
            params: { width: 0.1, depth: 0.2, overlap: 1.2, spacing: 0.46875, jitter: 0.09375, shade: [1, 1], flag: 0 }
          },
          unit: dormerCap(host.unit)
        }
      ]
    };
  }
  const shed = elements.shed;
  const front = curveOf(elements.front);
  if (shed?.kind !== "surface" || shed.surface.kind !== "loft" || !front) return opened;
  const loft = shed.surface.params as LoftParams;
  const last = loft.rows[loft.rows.length - 1].points;
  const vBack = vAtHeight(surface, near[0], last[Math.floor(last.length / 2)][1] - lift);
  const mount = elements.mount;
  if (vBack === undefined || mount?.kind !== "point")
    return { ...opened, diagnostics: [`${guest.key} lies off its roof`] };
  const half = (curve: readonly Vec3[]) => Math.hypot(...add(curve[2], scale(curve[0], -1))) / 2;
  const clearance = curveOf(elements.clearance);
  const [bodyHalf, wideHalf] = [half(front), clearance ? half(clearance) : 0];
  // With shutters, the eave is wider in front of the point the width is measured at.
  const rects = eaveBands(surface, near, front[1], mount.frame.x, mount.frame.z, vBack, (out) =>
    out >= 0 ? Math.max(bodyHalf, wideHalf) : bodyHalf
  );
  if (!rects.length) return { ...opened, diagnostics: [`${guest.key} lies off its roof`] };
  return {
    ...opened,
    modify: [...(opened.modify ?? []), ...rects.map(removed)],
    derive: [
      {
        localId: "roof",
        type: "shedRoof",
        geometry: { elements: { shed } },
        algorithm: { type: "shedTiles" },
        unit: shedTile(host.unit)
      }
    ]
  };
};

/** Part types of prefabs that stand on a wall and break through its eave. */
export const EAVE_MOUNTS = ["eaveDormer"] as const;

/** Registers the eave dormer part types into a registry. */
export function registerEaveDormerTypes(registry: BuildingRegistry): BuildingRegistry {
  registry.geometry.register("houseEaveMount", houseEaveMountGeometry);
  registry.rules.register("eaveDormerOnHouse", eaveDormerOnHouse);
  for (const walls of [1, 4])
    for (let roofs = 1; roofs <= 4; roofs++)
      registry.defaults.attach(
        "eaveDormer",
        [...Array.from({ length: walls }, () => "wall"), ...Array.from({ length: roofs }, () => "roof")],
        "eaveDormerOnHouse"
      );
  registry.defaults.join("eaveDormer", "floorBand", "openingCutsBand");
  registry.detectors.register(joinPairKey("eaveDormer", "floorBand"), openingMeetsBand);
  return registry;
}
