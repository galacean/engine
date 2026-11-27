import type { IslandPlan, PlanPoint, PlanBridge } from "./IslandPlanModel";
import type { PlanningCheck } from "./WorldPlanningContract";
import { contains, overlap } from "./WorldPlanningGeometry";
import { findVillageAreaPath } from "./WorldLayoutPlaces";
import { pointInPolygon } from "../geometry/V2Geometry";
import { routeIntersectsRock } from "./IslandPlanAtoms";
import { PLANNING_TRAVERSAL, planningSegmentInside } from "./WorldLayoutRoutes";
import { createPlanningGroundSampler } from "./WorldPlanningTerrain";
const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const lerp = (a: PlanPoint, b: PlanPoint, t: number) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
type Interval = { lo: number; hi: number };
const merge = (items: Interval[]): Interval[] => {
  const result: Interval[] = [];
  for (const item of items.sort((a, b) => a.lo - b.lo)) {
    const last = result.at(-1);
    if (last && item.lo <= last.hi + 1e-8) last.hi = Math.max(last.hi, item.hi);
    else result.push({ ...item });
  }
  return result;
};
function linearInterval(origin: number, delta: number, min: number, max: number): Interval | undefined {
  if (Math.abs(delta) < 1e-12) return origin >= min && origin <= max ? { lo: 0, hi: 1 } : undefined;
  const a = (min - origin) / delta,
    b = (max - origin) / delta,
    lo = Math.max(0, Math.min(a, b)),
    hi = Math.min(1, Math.max(a, b));
  return lo <= hi ? { lo, hi } : undefined;
}
/** Exact centerline parameter intervals whose full-width capsule meets a polygon.
 * Edge strips plus endpoint circles cover its boundary; interior intervals cover the fill.
 */
function wetIntervals(a: PlanPoint, b: PlanPoint, ring: PlanPoint[], radius: number): Interval[] {
  const intervals: Interval[] = [],
    cuts = [0, 1],
    dx = b.x - a.x,
    dz = b.z - a.z,
    length2 = dx * dx + dz * dz;
  if (length2 < 1e-12) return pointInPolygon(a, ring) ? [{ lo: 0, hi: 1 }] : [];
  const x0 = Math.min(a.x, b.x) - radius,
    x1 = Math.max(a.x, b.x) + radius,
    z0 = Math.min(a.z, b.z) - radius,
    z1 = Math.max(a.z, b.z) + radius;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i],
      q = ring[(i + 1) % ring.length],
      ex = q.x - p.x,
      ez = q.z - p.z,
      edge2 = ex * ex + ez * ez;
    if (Math.max(p.x, q.x) < x0 || Math.min(p.x, q.x) > x1 || Math.max(p.z, q.z) < z0 || Math.min(p.z, q.z) > z1)
      continue;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) > 1e-12) {
      const t = ((p.x - a.x) * ez - (p.z - a.z) * ex) / den,
        u = ((p.x - a.x) * dz - (p.z - a.z) * dx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) cuts.push(t);
    }
    if (edge2 > 1e-12) {
      const u = linearInterval(((a.x - p.x) * ex + (a.z - p.z) * ez) / edge2, (dx * ex + dz * ez) / edge2, 0, 1),
        v = linearInterval(
          (a.x - p.x) * ez - (a.z - p.z) * ex,
          dx * ez - dz * ex,
          -radius * Math.sqrt(edge2),
          radius * Math.sqrt(edge2)
        );
      if (u && v) {
        const lo = Math.max(u.lo, v.lo),
          hi = Math.min(u.hi, v.hi);
        if (lo <= hi) intervals.push({ lo, hi });
      }
    }
    const ox = a.x - p.x,
      oz = a.z - p.z,
      B = 2 * (ox * dx + oz * dz),
      C = ox * ox + oz * oz - radius * radius,
      disc = B * B - 4 * length2 * C;
    if (disc >= 0) {
      const lo = Math.max(0, (-B - Math.sqrt(disc)) / (2 * length2)),
        hi = Math.min(1, (-B + Math.sqrt(disc)) / (2 * length2));
      if (lo <= hi) intervals.push({ lo, hi });
    }
  }
  cuts.sort((x, y) => x - y);
  for (let i = 1; i < cuts.length; i++)
    if (pointInPolygon(lerp(a, b, (cuts[i - 1] + cuts[i]) / 2), ring)) intervals.push({ lo: cuts[i - 1], hi: cuts[i] });
  return merge(intervals);
}
function project(p: PlanPoint, a: PlanPoint, b: PlanPoint): { t: number; error: number } {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1);
  return { t, error: distance(p, lerp(a, b, t)) };
}
function onBridge(p: PlanPoint, bridge: PlanBridge): number | undefined {
  const hit = project(p, bridge.a, bridge.b);
  return hit.error < 0.02 && hit.t >= -1e-6 && hit.t <= 1 + 1e-6 ? hit.t : undefined;
}

/** Independent route audit of the final snapshot; generator success checks are ignored. */
export function auditPlanningRoutes(plan: IslandPlan, changedVillages?: ReadonlySet<string>): PlanningCheck[] {
  const data = plan.planning,
    checks: PlanningCheck[] = [];
  if (!data) return checks;
  const sampleGround = createPlanningGroundSampler(plan);
  const emit = (
    id: string,
    rule: string,
    owners: string[],
    pass: boolean,
    message: string,
    position?: PlanPoint,
    measured?: number,
    limit?: number
  ) =>
    checks.push({
      id,
      rule,
      owners,
      status: pass ? "pass" : "fail",
      required: true,
      message,
      position,
      measured,
      limit
    });
  const waterIntervals = (a: PlanPoint, b: PlanPoint, width: number) =>
    merge(plan.waters.flatMap((w) => wetIntervals(a, b, w.outline, width / 2)));
  const dry = (p: PlanPoint, width: number) =>
    !plan.waters.some(
      (w) =>
        pointInPolygon(p, w.outline) ||
        wetIntervals({ x: p.x - 0.001, z: p.z }, { x: p.x + 0.001, z: p.z }, w.outline, width / 2).length
    );
  const solids = [
    ...plan.rocks,
    ...plan.buildings.map((b) => ({ ...b, obb: b.outline, groupId: b.regionId, role: "terrace" as const }))
  ];
  for (const route of changedVillages ? [] : plan.routes) {
    const auditWidth = route.maxWidth ?? route.width;
    const from = data.ports.find((p) => p.id === route.from),
      to = data.ports.find((p) => p.id === route.to),
      first = route.points[0],
      last = route.points.at(-1);
    const endpointOK =
      !!first &&
      !!last &&
      !!from &&
      !!to &&
      distance(first, from.position) < 0.01 &&
      distance(last, to.position) < 0.01;
    emit(
      `${route.id}-actual-endpoints`,
      "R01",
      [route.id, route.from, route.to],
      endpointOK,
      "实际路线首尾必须与共享端口一致",
      first
    );
    if (!first || !last || route.points.length < 2) continue;
    if (route.kind !== "ridge") {
      const outlineCovered =
        !!route.outline &&
        route.outline.every((a, i) => {
          const b = route.outline![(i + 1) % route.outline!.length],
            intervals = merge(
              route.points
                .slice(1)
                .flatMap((q, j) => wetIntervals(a, b, [route.points[j], q], (route.maxWidth ?? route.width) / 2))
            );
          return intervals.some((interval) => interval.lo <= 1e-6 && interval.hi >= 1 - 1e-6);
        });
      const recipe = plan.shapeRecipes?.find((recipe) => recipe.id === route.shapeRecipeId);
      const spans = recipe?.blocks.map((block) => Math.max(0, block.length - block.width * 0.55)) ?? [],
        total = spans.reduce((sum, length) => sum + length, 0);
      const mean =
        total && recipe ? recipe.blocks.reduce((sum, block, i) => sum + block.width * spans[i], 0) / total : NaN;
      const widthsOK =
        !!recipe &&
        recipe.blocks.every(
          (block) => block.width >= PLANNING_TRAVERSAL.minWidth - 1e-6 && block.width <= auditWidth
        ) &&
        Math.abs(mean - route.width) < 1e-5;
      emit(
        `${route.id}-actual-component-widths`,
        "R01",
        [route.id],
        widthsOK,
        "实际源矩形满足净宽，长度加权平均保持用户平均宽度",
        first,
        mean,
        route.width
      );
      const outlineOK =
        outlineCovered &&
        contains(plan.land, route.outline!) &&
        !solids.some((solid) => overlap(route.outline!, solid.obb));
      emit(
        `${route.id}-actual-outline`,
        "R01",
        [route.id],
        outlineOK,
        "实际矩形拼接道路轮廓必须在陆域内并避让实体",
        first
      );
    }
    const bridges = plan.bridges.filter((b) => b.id.startsWith(`${route.id}-crossing-`));
    const validBridges = bridges.filter((bridge) => {
      const span = distance(bridge.a, bridge.b),
        a = data.ports.find((p) => p.id === `${bridge.id}-0`),
        b = data.ports.find((p) => p.id === `${bridge.id}-1`);
      const spanOK = span > 0 && span <= PLANNING_TRAVERSAL.maxCrossingSpan,
        grade = Math.abs(sampleGround(bridge.a) - sampleGround(bridge.b)) / (span || 1);
      const endpoints =
        !!a &&
        !!b &&
        distance(a.position, bridge.a) < 0.01 &&
        distance(b.position, bridge.b) < 0.01 &&
        Math.abs(a.height - sampleGround(bridge.a)) < 0.1 &&
        Math.abs(b.height - sampleGround(bridge.b)) < 0.1;
      const onRoute = [bridge.a, bridge.b].every((p) =>
        route.points.slice(1).some((q, i) => {
          const hit = project(p, route.points[i], q);
          return hit.error < 0.01 && hit.t >= -1e-6 && hit.t <= 1 + 1e-6;
        })
      );
      const referencedWater = plan.waters.find((water) => water.id === bridge.riverId),
        crossesReferencedWater =
          !!referencedWater && wetIntervals(bridge.a, bridge.b, referencedWater.outline, bridge.width / 2).length > 0;
      const valid =
        crossesReferencedWater &&
        spanOK &&
        grade <= PLANNING_TRAVERSAL.maxCrossingGrade &&
        endpoints &&
        onRoute &&
        bridge.width >= Math.max(auditWidth, PLANNING_TRAVERSAL.minWidth) &&
        dry(bridge.a, bridge.width) &&
        dry(bridge.b, bridge.width) &&
        planningSegmentInside(bridge.a, bridge.a, plan.land, bridge.width / 2) &&
        planningSegmentInside(bridge.b, bridge.b, plan.land, bridge.width / 2);
      emit(
        `${bridge.id}-actual`,
        "R03",
        [route.id, bridge.id],
        valid,
        "实际跨越必须具备干地落脚、同位端口、允许跨度/坡度并属于实际路线",
        bridge.a,
        span,
        PLANNING_TRAVERSAL.maxCrossingSpan
      );
      return valid;
    });
    let hasWater = false,
      waterCovered = true,
      clear = true;
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i];
      if (route.kind !== "ridge") {
        if (
          !planningSegmentInside(a, b, plan.land, auditWidth / 2) ||
          solids.some((solid) => routeIntersectsRock(a, b, solid, auditWidth / 2))
        )
          clear = false;
        const wet = waterIntervals(a, b, auditWidth);
        hasWater ||= wet.length > 0;
        const covered = merge(
          validBridges.flatMap((bridge) => {
            const start = project(bridge.a, a, b),
              end = project(bridge.b, a, b);
            return start.error < 0.01 && end.error < 0.01
              ? [{ lo: Math.max(0, Math.min(start.t, end.t)), hi: Math.min(1, Math.max(start.t, end.t)) }]
              : [];
          })
        );
        for (const interval of wet)
          if (!covered.some((c) => c.lo <= interval.lo + 1e-6 && c.hi >= interval.hi - 1e-6)) waterCovered = false;
      }
    }
    if (route.kind !== "ridge") {
      emit(`${route.id}-actual-corridor`, "R01", [route.id], clear, "实际全宽路线位于陆域且避让实体", first);
      emit(
        `${route.id}-actual-water`,
        "R03",
        [route.id],
        waterCovered,
        "所有实际水域并集相交区间必须由有效跨越范围覆盖",
        first
      );
    }
    const relation = data.relations.find((r) => r.id === route.id && (r.kind === "connects" || r.kind === "supports"));
    emit(
      `${route.id}-actual-network`,
      "R04",
      [route.id],
      !!relation &&
        relation.ports.includes(route.from) &&
        relation.ports.includes(route.to) &&
        relation.network === (hasWater ? "planned" : "supported"),
      "连接图类型和端口必须与实际路线/跨越一致",
      first
    );
    const profile = data.profiles.find((p) => p.ownerId === route.id && p.kind === "route"),
      lengths = [0];
    for (let i = 1; i < route.points.length; i++)
      lengths.push(lengths[i - 1] + distance(route.points[i - 1], route.points[i]));
    const samples = profile?.points ?? [],
      positions: number[] = [];
    let geometryOK =
      !!profile &&
      profile.width >= auditWidth &&
      samples.length >= 2 &&
      distance(samples[0], first) < 0.01 &&
      distance(samples.at(-1)!, last) < 0.01 &&
      !!from &&
      !!to &&
      Math.abs(samples[0].y - from.height) < 0.15 &&
      Math.abs(samples.at(-1)!.y - to.height) < 0.15;
    for (const p of samples) {
      let position: number | undefined;
      for (let i = 1; i < route.points.length; i++) {
        const hit = project(p, route.points[i - 1], route.points[i]);
        if (hit.error < 0.01 && hit.t >= -1e-6 && hit.t <= 1 + 1e-6) {
          const along = lengths[i - 1] + hit.t * (lengths[i] - lengths[i - 1]);
          if (along >= (positions.at(-1) ?? 0) - 0.01) {
            position = along;
            break;
          }
        }
      }
      if (position === undefined) {
        geometryOK = false;
        positions.push(Infinity);
      } else positions.push(position);
    }
    geometryOK &&= lengths.every((bend) => positions.some((position) => Math.abs(position - bend) < 0.01));
    emit(
      `${route.id}-actual-profile-geometry`,
      "T01",
      [route.id],
      geometryOK,
      "纵断面必须覆盖实际路线所有转折且顺序一致",
      first
    );
    if (route.kind === "ridge" || !geometryOK) continue;
    const expectedHeight = (p: PlanPoint): number => {
      for (const bridge of validBridges) {
        const t = onBridge(p, bridge);
        if (t !== undefined) return sampleGround(bridge.a) + (sampleGround(bridge.b) - sampleGround(bridge.a)) * t;
      }
      return sampleGround(p);
    };
    const profileHeight = (at: number): number => {
      for (let i = 1; i < positions.length; i++)
        if (at <= positions[i] + 1e-6) {
          const t = (at - positions[i - 1]) / (positions[i] - positions[i - 1] || 1);
          return samples[i - 1].y + (samples[i].y - samples[i - 1].y) * t;
        }
      return samples.at(-1)!.y;
    };
    let heightError = 0,
      maxSlope = 0;
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i],
        length = distance(a, b),
        count = Math.max(1, Math.ceil(length / 4));
      let previous = expectedHeight(a);
      for (let j = 0; j <= count; j++) {
        const p = lerp(a, b, j / count),
          height = expectedHeight(p);
        heightError = Math.max(heightError, Math.abs(profileHeight(lengths[i - 1] + (length * j) / count) - height));
        if (j) maxSlope = Math.max(maxSlope, Math.abs(height - previous) / (length / count || 1));
        previous = height;
        if (!validBridges.some((bridge) => onBridge(p, bridge) !== undefined) && length > 0) {
          const nx = ((-(b.z - a.z) / length) * auditWidth) / 2,
            nz = (((b.x - a.x) / length) * auditWidth) / 2;
          maxSlope = Math.max(
            maxSlope,
            Math.abs(sampleGround({ x: p.x + nx, z: p.z + nz }) - sampleGround({ x: p.x - nx, z: p.z - nz })) /
              auditWidth
          );
        }
      }
    }
    emit(
      `${route.id}-actual-profile-height`,
      "T01",
      [route.id],
      heightError <= 0.15,
      "纵断面独立重采样须与最终地表/计划跨越绝对高程一致",
      first,
      heightError,
      0.15
    );
    emit(
      `${route.id}-actual-slope`,
      "R01",
      [route.id],
      maxSlope <= PLANNING_TRAVERSAL.maxSlope + 0.005,
      "实际纵横坡须满足临时规划能力",
      first,
      maxSlope,
      PLANNING_TRAVERSAL.maxSlope
    );
  }
  for (const village of plan.regions.filter(
    (region) =>
      (region.kind === "village" || region.kind === "teleport") && (!changedVillages || changedVillages.has(region.id))
  )) {
    const activity = data.ports.find((port) => port.id === `${village.id}-activity`),
      ports = data.ports.filter((port) => port.ownerId === village.id && port.kind === "entrance"),
      buildings = plan.buildings.filter((building) => building.regionId === village.id),
      doors = buildings.map((building) => data.ports.find((port) => port.id === `${building.id}-door`));
    let valid =
      !!activity &&
      ports.length > 0 &&
      (village.kind === "teleport" || village.surface === "road") &&
      !!village.navigationArea &&
      contains(village.outline, village.navigationArea);
    for (const port of [...ports, ...doors]) {
      if (!port || !activity) {
        valid = false;
        continue;
      }
      // Rebuild reachability from the area and current building obstacles. Stored
      // witnesses are not trusted, and no visible per-building road is required.
      const points = findVillageAreaPath(
        plan,
        village,
        activity.position,
        port.position,
        village.navigationWidth ?? 4,
        sampleGround
      );
      if (!points) {
        valid = false;
        continue;
      }
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          length = distance(a, b),
          count = Math.max(1, Math.ceil(length / 4));
        let previous = sampleGround(a);
        for (let j = 1; j <= count; j++) {
          const p = lerp(a, b, j / count),
            height = sampleGround(p);
          if (Math.abs(height - previous) / (length / count || 1) > PLANNING_TRAVERSAL.maxSlope + 0.005) valid = false;
          previous = height;
        }
      }
      const relation = data.relations.some(
        (relation) =>
          relation.network === "supported" &&
          relation.owners.includes(village.id) &&
          relation.ports.includes(activity.id) &&
          relation.ports.includes(port.id)
      );
      if (!relation) valid = false;
    }
    emit(
      `${village.id}-actual-internal-network`,
      "P01",
      [village.id, ...buildings.map((building) => building.id)],
      valid,
      "道路纹理通行区域须在建筑避让后连接各入口与门口，无需可见内部道路"
    );
  }
  return checks;
}
