import type { IslandPlan, PlanPoint, PlanRoute } from "../../semantic-study/IslandPlanModel";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { ribbonOutline } from "../../semantic-study/WorldRibbon";
import { findLocalPath, RoadObstacleIndex } from "./LayoutKernel";
import { compileRoadPath } from "./RoadGeometry";
import { rebuildRoadTopology } from "./RoadTopology";

const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);

function closestArc(path: readonly PlanPoint[], point: PlanPoint): { arc: number; gap: number } {
  let arc = 0,
    best = { arc: 0, gap: Infinity };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      length = distance(a, b);
    const t = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.z - a.z) * (b.z - a.z)) / (length * length || 1))
    );
    const gap = distance(point, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    if (gap < best.gap) best = { arc: arc + length * t, gap };
    arc += length;
  }
  return best;
}

/** Project sparse mandatory points against final volumes and existing bridge support.
 * @param plan Detached candidate with automatic connection geometry and authored intermediate points.
 * @returns Logical road IDs whose final geometry or publication changed.
 */
export function applyAuthoredRoadPaths(plan: IslandPlan): string[] {
  const authored = plan.spatialLayout?.authoredRoadPaths;
  if (!authored || !Object.keys(authored).length) return [];
  const checks = (plan.spatialLayout!.instanceConnectionChecks ??= []);
  const volumes = plan.spatialLayout!.groups.flatMap((group) => group.volumes);
  const obstacles = new RoadObstacleIndex(volumes);
  const land = [plan.land, ...plan.islands].map((outline) => createPlanningRingQuery(outline));
  const water = plan.waters.map((area) => createPlanningRingQuery(area.outline));
  const excluded = plan.regions
    .filter((region) => region.roadExcluded)
    .map((region) => createPlanningRingQuery(region.outline));
  const landClear = (outline: PlanPoint[]) =>
    land.some((ring) => ring.containsPolygon(outline)) &&
    !water.some((ring) => ring.overlapsPolygon(outline)) &&
    !excluded.some((ring) => ring.overlapsPolygon(outline));
  const originals = new Map(plan.routes.map((route) => [route.id, route]));
  const replacements = new Map<string, PlanRoute>();
  const rejected = new Set<string>();
  for (const [id, pins] of Object.entries(authored)) {
    const route = originals.get(id);
    let projected: PlanRoute | undefined;
    if (route && pins.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))) {
      const bridges = plan.bridges.flatMap((bridge) => {
        const a = closestArc(route.points, bridge.a),
          b = closestArc(route.points, bridge.b);
        if (a.gap > 1e-3 || b.gap > 1e-3) return [];
        return [{ a: bridge.a, b: bridge.b, start: a.arc, end: b.arc, width: bridge.width }];
      });
      const bridgeClear = (a: PlanPoint, b: PlanPoint, width: number) =>
        bridges.some((bridge) => {
          const axis = [bridge.a, bridge.b];
          const pa = closestArc(axis, a),
            pb = closestArc(axis, b);
          return Math.max(pa.gap, pb.gap) + width / 2 <= bridge.width / 2 + 1e-5;
        });
      const clear = (points: PlanPoint[], outline: PlanPoint[]) =>
        !obstacles.collides(outline) &&
        !excluded.some((ring) => ring.overlapsPolygon(outline)) &&
        points.slice(1).every((b, index) => {
          const a = points[index];
          const footprint = ribbonOutline([a, b], [route.width], { start: "butt", end: "butt" }, true);
          return landClear(footprint) || bridgeClear(a, b, route.width);
        });
      const anchors: PlanPoint[] = [route.points[0], ...pins.map(({ x, z }) => ({ x, z })), route.points.at(-1)!];
      const path: PlanPoint[] = [];
      let failed = false;
      for (let i = 1; i < anchors.length && !failed; i++) {
        const a = anchors[i - 1],
          b = anchors[i];
        const start = closestArc(route.points, a).arc,
          end = closestArc(route.points, b).arc;
        const gates = bridges
          .flatMap((bridge) => {
            const entries = [
              { point: bridge.a, arc: bridge.start },
              { point: bridge.b, arc: bridge.end }
            ];
            return entries.filter(
              (gate) => gate.arc > Math.min(start, end) + 1e-4 && gate.arc < Math.max(start, end) - 1e-4
            );
          })
          .sort((a, b) => (a.arc - b.arc) * Math.sign(end - start));
        const stops = [a, ...gates.map((gate) => gate.point), b];
        for (let j = 1; j < stops.length; j++) {
          if (distance(stops[j - 1], stops[j]) < 1e-7) continue;
          const span = bridgeClear(stops[j - 1], stops[j], route.width)
            ? [stops[j - 1], stops[j]]
            : findLocalPath(stops[j - 1], stops[j], route.width, obstacles, landClear, 100);
          if (!span) {
            failed = true;
            break;
          }
          path.push(...span.slice(path.length ? 1 : 0));
        }
      }
      if (!failed && path.length >= 2)
        projected = compileRoadPath(
          route,
          path.map((point) => ({ ...point, width: route.width })),
          clear,
          0,
          1,
          { sBend: 0, straight: (a, b) => bridgeClear(a, b, route.width) }
        );
      if (projected) replacements.set(id, projected);
    }
    if (!projected) {
      rejected.add(id);
      checks.push({
        id: `authored-road:${id}`,
        rule: "authored-road-path",
        owners: [id],
        required: false,
        status: "fail",
        message: "必经点已保留；当前入口、陆域、体量或现有桥梁无法连成指定路径，暂不发布该道路。"
      });
    }
  }
  plan.routes = plan.routes
    .filter((route) => !rejected.has(route.id))
    .map((route) => replacements.get(route.id) ?? route);
  if (plan.roadNetwork)
    plan.roadNetwork = {
      ...plan.roadNetwork,
      edges: plan.roadNetwork.edges.filter((edge) => !rejected.has(edge.routeId))
    };
  // Reuse the topology splitter without network reduction: an authored journey
  // keeps its ordered walk even when intersections create a shorter alternative.
  rebuildRoadTopology(plan, () => true);
  const failedSections = new Set<string>();
  for (const section of plan.roadGraph?.sections ?? []) {
    if (!section.owners.some((id) => authored[id])) continue;
    const road = section.route;
    const blocked =
      obstacles.collides(road.outline!) ||
      road.points.slice(1).some((b, i) => {
        const a = road.points[i],
          width = Math.max(road.widths?.[i] ?? road.width, road.widths?.[i + 1] ?? road.width);
        const footprint = ribbonOutline([a, b], [width], { start: "butt", end: "butt" }, true);
        return (
          !landClear(footprint) &&
          !plan.bridges.some(
            (bridge) =>
              Math.max(closestArc([bridge.a, bridge.b], a).gap, closestArc([bridge.a, bridge.b], b).gap) + width / 2 <=
              bridge.width / 2 + 1e-5
          )
        );
      });
    if (blocked) for (const id of section.owners) if (authored[id]) failedSections.add(id);
  }
  if (failedSections.size) {
    for (const id of failedSections)
      checks.push({
        id: `authored-road:${id}`,
        rule: "authored-road-path",
        owners: [id],
        required: false,
        status: "fail",
        message: "必经点已保留；道路交汇后的实际净空或桥面支撑不足，暂不发布该道路。"
      });
    plan.routes = plan.routes.filter((route) => !failedSections.has(route.id));
    if (plan.roadNetwork)
      plan.roadNetwork = {
        ...plan.roadNetwork,
        edges: plan.roadNetwork.edges.filter((edge) => !failedSections.has(edge.routeId))
      };
    rebuildRoadTopology(plan, () => true);
  }
  for (const [id, pins] of Object.entries(authored)) {
    const result = plan.routes.find((route) => route.id === id);
    if (!result) continue;
    let previous = -1;
    const intact = pins.every((pin) => {
      const index = result.points.findIndex((point, i) => i >= previous && distance(point, pin) < 1e-4);
      previous = index;
      return index >= 0;
    });
    if (!intact) throw new Error(`Authored road topology lost a mandatory point: ${id}`);
  }
  return Object.keys(authored);
}
