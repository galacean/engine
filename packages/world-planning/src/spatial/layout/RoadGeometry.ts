import type { PlanPoint, PlanRoute } from "../../semantic-study/IslandPlanModel";
import { sampleRoadSpline } from "./RoadSpline";
import { ribbonOutline } from "../../semantic-study/WorldRibbon";
import { segmentGap } from "../../semantic-study/WorldPlanningGeometry";

/** Changing derived road geometry invalidates roads, never authored parameters or placed volumes. */
export const ROAD_GEOMETRY_VERSION = 23;
type RoadIdentity = Pick<PlanRoute, "id" | "from" | "to" | "width"> &
  Partial<Pick<PlanRoute, "label" | "kind" | "keypoints" | "widths">>;
interface RoadShapeOptions {
  start?: PlanPoint;
  end?: PlanPoint;
  startWidth?: number;
  endWidth?: number;
  /** Upper-level S preference; zero when keys already express the desired shape. */
  sBend?: number;
  sBendSign?: number;
  /** Bridge spans are straight and pinned before spline projection. */
  straight?: (a: PlanPoint, b: PlanPoint) => boolean;
}
export type RoadClearance = (points: PlanPoint[], outline: PlanPoint[]) => boolean;
const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(b.x - a.x, b.z - a.z);

/** Publish already compiled samples without a second renderer-side interpolation. */
export function publishRoadPath(definition: RoadIdentity, points: PlanPoint[], prior?: PlanRoute): PlanRoute {
  points = points.map((p) => ({ x: p.x, z: p.z }));
  const widths = definition.widths?.length === points.length ? definition.widths : points.map(() => definition.width);
  // Topology may only split logical ownership. Reuse the accepted footprint when
  // every position and width is exactly unchanged; changed pavement is rebuilt.
  const unchanged =
    prior?.outline &&
    prior.points.length === points.length &&
    points.every(
      (p, i) =>
        p.x === prior.points[i].x && p.z === prior.points[i].z && widths[i] === (prior.widths?.[i] ?? prior.width)
    );
  return {
    ...definition,
    label: definition.label ?? "道路",
    kind: definition.kind ?? "main",
    points,
    widths,
    maxWidth: Math.max(...widths),
    outline: unchanged ? prior.outline : ribbonOutline(points, widths, undefined, true),
    navigationLinks: [{ from: definition.from, to: definition.to, points, width: definition.width }]
  };
}

/** Compile searched geometry once for preview, terrain and navigation. Clearance includes the full road width.
 * Grid staircase removal is bounded by a metre tolerance; it cannot erase broad S bends or cross obstacles.
 * A blocked curve reduces only its own span's handles, retaining exact endpoints and neighbouring bends.
 */
export function compileRoadPath(
  definition: RoadIdentity,
  input: readonly (PlanPoint & { width?: number })[],
  clear: RoadClearance,
  toleranceM = 1,
  tension = 1,
  endpoints: RoadShapeOptions = {}
): PlanRoute | undefined {
  // Requested width is a preference. Keep its authored value while publishing the
  // feasible sampled widths; finite retries are a search budget, not a layout veto.
  for (const scale of [1, 0.75, 0.5, 0.25, 0.125]) {
    const route = compileRoadPathAtWidth(
      { ...definition, width: definition.width * scale },
      input.map((p) => ({ ...p, ...(p.width === undefined ? {} : { width: p.width * scale }) })),
      clear,
      toleranceM,
      tension,
      {
        ...endpoints,
        startWidth: endpoints.startWidth === undefined ? undefined : endpoints.startWidth * scale,
        endWidth: endpoints.endWidth === undefined ? undefined : endpoints.endWidth * scale
      }
    );
    if (route) return { ...route, width: definition.width };
  }
}

function compileRoadPathAtWidth(
  definition: RoadIdentity,
  input: readonly (PlanPoint & { width?: number })[],
  clear: RoadClearance,
  toleranceM = 1,
  tension = 1,
  endpoints: RoadShapeOptions = {}
): PlanRoute | undefined {
  const raw = input.filter((p, i) => !i || distance(p, input[i - 1]) > 1e-7);
  if (raw.length < 2) return;
  const outline = (points: PlanPoint[]) =>
    ribbonOutline(
      points,
      points.map(() => definition.width),
      undefined,
      true
    );
  const simplify = (start: number, end: number): PlanPoint[] => {
    if (end <= start + 1) return raw.slice(start, end + 1);
    let split = start + 1,
      gap = -1;
    for (let i = start + 1; i < end; i++) {
      const d = segmentGap(raw[i], raw[start], raw[end]);
      if (d > gap) {
        gap = d;
        split = i;
      }
    }
    const line = [raw[start], raw[end]];
    if (gap <= toleranceM && clear(line, outline(line))) return line;
    return [...simplify(start, split).slice(0, -1), ...simplify(split, end)];
  };
  const pinned = new Set([0, raw.length - 1]);
  for (let i = 1; i < raw.length; i++)
    if (endpoints.straight?.(raw[i - 1], raw[i])) {
      pinned.add(i - 1);
      pinned.add(i);
    }
  const stops = [...pinned].sort((a, b) => a - b);
  const keys: (PlanPoint & { width?: number })[] = raw.some((p) => p.width !== undefined)
    ? raw.slice()
    : stops.slice(1).flatMap((end, i) => simplify(stops[i], end).slice(i ? 1 : 0));
  // Shape rules only propose spline keys; routing itself has no S-shaped cost field.
  // Keep bends inside already available pavement rather than rerouting the world for a preference.
  const shaped: typeof keys = [keys[0]];
  const sBend = endpoints.sBend ?? (keys.length === 2 && !endpoints.start && !endpoints.end ? 1 : 0);
  let shapeHash = 2166136261;
  for (const c of definition.id) shapeHash = Math.imul(shapeHash ^ c.charCodeAt(0), 16777619);
  const sign = endpoints.sBendSign ?? ((shapeHash >>> 0) % 2 ? 1 : -1);
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1],
      b = keys[i],
      length = distance(a, b);
    if (sBend > 0 && length > definition.width * 6 && !endpoints.straight?.(a, b)) {
      const nx = -(b.z - a.z) / length,
        nz = (b.x - a.x) / length;
      const amplitude = Math.min(length * 0.08, definition.width * 2) * sBend;
      const samples = [
        a,
        ...[1 / 3, 2 / 3].map((t, j) => ({
          x: a.x + (b.x - a.x) * t + nx * amplitude * sign * (j ? -1 : 1),
          z: a.z + (b.z - a.z) * t + nz * amplitude * sign * (j ? -1 : 1),
          width: (a.width ?? definition.width) * (1 - t) + (b.width ?? definition.width) * t
        })),
        b
      ];
      // Test the control spine once. Actual curved, variable-width pavement is still
      // checked below; blocked S preferences leave the accepted corridor unchanged.
      if (
        clear(
          samples,
          ribbonOutline(
            samples,
            samples.map((p) => p.width ?? definition.width),
            undefined,
            true
          )
        )
      )
        shaped.push(...samples.slice(1, -1));
    }
    shaped.push(b);
  }
  keys.splice(0, keys.length, ...shaped);
  let autoWidth: ((along: number, total: number) => number) | undefined;
  if (!raw.some((p) => p.width !== undefined)) {
    // Low-frequency, ID-stable variation; never change geometry on refresh.
    let hash = 2166136261;
    for (const c of definition.id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    const phase = ((hash >>> 0) / 4294967296) * Math.PI * 2;
    autoWidth = (along, total) => {
      const base = definition.width * (0.88 + 0.12 * Math.sin(phase + along / 28));
      const smooth = (t: number) => t * t * (3 - 2 * t);
      const fadeA = smooth(Math.max(0, 1 - along / Math.min(24, total / 2)));
      const fadeB = smooth(Math.max(0, 1 - (total - along) / Math.min(24, total / 2)));
      return base * (1 - fadeA - fadeB) + (endpoints.startWidth ?? base) * fadeA + (endpoints.endWidth ?? base) * fadeB;
    };
    let along = 0;
    const total = keys.slice(1).reduce((sum, p, i) => sum + distance(keys[i], p), 0);
    keys.forEach((p, i) => {
      if (i) along += distance(keys[i - 1], p);
      p.width = autoWidth!(along, total);
    });
  }
  const direction = (a: PlanPoint, b: PlanPoint) => {
    const length = distance(a, b) || 1;
    return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
  };
  const tangents = keys.map((p, i) => {
    const before = direction(keys[Math.max(0, i - 1)], p),
      after = direction(p, keys[Math.min(keys.length - 1, i + 1)]);
    return direction({ x: 0, z: 0 }, { x: before.x + after.x, z: before.z + after.z });
  });
  const compatible = (tangent: PlanPoint | undefined, chord: PlanPoint) =>
    tangent && tangent.x * chord.x + tangent.z * chord.z >= 0;
  // A requested junction heading cannot point backwards along its first/last
  // span: any positive Hermite handle would make a hairpin there.
  if (compatible(endpoints.start, direction(keys[0], keys[1]))) tangents[0] = endpoints.start!;
  if (compatible(endpoints.end, direction(keys.at(-2)!, keys.at(-1)!))) tangents[tangents.length - 1] = endpoints.end!;
  const points: PlanPoint[] = [],
    widths: number[] = [];
  for (let i = 1; i < keys.length; i++) {
    let span: ReturnType<typeof sampleRoadSpline> | undefined;
    const straight = endpoints.straight?.(keys[i - 1], keys[i]);
    const chord = direction(keys[i - 1], keys[i]);
    for (const scale of straight ? [1] : [1, 0.5, 0.25, 0.125, 0.0625, 0]) {
      const candidate = sampleRoadSpline(
        [
          {
            position: keys[i - 1],
            width: keys[i - 1].width ?? definition.width,
            tangent: straight ? chord : tangents[i - 1]
          },
          { position: keys[i], width: keys[i].width ?? definition.width, tangent: straight ? chord : tangents[i] }
        ],
        { tension: tension * scale, angleDegrees: 10 }
      );
      if (clear(candidate.points, ribbonOutline(candidate.points, candidate.widths, undefined, true))) {
        span = candidate;
        break;
      }
    }
    if (!span) return;
    points.push(...(i === 1 ? span.points : span.points.slice(1)));
    widths.push(...(i === 1 ? span.widths! : span.widths!.slice(1)));
  }
  if (autoWidth) {
    const along = [0];
    for (let i = 1; i < points.length; i++) along.push(along[i - 1] + distance(points[i - 1], points[i]));
    for (let i = 0; i < widths.length; i++) widths[i] = autoWidth(along[i], along.at(-1)!);
  }
  const footprint = ribbonOutline(points, widths, undefined, true);
  if (!clear(points, footprint)) return;
  return {
    ...definition,
    label: definition.label ?? "道路",
    kind: definition.kind ?? "main",
    points,
    widths,
    outline: footprint,
    maxWidth: Math.max(...widths),
    navigationLinks: [{ from: definition.from, to: definition.to, points, width: definition.width }],
    keypoints: keys.map((position, i) => ({
      position: { x: position.x, z: position.z },
      width: position.width ?? definition.width,
      tangent: tangents[i]
    }))
  };
}

/** Coordinate feasible widths at degree-two continuations, leaving branches free to have different widths.
 * @param routes Canonical physical roads; only changed sampled widths/footprints are updated in place.
 * @param clear Exact occupied-footprint check; narrowing must retain the accepted corridor.
 * Repeated calls are idempotent. Geometry positions and author-requested widths are unchanged.
 */
export function taperRoadJoins(routes: readonly PlanRoute[], clear: RoadClearance): void {
  const joins = new Map<string, { route: PlanRoute; start: boolean }[]>();
  for (const route of routes)
    for (const start of [true, false]) {
      const id = start ? route.from : route.to;
      joins.set(id, [...(joins.get(id) ?? []), { route, start }]);
    }
  const targets = new Map<PlanRoute, { start?: number; end?: number }>();
  for (const arms of joins.values()) {
    if (arms.length !== 2) continue;
    const width = Math.min(...arms.map(({ route, start }) => route.widths![start ? 0 : route.points.length - 1]));
    for (const arm of arms) {
      const values = targets.get(arm.route) ?? {};
      const original = arm.route.widths![arm.start ? 0 : arm.route.points.length - 1];
      if (width < original - 1e-8) values[arm.start ? "start" : "end"] = width;
      if (Object.keys(values).length) targets.set(arm.route, values);
    }
  }
  for (const route of routes) {
    const target = targets.get(route);
    if (!target) continue;
    const along = [0];
    for (let i = 1; i < route.points.length; i++)
      along.push(along[i - 1] + distance(route.points[i - 1], route.points[i]));
    const total = along.at(-1)!;
    if (total < 1e-8) continue;
    let changed = false;
    const widths = route.widths!.map((width, i) => {
      let resolved = width;
      for (const start of [true, false]) {
        const end = target[start ? "start" : "end"];
        if (end === undefined) continue;
        const endpointWidth = route.widths![start ? 0 : route.points.length - 1];
        // A short section must not let one join's taper narrow the opposite
        // endpoint after its neighbour has already received a shared width.
        const blend = Math.min(total / 2, Math.max(12, endpointWidth * 6));
        const t = Math.min(1, (start ? along[i] : total - along[i]) / blend);
        if (t < 1) resolved = Math.min(resolved, end + (width - end) * t * t * (3 - 2 * t));
      }
      if (resolved !== width) changed = true;
      return resolved;
    });
    if (changed) {
      const narrowed = publishRoadPath({ ...route, widths }, route.points);
      if (clear(narrowed.points, narrowed.outline!)) Object.assign(route, narrowed);
    }
  }
}
