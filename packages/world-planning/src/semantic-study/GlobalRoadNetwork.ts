import { riverRoadQueries } from "../spatial/hydrology/RiverCrossings";
import { buildPlanningScene, roadComponents } from "../spatial/PlanningScene";
import { overlap, inRing } from "./WorldPlanningGeometry";
import { settlementRandom as random } from "./SettlementGeometry";
import limits from "../planning-data/road-network.json";
import type { IslandPlan, PlanPoint, PlanRoute } from "./IslandPlanModel";
import type { PlanningCheck, PlanningPort, SemanticEdit } from "./WorldPlanningContract";
import { createPlanningGroundSampler, createPlanningRingQuery } from "./WorldPlanningTerrain";
import { compileRoadPath, publishRoadPath, ROAD_GEOMETRY_VERSION } from "../spatial/layout/RoadGeometry";
import { findLocalPath, RoadObstacleIndex } from "../spatial/layout/LayoutKernel";
import { wayfindingPolicy, type WayfindingPolicy } from "../spatial/guidance/WayfindingPolicy";
import { footprintBoundsLookup } from "../spatial/layout/FootprintLookup";
import { ribbonOutline } from "./WorldRibbon";
import { bounds } from "../spatial/layout/Volumes";

/** Semantic network parameters; search budgets and terrain limits are authored separately. */
export interface RoadNetworkConfig {
  wayfinding?: WayfindingPolicy;
  sBend?: number;
  widthM: number;
  bend: number;
  loopiness: number;
}
export interface RoadNetworkNode {
  id: string;
  domainId: string;
  poiId?: string;
  portId: string;
  position: PlanPoint;
  grid: number;
}
export interface RoadNetworkSnapshot {
  geometryVersion?: number;
  nodes: RoadNetworkNode[];
  edges: {
    routeId: string;
    a: string;
    b: string;
    gridPath: number[];
    spine?: PlanPoint[];
    curve?: PlanPoint[];
    widthM?: number;
    bend?: number;
    sBend?: number;
  }[];
  domains: { id: string; nodes: number; components: number; cycleRank: number }[];
}
interface RoadGrid {
  valid: Uint8Array;
  edges: Map<string, boolean>;
  grades: Map<string, number>;
  components?: Int32Array;
  componentSizes?: number[];
}
// Width and obstacle/terrain geometry affect traversability; route bend and loops do not.
const gridCache = new Map<string, RoadGrid>();
const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Connect declared access ports and suitable POI nodes using a seeded graph on each landmass.
 * Ground-only paths never silently bridge sea or cross solid landforms. Local transactions
 * keep feasible unaffected edges; a failed connection never vetoes volume placement.
 * @param options Defer metadata when a pipeline will still change topology or crossings;
 * the caller must publish it once from the final roads. Standalone calls publish by default.
 */
export function planGlobalRoadNetwork(
  plan: IslandPlan,
  config: RoadNetworkConfig,
  previous?: IslandPlan,
  edits: Record<string, SemanticEdit> = {},
  options: { publishMetadata?: boolean; deferCurves?: boolean } = {}
): PlanningCheck[] {
  if (!Number.isFinite(config.widthM) || config.widthM <= 0) throw new Error("全局路宽须为有限正数");
  if (![config.bend, config.loopiness].every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
    throw new Error("道路曲折和连接冗余须在 0–1 范围内");
  const ground = createPlanningGroundSampler(plan),
    step = limits.gridStepM,
    columns = Math.ceil(plan.parameters.width / step),
    rows = Math.ceil(plan.parameters.depth / step),
    radius = config.widthM / 2 + limits.clearanceM;
  const snapshot: RoadNetworkSnapshot = { geometryVersion: ROAD_GEOMETRY_VERSION, nodes: [], edges: [], domains: [] },
    checks: PlanningCheck[] = [];
  const scene = buildPlanningScene(plan);
  const roadInputs = roadComponents(scene);
  const waterIds = new Set(plan.waters.map((w) => w.id));
  const solids = roadInputs.obstacles
    .filter((o) => !waterIds.has(o.owner))
    .map((s) => ({ ...s, ring: createPlanningRingQuery(s.outline) }));
  const waters = riverRoadQueries(plan).map((query, i) => ({ ...query, outline: plan.waters[i].outline }));
  const villages = roadInputs.exclusions.map((r) => ({
    id: r.id,
    outline: r.outline,
    ring: createPlanningRingQuery(r.outline)
  }));
  const roadAvoidance = [
    ...plan.regions.filter((r) => r.roadExcluded),
    ...(plan.planning?.reservations.filter((area) => area.kind === "activity") ?? [])
  ].map((r) => ({ ...r, ring: createPlanningRingQuery(r.outline) }));
  const solidsAt = footprintBoundsLookup(solids, (s) => s.outline),
    watersAt = footprintBoundsLookup(waters, (w) => w.outline),
    villagesAt = footprintBoundsLookup(villages, (v) => v.outline),
    localObstacles = new RoadObstacleIndex(plan.spatialLayout?.groups.flatMap((g) => g.volumes) ?? []);
  const segmentBounds = (a: PlanPoint, b: PlanPoint, radius: number) => ({
    x0: Math.min(a.x, b.x) - radius - 1e-7,
    x1: Math.max(a.x, b.x) + radius + 1e-7,
    z0: Math.min(a.z, b.z) - radius - 1e-7,
    z1: Math.max(a.z, b.z) + radius + 1e-7
  });
  const gridPoint = (id: number): PlanPoint => ({
    x: ((id % columns) + 0.5) * step,
    z: (Math.floor(id / columns) + 0.5) * step
  });
  const routes: PlanRoute[] = [];
  // Sample the actual ground along edges. Grade is a route cost and diagnostic, never a volume-placement gate.
  const segmentGrade = (a: PlanPoint, b: PlanPoint) => {
    const length = distance(a, b);
    if (length <= 1e-6) return 0;
    const steps = Math.max(1, Math.ceil(length / 2));
    let previousHeight = ground(a),
      steepest = 0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const height = ground({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      steepest = Math.max(steepest, Math.abs(height - previousHeight) / (length / steps));
      previousHeight = height;
    }
    return steepest;
  };
  const routeGrade = (points: PlanPoint[]) => Math.max(0, ...points.slice(1).map((p, i) => segmentGrade(points[i], p)));
  const geometryKey = JSON.stringify([
    plan.parameters,
    plan.regionFields?.elevation,
    plan.land,
    plan.islands,
    plan.waters,
    plan.planning?.profiles,
    solids.map((s) => [s.owner, s.outline]),
    plan.regions.filter((r) => r.kind === "village" || r.roadExcluded).map((r) => r.outline),
    roadAvoidance.map((area) => area.outline),
    radius
  ]);
  for (const domain of plan.poiDistribution!.domains) {
    const routePrefix = `world-route-${domain.id}-`;
    const key = geometryKey + JSON.stringify(domain),
      cached = gridCache.get(key);
    const land = createPlanningRingQuery(domain.outline),
      valid = cached?.valid ?? new Uint8Array(columns * rows);
    const physical = (a: PlanPoint, b: PlanPoint, ignore?: string) => {
      if (!land.containsSegment(a, b, radius)) return false;
      const box = segmentBounds(a, b, radius);
      return (
        !solidsAt(box).some((s) => s.owner !== ignore && s.ring.touchesSegment(a, b, radius)) &&
        !roadAvoidance.some((r) => r.ring.touchesSegment(a, b, radius)) &&
        !watersAt(box).some((w) => w.ring.touchesSegment(a, b, radius))
      );
    };
    if (!cached) {
      // No point outside this landmass's bounds can pass containsSegment. Small
      // islands do not need another full-world scan; grid IDs/order stay unchanged.
      const box = bounds(domain.outline, 1e-7),
        x0 = Math.max(0, Math.ceil(box.x0 / step - 0.5)),
        x1 = Math.min(columns - 1, Math.floor(box.x1 / step - 0.5)),
        z0 = Math.max(0, Math.ceil(box.z0 / step - 0.5)),
        z1 = Math.min(rows - 1, Math.floor(box.z1 / step - 0.5));
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const i = z * columns + x,
            p = gridPoint(i);
          if (
            physical(p, p) &&
            !villagesAt(segmentBounds(p, p, radius)).some((v) => v.ring.touchesSegment(p, p, radius))
          )
            valid[i] = 1;
        }
    }
    const edgeValidity = cached?.edges ?? new Map<string, boolean>();
    const edgeGrades = cached?.grades ?? new Map<string, number>();
    const traversable = (a: number, b: number) => {
      const key = edgeKey(a, b);
      let okay = edgeValidity.get(key);
      if (okay === undefined) {
        const pa = gridPoint(a),
          pb = gridPoint(b);
        okay =
          !!valid[b] &&
          physical(pa, pb) &&
          !villagesAt(segmentBounds(pa, pb, radius)).some((v) => v.ring.touchesSegment(pa, pb, radius));
        edgeValidity.set(key, okay);
      }
      return okay;
    };
    // Keep road anchors on the largest walkable component; water remains an obstacle.
    const dryComponents = cached?.components ?? new Int32Array(valid.length).fill(-1),
      componentSizes = cached?.componentSizes ?? [];
    if (!cached?.components) {
      for (let start = 0; start < valid.length; start++) {
        if (!valid[start] || dryComponents[start] >= 0) continue;
        const index = componentSizes.length,
          queue = [start];
        dryComponents[start] = index;
        for (let cursor = 0; cursor < queue.length; cursor++) {
          const at = queue[cursor],
            x = at % columns,
            z = Math.floor(at / columns);
          const candidates: number[] = [];
          for (const [dx, dz] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1]
          ])
            if (x + dx >= 0 && x + dx < columns && z + dz >= 0 && z + dz < rows)
              candidates.push((z + dz) * columns + x + dx);
          for (const next of candidates)
            if (valid[next] && dryComponents[next] < 0 && traversable(at, next)) {
              dryComponents[next] = index;
              queue.push(next);
            }
        }
        componentSizes.push(queue.length);
      }
      gridCache.set(key, {
        valid,
        edges: edgeValidity,
        grades: edgeGrades,
        components: dryComponents,
        componentSizes
      });
      if (gridCache.size > 8) gridCache.delete(gridCache.keys().next().value!);
    }
    const anchorComponent = componentSizes.indexOf(Math.max(0, ...componentSizes));
    const approaches = new Map<string, PlanPoint[]>();
    const nearest = (point: PlanPoint, gate?: PlanningPort) => {
      // Anchor search is spatially bounded; do not rescan the entire world for each entrance.
      const nearby: number[] = [];
      const reach = limits.maxAnchorOffsetM;
      const x0 = Math.max(0, Math.ceil((point.x - reach) / step - 0.5)),
        x1 = Math.min(columns - 1, Math.floor((point.x + reach) / step - 0.5));
      const z0 = Math.max(0, Math.ceil((point.z - reach) / step - 0.5)),
        z1 = Math.min(rows - 1, Math.floor((point.z + reach) / step - 0.5));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) nearby.push(z * columns + x);

      let best = -1,
        gap = Infinity;
      for (const i of nearby)
        if (valid[i] && dryComponents[i] === anchorComponent) {
          const p = gridPoint(i),
            d = distance(point, p);
          if (
            d < gap &&
            d <= limits.maxAnchorOffsetM &&
            (!gate ||
              (physical(point, p, gate.ownerId) &&
                (!gate.roadAccess?.heading ||
                  (p.x - point.x) * gate.roadAccess.heading.x + (p.z - point.z) * gate.roadAccess.heading.z >
                    distance(p, point) * 0.25)))
          ) {
            best = i;
            gap = d;
          }
        }
      if (best < 0 && gate && plan.spatialLayout) {
        const candidates = nearby
          .filter(
            (i) =>
              valid[i] &&
              dryComponents[i] === anchorComponent &&
              distance(point, gridPoint(i)) <= limits.maxAnchorOffsetM
          )
          .sort((a, b) => distance(point, gridPoint(a)) - distance(point, gridPoint(b)))
          .slice(0, limits.anchorSearchCandidates);
        for (const candidate of candidates) {
          const points = findLocalPath(
            point,
            gridPoint(candidate),
            config.widthM,
            localObstacles,
            (outline) =>
              land.containsPolygon(outline) &&
              !watersAt(bounds(outline, 1e-7)).some((w) => w.ring.overlapsPolygon(outline)),
            limits.maxAnchorOffsetM
          );
          if (points) {
            best = candidate;
            approaches.set(gate.id, points);
            break;
          }
        }
      }
      return best;
    };
    const nodes: RoadNetworkNode[] = [];
    const entrances = roadInputs.ports.filter(
      (p) => (plan.spatialLayout ? !!p.roadAccess : p.roadAccess?.required) && land.inside(p.position)
    );
    const accessScores = new Map<string, number>();
    for (const port of entrances) {
      const grid = nearest(port.position, port);
      if (grid < 0) continue;
      const old = previous?.roadNetwork?.nodes.find(
        (n) => n.poiId === port.roadAccess?.poiId && n.domainId === domain.id
      );
      const peers = entrances.filter((p) => p.ownerId !== port.ownerId);
      // Choose a connected entrance facing nearby network demand, instead of the first array entry.
      // Keep a previously published feasible entrance stable during local updates.
      const score =
        old?.portId === port.id
          ? -1
          : distance(port.position, gridPoint(grid)) +
            (peers.length ? Math.min(...peers.map((p) => distance(port.position, p.position))) : 0);
      const existing = plan.spatialLayout ? nodes.findIndex((n) => n.poiId === port.roadAccess?.poiId) : -1;
      if (existing >= 0 && accessScores.get(nodes[existing].id)! <= score) continue;
      const node = {
        id: port.id,
        portId: port.id,
        domainId: domain.id,
        poiId: port.roadAccess?.poiId,
        position: { ...port.position },
        grid
      };
      accessScores.set(node.id, score);
      if (existing >= 0) nodes[existing] = node;
      else nodes.push(node);
    }
    for (const owner of new Set(entrances.map((p) => p.ownerId)))
      if (!nodes.some((n) => entrances.some((p) => p.ownerId === owner && p.id === n.portId)))
        checks.push({
          id: `network-gate-${owner}`,
          rule: "network-access",
          required: false,
          status: "fail",
          owners: [owner],
          message: "本次未找到入口的全局道路接入点"
        });
    const sites = roadInputs.sites
      .filter(
        (p) =>
          !plan.spatialLayout && p.domainId === domain.id && p.tier !== "small" && !nodes.some((n) => n.poiId === p.id)
      )
      .sort(
        (a, b) =>
          Number(b.memberIds.length > 0) - Number(a.memberIds.length > 0) ||
          Number(b.tier === "large") - Number(a.tier === "large") ||
          a.id.localeCompare(b.id)
      );
    for (const site of sites) {
      if (nodes.length >= limits.maxNodesPerDomain) break;
      const old = previous?.roadNetwork?.nodes.find((n) => n.poiId === site.id),
        grid = old && valid[old.grid] && dryComponents[old.grid] === anchorComponent ? old.grid : nearest(site.center);
      if (grid < 0 || nodes.some((n) => n.grid === grid)) continue;
      const portId = `network-${domain.id}-${grid}`;
      nodes.push({
        id: site.id,
        poiId: site.id,
        portId,
        domainId: domain.id,
        grid,
        position: old && grid === old.grid ? old.position : gridPoint(grid)
      });
    }
    if (nodes.length < 2) {
      snapshot.domains.push({ id: domain.id, nodes: nodes.length, components: nodes.length, cycleRank: 0 });
      snapshot.nodes.push(...nodes);
      continue;
    }
    nodes.sort((a, b) => a.id.localeCompare(b.id));
    const candidatePairs = nodes.flatMap((a, i) =>
      nodes.slice(i + 1).map((b) => ({
        a,
        b,
        score: distance(a.position, b.position) * (0.8 + 0.4 * random(plan.parameters.seed, a.id + ":" + b.id))
      }))
    );
    candidatePairs.sort((a, b) => a.score - b.score);
    const groups = new Map(nodes.map((n) => [n.id, n.id])),
      root = (id: string): string => {
        while (groups.get(id) !== id) id = groups.get(id)!;
        return id;
      };
    let pairs: typeof candidatePairs = [];
    for (const pair of candidatePairs)
      if (root(pair.a.id) !== root(pair.b.id)) {
        groups.set(root(pair.a.id), root(pair.b.id));
        pairs.push(pair);
      }
    for (const pair of candidatePairs)
      if (
        !pairs.includes(pair) &&
        pairs.length < nodes.length - 1 + Math.ceil(nodes.length * config.loopiness * 0.4) &&
        random(plan.parameters.seed, pair.a.id + pair.b.id + "loop") < config.loopiness
      )
        pairs.push(pair);
    const oldEdges = previous?.roadNetwork?.edges.filter(
      (e) => nodes.some((n) => n.id === e.a) && nodes.some((n) => n.id === e.b)
    );
    if (
      oldEdges?.length &&
      previous!.roadNetwork!.nodes.filter((n) => n.domainId === domain.id).length === nodes.length
    )
      pairs = oldEdges.map((e) => ({
        a: nodes.find((n) => n.id === e.a)!,
        b: nodes.find((n) => n.id === e.b)!,
        score: 0
      }));
    // Keep feasible previous edges, then try alternative component pairs if any chosen edge fails.
    const preferredCount = pairs.length;
    const selected = new Set(pairs.map((p) => p.a.id + "→" + p.b.id));
    pairs.push(...candidatePairs.filter((p) => !selected.has(p.a.id + "→" + p.b.id)));
    for (const node of nodes) groups.set(node.id, node.id);
    snapshot.nodes.push(...nodes);
    const edgeClear = (a: number, b: number, width: number) => {
      if (!traversable(a, b)) return false;
      const key = edgeKey(a, b);
      let grade = edgeGrades.get(key);
      if (grade === undefined) {
        grade = segmentGrade(gridPoint(a), gridPoint(b));
        edgeGrades.set(key, grade);
      }
      if (width <= config.widthM) return true;
      const pa = gridPoint(a),
        pb = gridPoint(b),
        r = width / 2 + limits.clearanceM,
        box = segmentBounds(pa, pb, r);
      return (
        land.containsSegment(pa, pb, r) &&
        !solidsAt(box).some((o) => o.ring.touchesSegment(pa, pb, r)) &&
        !watersAt(box).some((w) => w.ring.touchesSegment(pa, pb, r)) &&
        !villagesAt(box).some((v) => v.ring.touchesSegment(pa, pb, r))
      );
    };
    const path = (start: number, end: number, settings: RoadNetworkConfig): number[] | undefined => {
      const costs = new Float64Array(valid.length).fill(Infinity),
        parent = new Int32Array(valid.length).fill(-1),
        queue = new Heap();
      costs[start] = 0;
      queue.push(start, distance(gridPoint(start), gridPoint(end)));
      const done = new Set<number>();
      let visits = 0;
      while (queue.size && visits++ < limits.maxSearchVisits) {
        const at = queue.pop();
        if (done.has(at)) continue;
        done.add(at);
        if (at === end) {
          const route = [at];
          while (route.at(-1) !== start) route.push(parent[route.at(-1)!]);
          return route.reverse();
        }
        const x = at % columns,
          z = Math.floor(at / columns);
        for (const [dx, dz] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1]
        ]) {
          if (x + dx < 0 || x + dx >= columns || z + dz < 0 || z + dz >= rows) continue;
          const next = (z + dz) * columns + x + dx;
          if (!valid[next] || done.has(next) || !edgeClear(at, next, settings.widthM)) continue;
          const incoming = parent[at] >= 0 ? gridPoint(parent[at]) : undefined;
          const bendCos = incoming
            ? ((gridPoint(at).x - incoming.x) * dx + (gridPoint(at).z - incoming.z) * dz) /
              (distance(gridPoint(at), incoming) * Math.hypot(dx, dz))
            : 1;
          const turnCost = step * limits.turnPenalty * (1 - bendCos) ** 2;
          const cost =
            costs[at] +
            turnCost +
            Math.hypot(dx, dz) *
              step *
              (1 + limits.slopePenalty * Math.max(0, (edgeGrades.get(edgeKey(at, next)) ?? 0) / limits.maxSlope) ** 2);
          if (cost >= costs[next]) continue;
          costs[next] = cost;
          parent[next] = at;
          queue.push(next, cost + distance(gridPoint(next), gridPoint(end)));
        }
      }
    };
    const portMap = new Map<number, string>();
    for (const n of nodes) if (distance(n.position, gridPoint(n.grid)) < 1e-6) portMap.set(n.grid, n.portId);
    const addGridPort = (grid: number) => {
      const id = portMap.get(grid) ?? `network-${domain.id}-${grid}`;
      portMap.set(grid, id);
      if (!plan.planning!.ports.some((p) => p.id === id))
        plan.planning!.ports.push({
          id,
          ownerId: "world-routes",
          position: gridPoint(grid),
          height: ground(gridPoint(grid)),
          width: config.widthM,
          kind: "landing",
          surfaceId: "ground"
        });
      return id;
    };
    // Each edge uses a stable terrain cost, independent of edit history or generation order.
    for (let i = 0; i < pairs.length; i++) {
      const { a, b } = pairs[i];
      if (i >= preferredCount && root(a.id) === root(b.id)) continue;
      const id = `${routePrefix}${a.id}-${b.id}`;
      const oldEdge = previous?.roadNetwork?.edges.find((e) => e.routeId === id && e.a === a.id && e.b === b.id),
        oldRoute = previous?.routes.find((r) => r.id === id);
      const localPolicy = wayfindingPolicy(config.wayfinding, edits[id]?.wayfinding);
      const settings = {
        ...config,
        ...(roadInputs.ports.some(
          (p) => (p.id === a.portId || p.id === b.portId) && p.roadAccess?.preferredWidthM !== undefined
        )
          ? {
              widthM: Math.max(
                ...roadInputs.ports
                  .filter((p) => p.id === a.portId || p.id === b.portId)
                  .flatMap((p) => (p.roadAccess?.preferredWidthM === undefined ? [] : [p.roadAccess.preferredWidthM]))
              )
            }
          : {}),
        ...edits[id]?.road,
        sBend: config.wayfinding || edits[id]?.wayfinding ? localPolicy.sBend : config.sBend
      };
      if (
        !Number.isFinite(settings.widthM) ||
        settings.widthM <= 0 ||
        !Number.isFinite(settings.bend) ||
        settings.bend < 0 ||
        settings.bend > 1 ||
        !Number.isFinite(settings.sBend ?? 0) ||
        (settings.sBend ?? 0) < 0 ||
        (settings.sBend ?? 0) > 1
      )
        throw new Error("道路参数超出范围");
      const endpointName = (node: RoadNetworkNode) => {
        const port = roadInputs.ports.find((p) => p.id === node.portId);
        if (port) {
          const owner = scene.entities.get(port.ownerId);
          const peers = roadInputs.ports.filter((p) => p.ownerId === port.ownerId);
          return (
            (owner?.name ?? port.ownerId) +
            (peers.length > 1 ? ` · 入口 ${peers.findIndex((p) => p.id === port.id) + 1}` : " · 入口")
          );
        }
        const site = roadInputs.sites.find((p) => p.id === node.poiId);
        if (plan.spatialLayout && site) return scene.entities.get(site.id)?.name ?? site.id;
        const member = site?.memberIds.map((id) => scene.entities.get(id)).find(Boolean);
        return (
          member?.name ??
          scene.entities.get(node.poiId ?? node.id)?.name ??
          `接入点 (${Math.round(node.position.x)}, ${Math.round(node.position.z)})`
        );
      };
      const label = endpointName(a) + " ↔ " + endpointName(b);
      const retained =
        previous?.roadNetwork?.geometryVersion === ROAD_GEOMETRY_VERSION &&
        oldEdge &&
        oldRoute &&
        (oldEdge.widthM ?? oldRoute.width) === settings.widthM &&
        (oldEdge.bend ?? config.bend) === settings.bend &&
        (oldEdge.sBend ?? 0) === (settings.sBend ?? 0) &&
        distance(oldRoute.points[0], a.position) < 1e-6 &&
        distance(oldRoute.points.at(-1)!, b.position) < 1e-6 &&
        land.containsPolygon(oldRoute.outline!) &&
        !waters.some((w) => w.ring.overlapsPolygon(oldRoute.outline!)) &&
        !solids.some(
          (o) =>
            !plan.planning!.ports.some(
              (p) => (p.id === oldRoute.from || p.id === oldRoute.to) && p.ownerId === o.owner
            ) && overlap(oldRoute.outline!, o.outline)
        );
      let gridPath = retained ? oldEdge.gridPath : path(a.grid, b.grid, settings);
      if (!gridPath)
        for (const scale of [0.75, 0.5, 0.25, 0.125]) {
          gridPath = path(a.grid, b.grid, { ...settings, widthM: settings.widthM * scale });
          if (gridPath) break;
        }
      if (!gridPath) {
        checks.push({
          id: `${id}-path`,
          rule: "network-path",
          owners: [a.id, b.id],
          required: false,
          status: "fail",
          message: "预算内未找到满足约束的全局接入道路"
        });
        continue;
      }
      const approachA = approaches.get(a.portId) ?? [a.position, gridPoint(a.grid)];
      const approachB = approaches.get(b.portId) ?? [b.position, gridPoint(b.grid)];
      const points = [...approachA.slice(0, -1), ...gridPath.map(gridPoint), ...approachB.slice(0, -1).reverse()];
      // Only actual access points are navigation junctions. Search-grid corners are disposable geometry.
      // This removes short reversed gate/grid stubs without forcing a curve through every staircase cell.
      for (const node of [a, b]) if (!plan.planning!.ports.some((p) => p.id === node.portId)) addGridPort(node.grid);
      const endpointOwners = roadInputs.ports
        .filter((p) => p.id === a.portId || p.id === b.portId)
        .map((p) => p.ownerId);
      const endpointSolids = solids.filter((o) => endpointOwners.includes(o.owner));
      const clear = (points: PlanPoint[], outline: PlanPoint[]) => {
        if (!land.containsPolygon(outline)) return false;
        const box = bounds(outline, 1e-7);
        return (
          !roadAvoidance.some((r) => r.ring.overlapsPolygon(outline)) &&
          !watersAt(box).some((w) => w.ring.overlapsPolygon(outline)) &&
          !solidsAt(box).some((o) => !endpointOwners.includes(o.owner) && overlap(outline, o.outline)) &&
          points.slice(1, -1).every((p) => !endpointSolids.some((o) => inRing(p, o.outline)))
        );
      };
      // Grid anchors may lie behind a nearby real entrance. Remove only the
      // disposable endpoint cells that a full-width direct splice can safely replace.
      for (const reverse of [false, true]) {
        if (reverse) points.reverse();
        let last = 0;
        for (let i = 1; i < points.length - 1; i++) {
          if (distance(points[0], points[i]) > Math.max(limits.gridStepM * 1.5, settings.widthM * 4)) break;
          const line = [points[0], points[i + 1]];
          if (
            clear(
              line,
              ribbonOutline(
                line,
                line.map(() => settings.widthM),
                undefined,
                true
              )
            )
          )
            last = i;
        }
        if (last) points.splice(1, last);
        if (reverse) points.reverse();
      }
      const entranceWidth = (portId: string) => {
        const paths =
          plan.spatialLayout?.groups.flatMap((g) => g.paths).filter((p) => p.from === portId || p.to === portId) ?? [];
        return paths.length
          ? Math.max(
              ...paths.map((p) => (p.from === portId ? (p.widths?.[0] ?? p.width) : (p.widths?.at(-1) ?? p.width)))
            )
          : undefined;
      };
      const endpointWidths = {
        startWidth: entranceWidth(a.portId),
        endWidth: entranceWidth(b.portId),
        sBend: 0,
        sBendSign: random(plan.parameters.seed, id + ":s-side") < 0.5 ? -1 : 1
      };
      let corridor = points;
      // The world pipeline shapes shared physical edges after topology exists.
      // A full-width validated corridor needs no preliminary per-journey spline.
      const raw = options.deferCurves
        ? publishRoadPath({ id, from: a.portId, to: b.portId, width: settings.widthM, label }, points)
        : undefined;
      let route = retained
        ? structuredClone(oldRoute)
        : raw && clear(raw.points, raw.outline!)
          ? raw
          : compileRoadPath(
              { id, from: a.portId, to: b.portId, width: settings.widthM, label },
              points,
              clear,
              limits.curveSimplifyM,
              limits.curveHandleScale.min + (limits.curveHandleScale.max - limits.curveHandleScale.min) * settings.bend,
              endpointWidths
            );
      if (!route) {
        // A grid-to-port splice may fold back near a building. Search the actual
        // endpoint corridor before abandoning a topologically valid connection.
        let local: PlanPoint[] | undefined;
        for (const scale of [1, 0.75, 0.5, 0.25, 0.125]) {
          local = findLocalPath(
            a.position,
            b.position,
            settings.widthM * scale,
            localObstacles,
            (outline) =>
              land.containsPolygon(outline) &&
              !roadAvoidance.some((r) => r.ring.overlapsPolygon(outline)) &&
              !watersAt(bounds(outline, 1e-7)).some((w) => w.ring.overlapsPolygon(outline)),
            limits.maxAnchorOffsetM
          );
          if (local) break;
        }
        if (local) {
          corridor = local;
          route = compileRoadPath(
            { id, from: a.portId, to: b.portId, width: settings.widthM, label },
            local,
            clear,
            1,
            1,
            endpointWidths
          );
        }
      }
      if (!route || !clear(route.points, route.outline!)) {
        checks.push({
          id: id + "-clearance",
          rule: "network-width",
          owners: [id],
          required: false,
          status: "fail",
          message: `${label}：当前入口的 ${settings.widthM} m 道路未找到可用曲线，继续尝试其他连接`
        });
        continue;
      }
      route.label = label;
      const measuredGrade = routeGrade(route.points);
      if (measuredGrade > limits.maxSlope)
        checks.push({
          id: id + "-grade",
          rule: "network-grade",
          owners: [id],
          required: false,
          status: "unknown",
          message: "道路局部坡度超过寻路偏好，保留连接并记录实际坡度",
          measured: measuredGrade,
          limit: limits.maxSlope
        });
      groups.set(root(a.id), root(b.id));
      routes.push(route);
      snapshot.edges.push({
        routeId: id,
        a: a.id,
        b: b.id,
        gridPath,
        spine: retained ? (oldEdge.spine ?? route.keypoints?.map((k) => k.position) ?? route.points) : corridor,
        curve: retained ? (oldEdge.curve ?? route.points) : route.points,
        widthM: settings.widthM,
        bend: settings.bend,
        sBend: settings.sBend
      });
    }
    const components = new Set(nodes.map((n) => root(n.id))).size;
    const domainEdges = snapshot.edges.filter((e) => nodes.some((n) => n.id === e.a)).length;
    const cycleRank = domainEdges - nodes.length + components;
    snapshot.domains.push({ id: domain.id, nodes: nodes.length, components, cycleRank });
    checks.push({
      id: `network-connectivity-${domain.id}`,
      rule: "network-connectivity",
      owners: nodes.map((n) => n.id),
      required: false,
      status: components === 1 ? "pass" : "fail",
      message: "同一陆域关键点的道路连通诊断",
      measured: components,
      limit: 1
    });
  }
  plan.routes.push(...routes);
  plan.roadNetwork = snapshot;
  if (options.publishMetadata !== false) publishGlobalRoadMetadata(plan, config);
  return checks;
}

/** Restore navigation/profile ownership from the same published curves after local updates or DB reload. */
export function publishGlobalRoadMetadata(plan: IslandPlan, config: RoadNetworkConfig): void {
  const routes = plan.routes.filter((r) => r.id.startsWith("world-route-"));
  const snapshot = plan.roadNetwork;
  if (!snapshot) return;
  // Bank fitting can move a shared access junction along its existing pavement.
  // Navigation must publish the same position as the canonical physical graph.
  const positions = new Map(plan.roadGraph?.nodes.map((node) => [node.id, node.position]));
  plan.roadNetwork = {
    ...snapshot,
    nodes: snapshot.nodes.map((node) => {
      const position = positions.get(node.id);
      return position ? { ...node, position } : node;
    })
  };
  plan.planning!.ports = plan.planning!.ports.map((port) => {
    const position = positions.get(port.id);
    return position ? { ...port, position } : port;
  });
  const ground = createPlanningGroundSampler(plan);
  plan.planning!.profiles = plan.planning!.profiles.filter((p) => !p.ownerId.startsWith("world-route-"));
  plan.planning!.relations = plan.planning!.relations.filter((r) => !r.id.startsWith("world-route-"));
  plan.planning!.modules = plan.planning!.modules.filter((m) => m.id !== "world-routes");
  for (const route of routes) {
    const profilePoints = route.points.slice(1).flatMap((b, j) => {
      const a = route.points[j],
        n = Math.max(1, Math.ceil(distance(a, b) / 2));
      return Array.from({ length: n + (j === 0 ? 1 : 0) }, (_, k) => {
        const t = (k + (j === 0 ? 0 : 1)) / n,
          p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        return { ...p, y: ground(p) };
      });
    });
    plan.planning!.profiles.push({
      id: route.id + "-profile",
      ownerId: route.id,
      kind: "route",
      points: profilePoints,
      width: route.width,
      supportIds: ["ground-final"]
    });
  }
  for (const route of routes)
    plan.planning!.relations.push({
      id: route.id,
      kind: "connects",
      owners: ["world-routes"],
      ports: [route.from, route.to],
      required: false,
      network: "supported"
    });
  plan.planning!.modules.push({
    id: "world-routes",
    kind: "routes",
    outline: plan.land,
    dependencies: snapshot.nodes.map((n) => n.poiId ?? n.portId),
    memberIds: routes.map((r) => r.id),
    requested: { width: config.widthM, bend: config.bend, loopiness: config.loopiness },
    resolved: {
      routes: routes.length,
      nodes: snapshot.nodes.length,
      cycles: snapshot.domains.reduce((n, d) => n + d.cycleRank, 0)
    }
  });
}

/** Evaluate the final published journeys, including any shared-corridor rerouting. */
export function finalRoadGradeChecks(plan: IslandPlan): PlanningCheck[] {
  const checks: PlanningCheck[] = [];
  for (const profile of plan.planning?.profiles ?? []) {
    if (profile.kind !== "route" || !profile.ownerId.startsWith("world-route-")) continue;
    let grade = 0;
    for (let i = 1; i < profile.points.length; i++) {
      const a = profile.points[i - 1],
        b = profile.points[i],
        gap = distance(a, b);
      if (gap > 1e-6) grade = Math.max(grade, Math.abs(b.y - a.y) / gap);
    }
    if (grade > limits.maxSlope)
      checks.push({
        id: profile.ownerId + "-grade",
        rule: "road-grade",
        owners: [profile.ownerId],
        required: false,
        status: "unknown",
        message: "最终道路局部坡度超过寻路偏好，保留连接并记录实际坡度",
        measured: grade,
        limit: limits.maxSlope
      });
  }
  return checks;
}

class Heap {
  private entries: { id: number; cost: number }[] = [];
  get size() {
    return this.entries.length;
  }
  push(id: number, cost: number) {
    const q = this.entries;
    let i = q.length;
    q.push({ id, cost });
    while (i) {
      const p = (i - 1) >> 1;
      if (q[p].cost <= cost) break;
      q[i] = q[p];
      i = p;
    }
    q[i] = { id, cost };
  }
  pop() {
    const q = this.entries,
      first = q[0].id,
      last = q.pop()!;
    if (q.length) {
      let i = 0;
      while (i * 2 + 1 < q.length) {
        let c = i * 2 + 1;
        if (c + 1 < q.length && q[c + 1].cost < q[c].cost) c++;
        if (q[c].cost >= last.cost) break;
        q[i] = q[c];
        i = c;
      }
      q[i] = last;
    }
    return first;
  }
}
