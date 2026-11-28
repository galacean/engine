import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { RoadObstacleIndex, type LayoutGroup } from "./LayoutKernel";
import { publishRoadPath } from "./RoadGeometry";
import { rebuildPhysicalRoadTopology } from "./RoadTopology";
import { omitUnusableRoads } from "./RoadPublication";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { applyAuthoredRoadPaths } from "./AuthoredRoadPaths";
import { ribbonOutline } from "../../semantic-study/WorldRibbon";

/** Unedited connection geometry for deterministic instance transforms and resets. */
export interface InstanceConnectionBaseline {
  routes: IslandPlan["routes"];
  graph: IslandPlan["roadGraph"];
  network: IslandPlan["roadNetwork"];
  ports: NonNullable<IslandPlan["planning"]>["ports"];
}

const key = (p: PlanPoint) => `${p.x.toFixed(4)},${p.z.toFixed(4)}`;

/** Move member entrances and their dependent pavement without rerunning volume placement.
 * @param plan Final authored volumes with an immutable generated connection baseline.
 * @returns IDs of roads whose published geometry changed.
 */
export function updateSpatialInstanceConnections(plan: IslandPlan): string[] {
  const state = plan.spatialLayout!;
  const baseline = state.instanceConnections;
  if (!baseline) return [];
  plan.roadNetwork = baseline.network;
  const positions = new Map<string, PlanPoint>();
  const byPort = new Map<string, PlanPoint>();
  state.groups = state.groups.map((group, index) => {
    const source = state.baselineGroups![index];
    const ports = source.ports.map((port) => {
      const member = source.volumes.find((v) => port.servesVolumeId === v.id || port.id === `${v.id}:port`);
      if (!member) return port;
      const old = member.boxes[0],
        next = group.volumes.find((v) => v.id === member.id)!.boxes[0];
      // Keep the original doorway clearance while the occupied footprint grows.
      const c = Math.cos(old.yaw),
        s = Math.sin(old.yaw);
      const dx = port.position.x - old.center.x,
        dz = port.position.z - old.center.z;
      const lx = dx * c + dz * s,
        lz = -dx * s + dz * c;
      const resize = (value: number, before: number, after: number) =>
        Math.abs(value) >= before / 2 ? value + (Math.sign(value) * (after - before)) / 2 : (value * after) / before;
      const x = resize(lx, old.width, next.width),
        z = resize(lz, old.depth, next.depth);
      const position = {
        x: next.center.x + x * Math.cos(next.yaw) - z * Math.sin(next.yaw),
        z: next.center.z + x * Math.sin(next.yaw) + z * Math.cos(next.yaw)
      };
      if (Math.hypot(position.x - port.position.x, position.z - port.position.z) < 1e-8) return port;
      positions.set(key(port.position), position);
      byPort.set(port.id, position);
      return { ...port, position };
    });
    return { ...group, ports };
  });
  const pins = new Set(plan.bridges.flatMap((b) => [key(b.a), key(b.b)]));
  const move = <T extends LayoutGroup["paths"][number]>(route: T): T => {
    const first = positions.get(key(route.points[0])),
      last = positions.get(key(route.points.at(-1)!));
    if (!first && !last) return route;
    const points = route.points.map((p) => ({ ...p }));
    for (const reverse of [false, true]) {
      const target = reverse ? last : first;
      if (!target) continue;
      const original = reverse ? route.points.slice().reverse() : route.points;
      const order = reverse ? points.slice().reverse() : points;
      const stop = original.findIndex((p, i) => i > 0 && pins.has(key(p)));
      const end = stop < 0 ? original.length - 1 : stop;
      const arc = [0];
      for (let i = 1; i <= end; i++)
        arc.push(arc[i - 1] + Math.hypot(original[i].x - original[i - 1].x, original[i].z - original[i - 1].z));
      for (let i = 0; i < end; i++) {
        const weight = 1 - arc[i] / (arc[end] || 1);
        order[i].x += (target.x - original[0].x) * weight;
        order[i].z += (target.z - original[0].z) * weight;
      }
    }
    return { ...route, ...publishRoadPath({ ...route, keypoints: undefined }, points) };
  };
  state.groups = state.groups.map((group, i) => ({ ...group, paths: state.baselineGroups![i].paths.map(move) }));
  plan.routes = baseline.routes.map(move);
  if (baseline.graph) {
    const priorPaths = new Map(baseline.graph.sections.map((s) => [s.id, s.route.points]));
    plan.roadGraph = {
      ...baseline.graph,
      sections: baseline.graph.sections.map((s) => ({ ...s, route: move(s.route) }))
    };
    // Journey references are matched against the unedited physical sections.
    plan.routes = baseline.routes;
    if (positions.size) rebuildPhysicalRoadTopology(plan, () => true, priorPaths);
  } else plan.roadGraph = undefined;
  if (plan.planning)
    plan.planning = {
      ...plan.planning,
      ports: baseline.ports.map((port) => (byPort.has(port.id) ? { ...port, position: byPort.get(port.id)! } : port))
    };
  const originalVolumes = new Map(
    state.baselineGroups!.flatMap((group) => group.volumes.map((volume) => [volume.id, volume] as const))
  );
  const changedVolumes = state.groups
    .flatMap((group) => group.volumes)
    .filter((volume) => JSON.stringify(volume.boxes) !== JSON.stringify(originalVolumes.get(volume.id)?.boxes));
  state.instanceConnectionChecks = [];
  if (!positions.size && !changedVolumes.length) return applyAuthoredRoadPaths(plan);
  const obstacles = new RoadObstacleIndex(state.groups.flatMap((group) => group.volumes));
  const changedObstacles = new RoadObstacleIndex(changedVolumes);
  const land = [plan.land, ...plan.islands].map((outline) => createPlanningRingQuery(outline));
  const water = plan.waters.map((w) => createPlanningRingQuery(w.outline));
  const rejected = new Set<string>();
  const original = new Map(
    (baseline.graph?.sections ?? baseline.routes.map((route) => ({ id: route.id, route }))).map((s) => [s.id, s.route])
  );
  const unchanged = new Set(
    [...original.values()].flatMap((route) =>
      route.points
        .slice(1)
        .flatMap((p, i) => [`${key(route.points[i])}|${key(p)}`, `${key(p)}|${key(route.points[i])}`])
    )
  );
  for (const section of plan.roadGraph?.sections ?? plan.routes.map((route) => ({ id: route.id, route }))) {
    const old = original.get(section.id);
    const route = section.route;
    const samePath = old && JSON.stringify(old.points) === JSON.stringify(route.points);
    const blocked =
      changedObstacles.collides(route.outline!) ||
      (!samePath &&
        route.points.slice(1).some((point, i) => {
          if (unchanged.has(`${key(route.points[i])}|${key(point)}`)) return false;
          const outline = ribbonOutline(
            [route.points[i], point],
            [route.widths?.[i] ?? route.width, route.widths?.[i + 1] ?? route.width],
            { start: "butt", end: "butt" },
            true
          );
          return (
            !land.some((ring) => ring.containsPolygon(outline)) ||
            water.some((ring) => ring.overlapsPolygon(outline)) ||
            obstacles.collides(outline)
          );
        }));
    if (!blocked) continue;
    rejected.add(section.id);
    state.instanceConnectionChecks.push({
      id: `instance-road:${section.id}`,
      rule: "instance-road-connection",
      owners: [section.id],
      required: false,
      status: "fail",
      message: "已保留单体编辑；关联道路无法避开陆域边界、水体或其他体量，暂不发布该连接"
    });
  }
  const authoredCandidates = plan.routes.filter((route) => state.authoredRoadPaths?.[route.id]?.length);
  const authoredNetwork =
    plan.roadNetwork?.edges.filter((edge) => state.authoredRoadPaths?.[edge.routeId]?.length) ?? [];
  omitUnusableRoads(plan, rejected);
  // Automatic geometry may be blocked after a volume edit while its authored
  // detour remains feasible; let the mandatory-point solver decide that journey.
  for (const route of authoredCandidates) if (!plan.routes.some((r) => r.id === route.id)) plan.routes.push(route);
  if (plan.roadNetwork)
    for (const edge of authoredNetwork)
      if (!plan.roadNetwork.edges.some((e) => e.routeId === edge.routeId)) plan.roadNetwork.edges.push(edge);
  applyAuthoredRoadPaths(plan);
  state.instanceConnectionChecks = state.instanceConnectionChecks.filter((check) => {
    if (check.rule !== "instance-road-connection") return true;
    const section = baseline.graph?.sections.find((section) => check.owners?.includes(section.id));
    return !section?.owners.every(
      (id) => state.authoredRoadPaths?.[id]?.length && plan.routes.some((route) => route.id === id)
    );
  });
  const published = new Map(plan.routes.map((route) => [route.id, route]));
  return baseline.routes
    .filter((route) => JSON.stringify(route.points) !== JSON.stringify(published.get(route.id)?.points))
    .map((route) => route.id);
}
