// Part-type layer: shed dormers, such as the Cottage dormer.
// - One or more window bodies stand side by side on the roof's covering along its level contour:
//   points "mount", "mount1", "mount2", ..., each facing level out of the roof.
// - A small roof spans them: the surface "shed", lofted through the roof's contour lines. Its
//   front edge runs along the tops of the bodies, overhanging their fronts; it rises back by a
//   fraction of the roof's height and meets the roof's covering there.
// - It attaches to the roof parts of its house. The attach rule takes the area behind the bodies
//   out of the roof part they stand on and derives the small roof, laid with the roof's tile:
//   tiles, a soffit under the front edge, trims along the sides and boarded cheeks under them.
import {
  add,
  cross,
  normalize,
  scale,
  sub,
  type BuildingRegistry,
  type BuildingUnit,
  type ConnectionRule,
  type EffectiveSurface,
  type GeometryElement,
  type GeometryGenerator,
  type LayingAlgorithm,
  type ParticipantView,
  type Plane,
  type Rect,
  type SurfaceKind,
  type Vec3
} from "../core";
import { coveringRise, roofUnder, slopeSurface, surfaceAtPlan } from "./Dormers";
import { prefabFacts, prefabScale } from "./Openings";

/** Where a shed dormer stands: the window body's building prefab, a plan position (x, z) for
 * the middle of the row of bodies, a height above the roof's covering, the size of the whole
 * row (default: the prefab's own size), how many bodies stand side by side and how far apart
 * their middles are at the prefab's own size, how far the small roof reaches past the outer
 * bodies, and how much higher its back stands than its front, as a fraction of the roof's
 * height. Resizing scales the bodies and their spacing together. */
export interface ShedDormerParams {
  readonly prefab: string;
  readonly at: readonly [number, number];
  readonly bottom: number;
  readonly width?: number;
  readonly height?: number;
  readonly count: number;
  readonly spacing: number;
  readonly overhang: number;
  readonly pitch: number;
}

/** A surface lofted through rows of points: u runs along every row from its first point to its
 * last, v from the first row to the last. Each point also records the height of the roof's
 * covering under it. Plain JSON. */
export interface LoftParams {
  readonly rows: readonly { readonly points: readonly Vec3[]; readonly floor: readonly number[] }[];
}
function loftPoint(p: LoftParams, u: number, v: number): Vec3 {
  const at = (list: readonly Vec3[], t: number): Vec3 => {
    const x = Math.min(list.length - 1, Math.max(0, t * (list.length - 1)));
    const i = Math.min(list.length - 2, Math.floor(x)),
      f = x - i;
    return add(scale(list[i], 1 - f), scale(list[i + 1], f));
  };
  return at(
    p.rows.map((row) => at(row.points, u)),
    v
  );
}
/** u along the rows, v across them: x follows u, y follows v, z = x × y. */
export const loftSurface: SurfaceKind<LoftParams> = {
  domain: () => ({ u: [0, 1], v: [0, 1], closedU: false }),
  frame: (p, u, v) => {
    const h = 1e-4;
    const du = Math.min(1 - h, Math.max(0, u - h / 2)),
      dv = Math.min(1 - h, Math.max(0, v - h / 2));
    const x = normalize(sub(loftPoint(p, du + h, v), loftPoint(p, du, v)));
    const y = normalize(sub(loftPoint(p, u, dv + h), loftPoint(p, u, dv)));
    return { origin: loftPoint(p, u, v), x, y, z: normalize(cross(x, y)) };
  }
};

/** The host's v where its surface stands at height y above host u, by bisection. Undefined
 * above the surface's top. Height grows with v on roof slopes and cones. */
export function vAtHeight(surface: EffectiveSurface, u: number, y: number): number | undefined {
  let [lo, hi] = surface.domain.v;
  if (surface.frame(u, hi).origin[1] < y) return;
  if (surface.frame(u, lo).origin[1] >= y) return lo;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (surface.frame(u, mid).origin[1] < y) lo = mid;
    else hi = mid;
  }
  return hi;
}
const UP: Vec3 = [0, 1, 0];
/** The covering's height under the first (side 0) or last (side 1) point of the rows at v. */
function floorAt(p: LoftParams, side: number, v: number): number {
  const x = Math.min(p.rows.length - 1, Math.max(0, v * (p.rows.length - 1)));
  const i = Math.min(p.rows.length - 2, Math.floor(x)),
    f = x - i;
  const at = (row: LoftParams["rows"][number]) => row.floor[side ? row.floor.length - 1 : 0];
  return at(p.rows[i]) * (1 - f) + at(p.rows[i + 1]) * f;
}

/** Elements "mount", "mount1", ..., "front" and "shed".
 * - The bodies stand along the roof's level contour through the plan position, `spacing`
 *   apart, each with its lowest point `bottom` above the roof's covering and facing level out
 *   of the roof there.
 * - The shed's rows follow the roof's contours, from the one `overhang` in front of the bodies
 *   up to the one where the covering reaches the shed's back; each row is as wide as the bodies
 *   plus the overhang on both sides. The front row stands at the bodies' tops; the rows rise
 *   evenly to the back.
 * A shed dormer that is over no roof, faces no direction, crosses an edge of its roof part or
 * reaches above it is an error. */
export const houseShedDormerGeometry: GeometryGenerator<ShedDormerParams> = (p, { hosts, environment }) => {
  if (!(Number.isInteger(p.count) && p.count >= 1)) throw Error("A shed dormer needs one or more bodies");
  const facts = prefabFacts(environment, p.prefab);
  const roof = roofUnder(hosts, p.at);
  const { surface, hit } = roof;
  const host = hosts[roof.index];
  const { min, max } = facts.bounds;
  const natural = max[0] - min[0] + (p.count - 1) * p.spacing;
  const [sx, sy, sz] = prefabScale(
    facts,
    ((p.width ?? natural) / natural) * (max[0] - min[0]),
    p.height ?? max[1] - min[1]
  );
  const spacing = p.spacing * sx;
  const lift = coveringRise(host, roof.n);
  const rise = lift - min[1] * sy + p.bottom;
  const { domain } = surface;
  const inside = (u: number) => domain.closedU || (u >= domain.u[0] - 1e-9 && u <= domain.u[1] + 1e-9);
  // Host u per metre along the contour at v: rows of slopes and cones are evenly parametrized.
  const along = (s: number, v: number) => {
    const h = 1e-4 * (domain.u[1] - domain.u[0]);
    const a = surface.frame(hit.u, v).origin,
      b = surface.frame(hit.u + h, v).origin;
    const u = hit.u + (s * h) / Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (!inside(u)) throw Error("The dormer crosses an edge of its roof");
    return u;
  };
  const elements: Record<string, GeometryElement> = {};
  // The bodies' fronts along the contour, from the left edge of the first to the right edge of
  // the last.
  const span = (p.count - 1) * spacing + (max[0] - min[0]) * sx;
  elements.front = {
    kind: "curve",
    curve: {
      points: [-0.5, 0, 0.5].map((t) => {
        const q = surface.frame(along(t * span, hit.v), hit.v).origin;
        return [q[0], q[1] + lift, q[2]] as Vec3;
      })
    }
  };
  for (let i = 0; i < p.count; i++) {
    const u = along((i - (p.count - 1) / 2) * spacing, hit.v);
    const f = surface.frame(u, hit.v);
    const level = Math.hypot(f.z[0], f.z[2]);
    const z: Vec3 = [f.z[0] / level, 0, f.z[2] / level],
      x: Vec3 = [z[2], 0, -z[0]];
    const at = add(f.origin, [0, rise, 0]);
    elements[i ? `mount${i}` : "mount"] = {
      kind: "point",
      frame: { origin: at, x, y: UP, z },
      on: { host: roof.index, element: "slope", u, v: hit.v }
    };
  }
  // The shed: from the contour that overhangs the bodies' fronts to where the covering reaches
  // its back.
  const ahead = add(hit.frame.origin, scale(roof.z, max[2] * sz + p.overhang));
  const front = surfaceAtPlan(surface, ahead[0], ahead[2], [hit.u, hit.v]);
  if (!front) throw Error("The dormer crosses an edge of its roof");
  const top = hit.frame.origin[1] + rise + max[1] * sy;
  const peak = surface.frame(hit.u, domain.v[1]).origin[1],
    base = surface.frame(hit.u, domain.v[0]).origin[1];
  const back = top + p.pitch * (peak - base);
  const coverFront = front.frame.origin[1] + lift;
  const vBack = vAtHeight(surface, hit.u, back - lift);
  if (vBack === undefined || !(back > coverFront)) throw Error("The dormer reaches above its roof");
  const width = span + 2 * p.overhang;
  const depth = Math.hypot(
    ...sub(surface.frame(hit.u, vBack).origin, [front.frame.origin[0], front.frame.origin[1], front.frame.origin[2]])
  );
  const count = Math.max(2, Math.ceil(depth / 0.2) + 1),
    across = 9;
  const rows = Array.from({ length: count }, (_, k) => {
    const t = k / (count - 1);
    const v = k === count - 1 ? vBack : vAtHeight(surface, hit.u, coverFront + (back - coverFront) * t - lift)!;
    const y = top + (back - top) * t;
    const samples = Array.from(
      { length: across },
      (_, j) => surface.frame(along(width * (j / (across - 1) - 0.5), v), v).origin
    );
    return { points: samples.map((q): Vec3 => [q[0], y, q[2]]), floor: samples.map((q) => q[1] + lift) };
  });
  elements.shed = { kind: "surface", surface: { kind: "loft", params: { rows } satisfies LoftParams } };
  return { elements };
};

const loftOf = (part: ParticipantView): LoftParams | undefined => {
  const e = part.geometry.original.elements.shed;
  return e?.kind === "surface" && e.surface.kind === "loft" ? (e.surface.params as LoftParams) : undefined;
};
/** The tile unit of a shed's pieces: the host roof's tile, from narrow trims to tall cheeks. */
export const shedTile = (tile: BuildingUnit): BuildingUnit => ({
  ...tile,
  range: { min: [0.1, 0.1, 1], max: [3, 8, 2.5] }
});
/** How far before a shed's back its opening ends, along the roof, in metres. */
const SHED_LAP = 0.4;
/** Where the opening under a shed ends on the host, as its v: a little before the shed meets the
 * covering. The host's tiles run on beneath the shed's back, so that their cut edge stays hidden. */
function shedOpeningBack(
  surface: EffectiveSurface,
  u: number,
  rows: LoftParams["rows"],
  lift: number
): number | undefined {
  const mid = Math.floor(rows[0].points.length / 2);
  const back = rows[rows.length - 1].points[mid];
  let row = rows.length - 1;
  while (row > (rows.length - 1) / 2 && Math.hypot(...sub(rows[row].points[mid], back)) < SHED_LAP) row--;
  return vAtHeight(surface, u, rows[row].floor[mid] - lift);
}
/** Attach rule of a shed dormer on its roof: the area from the bodies' fronts (the curve
 * "front") back to just before the shed meets the covering, as wide as the bodies, comes out of
 * the roof part they stand on; the shed's overhang keeps the roof under it. The connection derives
 * the shed, laid with the roof's tile. */
export const shedOnRoof: ConnectionRule = ({ guest, hosts }) => {
  const loft = guest && loftOf(guest);
  const mount = guest?.geometry.original.elements.mount;
  if (!guest || !loft || mount?.kind !== "point" || !mount.on) return {};
  const host = hosts[mount.on.host];
  const surface = host && slopeSurface(host);
  if (!surface || !host.unit) return { diagnostics: ["shedOnRoof needs the host roof and its tile"] };
  const near = [mount.on.u, mount.on.v] as const;
  const front = guest.geometry.original.elements.front;
  const lift = coveringRise(host, surface.frame(near[0], near[1]).z);
  const vBack = shedOpeningBack(surface, near[0], loft.rows, lift);
  const us = front?.kind === "curve" ? front.curve.points.map((q) => surfaceAtPlan(surface, q[0], q[2], near)?.u) : [];
  if (vBack === undefined || !us.length || us.some((u) => u === undefined))
    return { diagnostics: [`${guest.key} lies off its roof`] };
  const rect: Rect = [Math.min(...(us as number[])), mount.on.v, Math.max(...(us as number[])), vBack];
  return {
    modify: [{ part: host.key, modification: { element: "slope", op: "removeArea", rect } }],
    derive: [
      {
        localId: "roof",
        type: "shedRoof",
        geometry: { elements: { shed: { kind: "surface", surface: { kind: "loft", params: loft } } } },
        algorithm: { type: "shedTiles" },
        unit: shedTile(host.unit)
      }
    ]
  };
};

interface ShedTileParams {
  /** Column width along the rows in metres. Default: 0.3. */
  readonly column?: number;
  /** Row depth across the rows in metres. Default: 0.4. */
  readonly row?: number;
  /** How far a tile reaches past the next row down, in metres. Default: 0.1. */
  readonly reach?: number;
  /** How far each tile lifts its lower end, in degrees, at random between the two. Default: [2, 10]. */
  readonly tilt?: readonly [number, number];
  /** Depth of the soffit under the front edge in metres. Default: 0.3. */
  readonly soffit?: number;
  /** Width and depth of the side trims in metres. Default: [0.15, 0.2]. */
  readonly trim?: readonly [number, number];
}
interface ShedLayout {
  readonly rows: number;
  readonly columns: number;
}
const loftParams = (context: { geometry: { original: { elements: Record<string, GeometryElement> } } }) => {
  const e = context.geometry.original.elements.shed;
  if (e?.kind !== "surface" || e.surface.kind !== "loft") throw Error("shedTiles lays a lofted shed");
  return e.surface.params as LoftParams;
};
/** Rows of tiles over a lofted shed roof, from its back down to its front, with a soffit under
 * the front edge, a trim along each side of every row, and a board under each trim down to the
 * covering below, cut along the shed's edge. Column joints move a little at random in each row. */
export const shedTiles: LayingAlgorithm<ShedTileParams, ShedLayout> = {
  info: {
    accepts: ["surface"],
    summary: "Tiles, soffit, side trims and boarded cheeks of a small shed roof.",
    params: {
      column: "Column width along the rows in metres. Default: 0.3.",
      row: "Row depth across the rows in metres. Default: 0.4.",
      reach: "How far a tile reaches past the next row down, in metres. Default: 0.1.",
      tilt: "How far a tile lifts its lower end, in degrees. Default: [2, 10].",
      soffit: "Depth of the soffit under the front edge in metres. Default: 0.3.",
      trim: "Width and depth of the side trims in metres. Default: [0.15, 0.2]."
    }
  },
  plan(context) {
    const p = loftParams(context);
    const front = p.rows[0].points,
      sides = p.rows.map((row) => row.points[0]);
    const length = (list: readonly Vec3[]) => list.slice(1).reduce((n, q, i) => n + Math.hypot(...sub(q, list[i])), 0);
    const rows = Math.max(1, Math.ceil(length(sides) / (context.params.row ?? 0.4)) - 1);
    const columns = Math.max(1, Math.floor(length(front) / (context.params.column ?? 0.3)) - 1);
    return { count: rows * columns + columns + 4 * rows, data: { rows, columns } };
  },
  unitAt(context, d, index) {
    const p = loftParams(context);
    const { rows, columns } = d;
    const thickness = (context.unit.scale ?? [1, 1, 1])[2];
    // Column joints of row r, with a little random play.
    const joint = (r: number, c: number) => {
      if (c <= 0 || c >= columns) return Math.max(0, Math.min(1, c / columns));
      const play = Math.min(0.06 / Math.hypot(...sub(p.rows[0].points.at(-1)!, p.rows[0].points[0])), 0.495 / columns);
      return c / columns + (context.random(`joint:${r}:${c}`, "offset").next() - 0.5) * play;
    };
    const point = (u: number, r: number) => loftPoint(p, u, r / rows);
    const tiles = rows * columns;
    if (index < tiles || index < tiles + columns) {
      const soffit = index >= tiles;
      const r = soffit ? 0 : Math.floor(index / columns),
        c = soffit ? index - tiles : index % columns;
      const u0 = joint(r, c),
        u1 = joint(r, c + 1);
      const A = point(u0, r),
        B = point(u1, r),
        C = point(u0, r + 1),
        D = point(u1, r + 1);
      const right = normalize(sub(B, A));
      if (soffit) {
        // A level board under the front edge, reaching back under the roof.
        const backward = normalize([C[0] - A[0], 0, C[2] - A[2]]);
        const deep = context.params.soffit ?? 0.3;
        const x: Vec3 = [-backward[2], 0, backward[0]];
        return {
          key: `soffit/${c}`,
          frame: {
            origin: add(scale(add(A, B), 0.5), scale(backward, deep / 2)),
            x,
            y: backward,
            z: cross(x, backward)
          },
          size: [Math.hypot(...sub(B, A)), deep, thickness],
          params: { shade: 1, flag: 0 }
        };
      }
      const up = normalize(sub(add(C, D), add(A, B)));
      const z = normalize(cross(right, up));
      const down = scale(up, -1);
      const key = `${r}/${c}`;
      const [t0, t1] = context.params.tilt ?? [2, 10];
      const tilt = ((t0 + (t1 - t0) * context.random(key, "tilt").next()) * Math.PI) / 180;
      const [cs, sn] = [Math.cos(tilt), Math.sin(tilt)];
      const y = add(scale(down, cs), scale(z, sn)),
        zz = sub(scale(z, cs), scale(down, sn));
      return {
        key,
        frame: { origin: scale(add(add(A, B), add(C, D)), 0.25), x: cross(y, zz), y, z: zz },
        size: [Math.hypot(...sub(B, A)), Math.hypot(...sub(C, A)) + (context.params.reach ?? 0.1), thickness],
        params: { shade: 1 - r / rows, flag: 0, uv: [(u0 + u1) / 2, (r + 0.5) / rows] }
      };
    }
    // Trims and cheeks along the two sides, row by row.
    const rest = index - tiles - columns;
    const cheek = rest >= 2 * rows;
    const r = Math.floor((rest % (2 * rows)) / 2),
      side = rest % 2;
    const u = side ? 1 : 0;
    const a = point(u, r),
      b = point(u, r + 1);
    const e = normalize(sub(a, b));
    const [trimWidth, trimDepth] = context.params.trim ?? [0.15, 0.2];
    if (!cheek) {
      const x = normalize(cross(e, UP));
      return {
        key: `trim/${side}/${r}`,
        frame: { origin: scale(add(a, b), 0.5), x, y: e, z: cross(x, e) },
        size: [trimWidth, Math.hypot(...sub(a, b)) + 0.16, trimDepth],
        params: { shade: 1, flag: 0 }
      };
    }
    // A board standing under the side's edge, from the covering up to the edge, set in by half a
    // trim so that the trim covers its top, and cut along the edge.
    const level = normalize([b[0] - a[0], 0, b[2] - a[2]]);
    const outward = scale(cross(level, UP), side ? 1 : -1);
    const floor = Math.min(floorAt(p, side, r / rows), floorAt(p, side, (r + 1) / rows)) - 0.1;
    const height = Math.max(a[1], b[1]) - floor;
    const middle = scale(add(a, b), 0.5);
    const origin: Vec3 = sub([middle[0], floor + height / 2, middle[2]], scale(outward, trimWidth / 2));
    const normal = normalize(cross(sub(b, a), outward));
    const m = normal[1] > 0 ? normal : scale(normal, -1);
    const clip: Plane = [-m[0], -m[1], -m[2], m[0] * a[0] + m[1] * a[1] + m[2] * a[2]];
    const x = cross(UP, outward);
    return {
      key: `cheek/${side}/${r}`,
      frame: { origin, x, y: UP, z: outward },
      size: [Math.hypot(b[0] - a[0], b[2] - a[2]), height, thickness],
      params: { shade: 1, flag: 0, clip }
    };
  }
};

/** Registers the shed dormer part types into a registry. */
export function registerShedDormerTypes(registry: BuildingRegistry): BuildingRegistry {
  registry.surfaces.register("loft", loftSurface);
  registry.geometry.register("houseShedDormer", houseShedDormerGeometry);
  registry.algorithms.register("shedTiles", shedTiles);
  registry.rules.register("shedOnRoof", shedOnRoof);
  for (let n = 1; n <= 4; n++)
    registry.defaults.attach(
      "shedDormer",
      Array.from({ length: n }, () => "roof"),
      "shedOnRoof"
    );
  return registry;
}
