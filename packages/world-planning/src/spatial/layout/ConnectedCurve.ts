import type { LayoutBuildContext, LayoutConstruction, LayoutConnectionPlan, LayoutRulePlugin } from "./LayoutRules";
import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import { boxOutline, type VolumeBox } from "./Volumes";
import { layoutRegion, LAYOUT_CANDIDATE_BUDGET } from "./LayoutRegion";

/** Solve forbidden SAT intervals along one outward axis in a single sweep. */
function clearCorridorOffset(
  box: VolumeBox,
  origin: PlanPoint,
  direction: PlanPoint,
  requested: number,
  corridors: readonly VolumeBox[]
): number {
  const forbidden: [number, number][] = [];
  for (const road of corridors) {
    let lo = -Infinity,
      hi = Infinity;
    for (const angle of [box.yaw, box.yaw + Math.PI / 2, road.yaw, road.yaw + Math.PI / 2]) {
      const ux = Math.cos(angle),
        uz = Math.sin(angle),
        position = (origin.x - road.center.x) * ux + (origin.z - road.center.z) * uz,
        rate = direction.x * ux + direction.z * uz;
      const radius =
        (Math.abs(Math.cos(box.yaw - angle)) * box.width +
          Math.abs(Math.sin(box.yaw - angle)) * box.depth +
          Math.abs(Math.cos(road.yaw - angle)) * road.width +
          Math.abs(Math.sin(road.yaw - angle)) * road.depth) /
        2;
      if (Math.abs(rate) < 1e-9) {
        if (Math.abs(position) >= radius) {
          lo = Infinity;
          hi = -Infinity;
          break;
        }
      } else {
        const a = (-radius - position) / rate,
          b = (radius - position) / rate;
        lo = Math.max(lo, Math.min(a, b));
        hi = Math.min(hi, Math.max(a, b));
      }
      if (lo > hi) break;
    }
    if (lo <= hi) forbidden.push([lo, hi]);
  }
  forbidden.sort((a, b) => a[0] - b[0]);
  let distance = Math.max(0, requested);
  for (const [lo, hi] of forbidden) {
    if (hi < distance) continue;
    if (lo > distance) break;
    distance = hi + 1e-4;
  }
  return distance;
}

/** Construct a region-length spline and two independently staggered rows of single OBBs.
 * Count never controls length. Tangents are sampled at the actual member station.
 */
export function buildCurveLayout(c: LayoutBuildContext): LayoutConstruction {
  const q = c.parameters,
    heading = ((q.curveHeadingDegrees ?? 0) * Math.PI) / 180;
  const initial = layoutRegion(c.region, c.center, heading);
  const core = (q.curveGapM ?? 12) / 2 + q.depthMaxM / 2 + (q.curveBendM ?? 8);
  const center =
    initial.clearance(c.center) < core && initial.clearance(initial.centroid) > initial.clearance(c.center)
      ? initial.centroid
      : c.center;
  const region = layoutRegion(c.region, center, heading);
  const amplitude = q.curveBendM ?? 8,
    scale = Math.max(0.001, q.curveVariationScaleM ?? 80);
  const wave = (x: number) => {
    const u = x / scale + c.random("owner:curve:phase"),
      k = Math.floor(u),
      t = u - k;
    const knot = (n: number) => (n % 2 ? -1 : 1) * (0.5 + 0.5 * c.random(`owner:curve:knot:${n}`));
    const a = knot(k),
      b = knot(k + 1);
    return {
      z: amplitude * (a + (b - a) * t * t * t * (10 + t * (-15 + 6 * t))),
      slope: (amplitude * (b - a) * 30 * t * t * (1 - t) * (1 - t)) / scale
    };
  };
  const span = region.maxX - region.minX;
  if (!(span > 0)) return { members: [] };
  const steps = Math.min(LAYOUT_CANDIDATE_BUDGET, Math.max(2, Math.ceil(span / Math.min(2, scale / 8))));
  // Keep the longest in-region run. This clips the skeleton to its region before any member filtering.
  let spine: PlanPoint[] = [],
    run: PlanPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = region.minX + (span * i) / steps,
      point = region.world(x, wave(x).z);
    if (region.inside(point)) run.push(point);
    else {
      if (run.length > spine.length) spine = run;
      run = [];
    }
  }
  if (run.length > spine.length) spine = run;
  const corridors = spine.slice(1).map((b, i) => {
    const a = spine[i],
      gap = q.curveGapM ?? 12;
    return {
      center: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
      width: Math.hypot(b.x - a.x, b.z - a.z) + gap,
      depth: gap,
      height: 1,
      elevation: 0,
      yaw: Math.atan2(b.z - a.z, b.x - a.x)
    };
  });
  const result: LayoutConstruction = { center, members: [], spine };
  const min = q.spacingMinM ?? q.spacingM ?? 0,
    max = q.spacingMaxM ?? q.spacingM ?? min;
  const sample = (i: number, key: string, a: number, b: number) => a + (b - a) * c.random(`owner:curve:${i}:${key}`);
  let sampled = 0;
  for (const side of [-1, 1]) {
    let edge = region.minX,
      previousX = -Infinity;
    for (let row = 0; sampled < LAYOUT_CANDIDATE_BUDGET; row++, sampled++) {
      const i = row * 2 + (side > 0 ? 1 : 0);
      const width = sample(i, "width", q.widthMinM, q.widthMaxM),
        depth = sample(i, "depth", q.depthMinM, q.depthMaxM);
      const jitter = sample(i, "yaw", -0.5, 0.5) * Math.PI * q.orientationVariation;
      const yawAt = (x: number) => Math.atan(wave(x).slope) + ((q.headingDegrees ?? 0) * Math.PI) / 180 + jitter;
      const halfAt = (x: number) => (Math.abs(Math.cos(yawAt(x))) * width + Math.abs(Math.sin(yawAt(x))) * depth) / 2;
      // Solve the leading projected edge directly. Bisection is bounded geometry arithmetic, not placement retries.
      let low = edge,
        high = edge + Math.hypot(width, depth) / 2;
      for (let j = 0; j < 24; j++) {
        const mid = (low + high) / 2;
        if (mid - halfAt(mid) < edge) low = mid;
        else high = mid;
      }
      const x = Math.max(high, previousX + 0.001);
      if (x > region.maxX) break;
      previousX = x;
      edge = x + halfAt(x) + sample(i, "gap", min, max);
      const fraction = (x - region.minX) / span;
      const u = fraction * 4,
        segment = Math.min(3, Math.floor(u)),
        t = u - segment,
        blend = t * t * (3 - 2 * t);
      const a = c.random(`owner:curve:side:${side}:wander:${segment}`),
        b = c.random(`owner:curve:side:${side}:wander:${segment + 1}`);
      const wander =
        2 *
        (q.curveLateralVariationM ?? 12) *
        (0.6 * (a + (b - a) * blend) + 0.4 * c.random(`owner:curve:${i}:offset`));
      const origin = region.world(x, wave(x).z),
        direction = { x: -Math.sin(heading) * side, z: Math.cos(heading) * side };
      const box = {
        center: origin,
        width,
        depth,
        height: sample(i, "height", q.heightMinM, q.heightMaxM),
        elevation: 0,
        yaw: heading + yawAt(x)
      };
      const clearance = clearCorridorOffset(box, origin, direction, 0, corridors);
      const preferred = clearance + wander;
      const distance =
        region.fitOffset(
          boxOutline(box),
          direction,
          clearance,
          preferred,
          clearance + 2 * (q.curveLateralVariationM ?? 12)
        ) ?? preferred;
      box.center = { x: origin.x + direction.x * distance, z: origin.z + direction.z * distance };
      if (region.inside(box.center)) result.members.push([box]);
    }
  }
  result.limited = sampled >= LAYOUT_CANDIDATE_BUDGET || steps === LAYOUT_CANDIDATE_BUDGET;
  return result;
}

/** Roads keep the region skeleton even when some OBBs are excluded by terrain or other solids. */
export function connectCurveRows(c: Parameters<NonNullable<LayoutRulePlugin["connect"]>>[0]): LayoutConnectionPlan {
  const spine = c.construction.spine ?? [];
  if (spine.length < 2) return { ports: [], links: [] };
  const marks: { station: number; position: PlanPoint; volume?: (typeof c.volumes)[number] }[] = [
    { station: 0, position: spine[0] },
    { station: spine.length - 1, position: spine.at(-1)! }
  ];
  for (const volume of c.volumes) {
    const box = volume.boxes[0];
    let best = Infinity,
      station = 0,
      position = spine[0];
    for (let i = 0; i < spine.length - 1; i++) {
      const a = spine[i],
        b = spine[i + 1],
        dx = b.x - a.x,
        dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((box.center.x - a.x) * dx + (box.center.z - a.z) * dz) / (dx * dx + dz * dz)));
      const point = { x: a.x + dx * t, z: a.z + dz * t },
        d = Math.hypot(point.x - box.center.x, point.z - box.center.z);
      if (d < best) {
        best = d;
        station = i + t;
        position = point;
      }
    }
    marks.push({ station, position, volume });
  }
  marks.sort((a, b) => a.station - b.station);
  const unique = marks.filter((m, i) => !i || m.station - marks[i - 1].station > 1e-6);
  const ports: LayoutConnectionPlan["ports"] = unique.map((m, i) => ({
    id: `${c.owner}:spine:${i}:port`,
    position: m.position,
    access: !i || i === unique.length - 1
  }));
  const links: LayoutConnectionPlan["links"] = unique.slice(1).map((m, i) => ({
    id: `${c.owner}:path:spine:${i}`,
    backbone: true,
    from: ports[i].id,
    to: ports[i + 1].id,
    width: c.parameters.pathWidthM,
    points: [unique[i].position, ...spine.filter((_, j) => j > unique[i].station && j < m.station), m.position]
  }));
  for (const m of c.parameters.roadMode === "backbone" ? [] : marks.filter((m) => m.volume)) {
    let point = m.volume!.boxes[0].center,
      best = Infinity;
    for (const box of m.volume!.boxes) {
      const corners = boxOutline(box);
      for (let i = 0; i < 4; i++) {
        const a = corners[i],
          b = corners[(i + 1) % 4],
          dx = b.x - a.x,
          dz = b.z - a.z;
        const t = Math.max(
          0,
          Math.min(1, ((m.position.x - a.x) * dx + (m.position.z - a.z) * dz) / (dx * dx + dz * dz))
        );
        const p = { x: a.x + dx * t, z: a.z + dz * t },
          distance = Math.hypot(p.x - m.position.x, p.z - m.position.z);
        if (distance < best) {
          best = distance;
          point = p;
        }
      }
    }
    const margin = Math.min(best, c.parameters.pathWidthM / 2 + 0.2);
    const position = best
      ? {
          x: point.x + ((m.position.x - point.x) * margin) / best,
          z: point.z + ((m.position.z - point.z) * margin) / best
        }
      : point;
    const id = m.volume!.id + ":port";
    ports.push({ id, position, access: false });
    const from = unique.findIndex((u) => Math.abs(u.station - m.station) < 1e-6);
    links.push({
      id: `${c.owner}:path:member:${m.volume!.id.split(":").at(-1)}`,
      from: ports[from].id,
      to: id,
      width: c.parameters.pathWidthM
    });
  }
  return { ports, links };
}
