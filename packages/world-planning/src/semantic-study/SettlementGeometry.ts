import { sampleRoadSpline } from "../spatial/layout/RoadSpline";
import type { PlanPoint, PlanRoute } from "./IslandPlanModel";
import { ribbonOutline } from "./WorldRibbon";
import { segmentGap } from "./WorldPlanningGeometry";
import { SETTLEMENT_PROFILE as profile } from "../planning-data/SettlementProfile";
/** Addressed random samples do not depend on another module's call count. */
export function settlementRandom(seed: number, key: string): number {
  let h = seed | 0;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
/** Clamp a normalized semantic input without propagating NaN into geometry. */
export function intent(value: number | undefined, fallback = 0.5): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value!)) : fallback;
}
/** Sample a smooth road curve through exact shared ports.
 * @param a Start port in world metres.
 * @param b End port in world metres.
 * @param bend Normalized curvature intent.
 * @param seed Layout seed.
 * @param key Stable road identity for random shape variation.
 * @param headings Optional directions of travel at doors or village gates.
 * @returns Ordered centreline samples, including both ports.
 */
export function settlementCurve(
  a: PlanPoint,
  b: PlanPoint,
  bend: number,
  seed: number,
  key: string,
  headings?: { start?: PlanPoint; end?: PlanPoint }
): PlanPoint[] {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    length = Math.hypot(dx, dz),
    nx = -dz / (length || 1),
    nz = dx / (length || 1);
  const q = profile.road.curve,
    amount = Math.min(length * (q.offsetRatioMin + (q.offsetRatioMax - q.offsetRatioMin) * bend), q.maxOffsetM),
    sign = settlementRandom(seed, key + "side") > 0.5 ? 1 : -1;
  const inflection =
    length >= q.inflectionMinLengthM && settlementRandom(seed, key + "inflection") < q.inflectionChance;
  const offsets = [
    sign * amount,
    (inflection ? -sign : sign) * amount * (0.65 + settlementRandom(seed, key + "turn") * 0.35)
  ];
  const c = { x: a.x + dx / 3 + nx * offsets[0], z: a.z + dz / 3 + nz * offsets[0] },
    d = { x: a.x + (dx * 2) / 3 + nx * offsets[1], z: a.z + (dz * 2) / 3 + nz * offsets[1] };
  // Gate and door headings are part of the route connection, not a separate
  // straight stub; shared tangents avoid a kink at the module boundary.
  const handle = length * (q.headingHandleRatioMin + (q.headingHandleRatioMax - q.headingHandleRatioMin) * bend);
  if (headings?.start) {
    const h = headings.start,
      n = Math.hypot(h.x, h.z) || 1;
    c.x = a.x + (h.x / n) * handle;
    c.z = a.z + (h.z / n) * handle;
  }
  if (headings?.end) {
    const h = headings.end,
      n = Math.hypot(h.x, h.z) || 1;
    d.x = b.x - (h.x / n) * handle;
    d.z = b.z - (h.z / n) * handle;
  }
  const count = Math.max(8, Math.ceil(length / profile.road.sampleSpacing));
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count,
      u = 1 - t;
    return {
      x: u * u * u * a.x + 3 * u * u * t * c.x + 3 * u * t * t * d.x + t * t * t * b.x,
      z: u * u * u * a.z + 3 * u * u * t * c.z + 3 * u * t * t * d.z + t * t * t * b.z
    };
  });
}
type RoadDefinition = Pick<PlanRoute, "id" | "from" | "to" | "width"> &
  Partial<Pick<PlanRoute, "label" | "kind" | "caps" | "closed">> & { curveTension?: number };
type RoadKeypoint = NonNullable<PlanRoute["keypoints"]>[number];
const pointDistance = (a: PlanPoint, b: PlanPoint): number => Math.hypot(a.x - b.x, a.z - b.z);
const direction = (a: PlanPoint, b: PlanPoint): PlanPoint => {
  const length = pointDistance(a, b) || 1;
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
};
const cumulativeLengths = (points: PlanPoint[]): number[] => {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + pointDistance(points[i - 1], points[i]));
  return lengths;
};
function samplePolyline(
  points: PlanPoint[],
  lengths: number[],
  distance: number
): { position: PlanPoint; tangent: PlanPoint; index: number; t: number } {
  let i = 0;
  while (i < points.length - 2 && lengths[i + 1] < distance) i++;
  const span = lengths[i + 1] - lengths[i];
  const t = span ? Math.max(0, Math.min(1, (distance - lengths[i]) / span)) : 0;
  const a = points[i],
    b = points[i + 1];
  return { position: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, tangent: direction(a, b), index: i, t };
}

/** Compile explicit road positions and widths into one shared continuous footprint.
 * @param input Metre-space keys; tangents are directions of travel, normalized on compilation.
 * @param definition Stable identity, endpoint ports and nominal width of the logical road.
 * @param sampling Optional directional resolution for short curved spans; metre spacing remains the baseline.
 * @returns Road with the original keys and derived centreline, widths and outline.
 * @throws RangeError When fewer than two distinct positions or nonpositive widths are supplied.
 */
export function compileSettlementRoadKeypoints(
  input: RoadKeypoint[],
  definition: RoadDefinition,
  sampling?: { angleDegrees: number }
): PlanRoute {
  const { keys, points, widths, closed } = sampleRoadSpline(input, {
    closed: definition.closed,
    tension: definition.curveTension,
    angleDegrees: sampling?.angleDegrees
  });
  return {
    ...definition,
    label: definition.label ?? "公共道路",
    kind: definition.kind ?? "main",
    closed,
    keypoints: keys,
    points,
    widths,
    maxWidth: Math.max(...widths),
    outline: ribbonOutline(points, widths, definition.caps, true, closed)
  };
}

/** Resolve sparse width controls over a source curve before compiling its shared footprint.
 * @param id Stable logical-road identity.
 * @param from Start port identifier.
 * @param to End port identifier.
 * @param points Source curve in world metres.
 * @param width Nominal road width in metres.
 * @param seed Layout seed.
 * @param variation Normalized width-noise amplitude.
 * @param label Display name.
 * @param resolvedWidths Explicit widths paired with source points, when provided.
 * @param caps End treatments for open approaches.
 * @param curveTension Hermite handle scale, controlling curvature while retaining exact shared keys.
 * @returns A continuous road derived entirely from its keypoints.
 */
export function settlementRoad(
  id: string,
  from: string,
  to: string,
  points: PlanPoint[],
  width: number,
  seed: number,
  variation: number,
  label = "公共道路",
  resolvedWidths?: number[],
  caps?: PlanRoute["caps"],
  curveTension?: number
): PlanRoute {
  const lengths = cumulativeLengths(points),
    total = lengths.at(-1)!;
  const closed = points.length > 2 && pointDistance(points[0], points.at(-1)!) < 1e-8;
  const distances = new Set<number>([0, total / 2, total]);
  if (resolvedWidths) for (const length of lengths) distances.add(length);
  else {
    for (let distance = profile.road.noiseWavelength; distance < total; distance += profile.road.noiseWavelength)
      distances.add(distance);
    // Retain curvature landmarks independently of the width-noise spacing.
    const retainBends = (start: number, end: number): void => {
      let split = -1,
        error = profile.road.sampleSpacing / 4;
      for (let i = start + 1; i < end; i++) {
        const gap = segmentGap(points[i], points[start], points[end]);
        if (gap > error) {
          error = gap;
          split = i;
        }
      }
      if (split < 0) return;
      distances.add(lengths[split]);
      retainBends(start, split);
      retainBends(split, end);
    };
    retainBends(0, points.length - 1);
  }
  const blendLength = Math.min(width * profile.road.curve.endpointBlendWidths, total / 2);
  const noiseAt = (distance: number, octave: number) => {
    const at = distance / (profile.road.noiseWavelength / Math.pow(2, octave));
    const cell = Math.floor(at),
      t = at - cell,
      blend = t * t * (3 - 2 * t);
    const a = settlementRandom(seed, `${id}-width-${octave}-${cell}`) * 2 - 1;
    const b = settlementRandom(seed, `${id}-width-${octave}-${cell + 1}`) * 2 - 1;
    return a + (b - a) * blend;
  };
  const keys = [...distances]
    .sort((a, b) => a - b)
    .filter((distance) => !closed || distance < total - 1e-8)
    .map((distance) => {
      const sample = samplePolyline(points, lengths, distance);
      const edge = closed ? 1 : Math.min(1, Math.min(distance, total - distance) / Math.max(1e-6, blendLength));
      const noise = (0.75 * noiseAt(distance, 0) + 0.25 * noiseAt(distance, 1)) * edge * edge * (3 - 2 * edge);
      const resolved = resolvedWidths
        ? resolvedWidths[sample.index] + (resolvedWidths[sample.index + 1] - resolvedWidths[sample.index]) * sample.t
        : Math.max(
            profile.road.minimumWidth,
            width * Math.max(profile.road.minWidthRatio, 1 + profile.road.noiseAmplitude * variation * noise)
          );
      return { position: sample.position, width: resolved, tangent: sample.tangent };
    });
  if (closed && keys.length) keys[0].tangent = direction(points.at(-2)!, points[1]);
  return compileSettlementRoadKeypoints(keys, {
    id,
    from,
    to,
    width,
    label,
    caps,
    closed,
    ...(curveTension === undefined ? {} : { curveTension })
  });
}

/** Widen an approach by changing its width keys, then recompiling all derived geometry.
 * @param route Open road that owns the junction mouth.
 * @param receivingWidth Width of the receiving road in metres.
 * @param atStart Whether the receiving road is at the first point.
 * @returns The same road with consistent keys, widths and outline.
 */
export function flareSettlementRoadEnd(route: PlanRoute, receivingWidth: number, atStart = false): PlanRoute {
  if (route.closed) return route;
  const points = route.points,
    widths = route.widths ?? points.map(() => route.width);
  const lengths = cumulativeLengths(points),
    total = lengths.at(-1)!;
  const bank = Math.min(receivingWidth / 2, total * 0.2);
  const radius = Math.min(
    receivingWidth * profile.road.junction.cornerRadiusToReceivingWidth,
    Math.max(0, total * profile.road.junction.maxApproachFraction - bank)
  );
  if (radius <= 0) return route;
  const sourceKeys: RoadKeypoint[] = route.keypoints ?? points.map((position, i) => ({ position, width: widths[i] }));
  const keyed = sourceKeys.map((key) => {
    const index = points.findIndex((point) => pointDistance(point, key.position) < 1e-7);
    return { distance: lengths[index], key: { ...key, position: { ...key.position } } };
  });
  const start = atStart ? 0 : total - bank - radius,
    end = atStart ? bank + radius : total;
  const count = Math.max(1, Math.ceil((end - start) / profile.road.junction.sampleSpacingM));
  for (let i = 0; i <= count; i++) {
    const distance = start + ((end - start) * i) / count;
    if (keyed.some((item) => Math.abs(item.distance - distance) < 1e-7)) continue;
    const sample = samplePolyline(points, lengths, distance);
    keyed.push({
      distance,
      key: {
        position: sample.position,
        tangent: sample.tangent,
        width: widths[sample.index] + (widths[sample.index + 1] - widths[sample.index]) * sample.t
      }
    });
  }
  const keypoints = keyed
    .sort((a, b) => a.distance - b.distance)
    .map(({ distance, key }) => {
      const endDistance = atStart ? distance : total - distance;
      const progress = Math.max(0, Math.min(1, 1 - endDistance / (bank + radius)));
      const blend = progress * progress * (3 - 2 * progress);
      return { ...key, width: key.width + (receivingWidth - key.width) * blend };
    });
  const caps = {
    start: route.caps?.start ?? "round",
    end: route.caps?.end ?? "round",
    [atStart ? "start" : "end"]: "butt"
  } as NonNullable<PlanRoute["caps"]>;
  return Object.assign(route, compileSettlementRoadKeypoints(keypoints, { ...route, caps }));
}
/** Continuous clearance to the nearest road axis; radius includes the widest road section. */
export function roadGap(p: PlanPoint, routes: PlanRoute[]): number {
  let best = Infinity;
  for (const r of routes)
    for (let i = 1; i < r.points.length; i++)
      best = Math.min(best, segmentGap(p, r.points[i - 1], r.points[i]) - (r.maxWidth ?? r.width) / 2);
  return best;
}
/** Rectangular bounds for framing; does not change the world's coordinate scale. */
export function settlementBounds(points: PlanPoint[], margin = 0): PlanPoint[] {
  const x0 = Math.min(...points.map((p) => p.x)) - margin,
    x1 = Math.max(...points.map((p) => p.x)) + margin,
    z0 = Math.min(...points.map((p) => p.z)) - margin,
    z1 = Math.max(...points.map((p) => p.z)) + margin;
  return [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 }
  ];
}
