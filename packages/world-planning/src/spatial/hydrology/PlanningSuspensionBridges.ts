import terrainProfile from "../../planning-data/settlement-profile.json";
import {
  suspensionBridgeTowers,
  BRIDGE_TOWER_WIDTH_M,
  compileSuspensionBridge,
  resolveSuspensionBridgeConfig,
  type SuspensionBridgeOverrides,
  type SuspensionBridgeConfig
} from "@galacean/engine-water/bridges/SuspensionBridge";
import type { IslandPlan, PlanBridge, PlanPoint, PlanRoute } from "../../semantic-study/IslandPlanModel";
import type { PlanningCheck } from "../../semantic-study/WorldPlanningContract";
import {
  createPlanningGroundSampler,
  createPlanningRingQuery,
  createPlanningWaterHeightSampler
} from "../../semantic-study/WorldPlanningTerrain";
import { publishRoadPath, type RoadClearance } from "../layout/RoadGeometry";
import { ribbonOutline } from "../../semantic-study/WorldRibbon";
import { WALK_METRICS } from "../../semantic-study/PlanningWalk";
import { bridgeGround } from "./RiverCrossings";
import roadLimits from "../../planning-data/road-network.json";
import { compileBridgeApproach, type BridgeApproachBoundary } from "@galacean/engine-water/bridges/BridgeApproach";
import { boxFootprint, segmentPolygonDistance } from "../../geometry/V2Geometry";
import { riverBankReach } from "../../semantic-study/PlanningRiverBank";
import { omitUnusableRoads } from "../layout/RoadPublication";

const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(b.x - a.x, b.z - a.z);
class ApproachCoordinationError extends Error {
  constructor(
    readonly sectionId: string,
    message: string
  ) {
    super(message);
  }
}
function omitCrossings(plan: IslandPlan, bridges: readonly PlanBridge[]): void {
  const sections = new Set(bridges.flatMap((b) => b.roadSectionIds ?? []));
  const routes = new Set(bridges.flatMap((b) => (b.routeId ? [b.routeId] : [])));
  if (!sections.size)
    for (const section of plan.roadGraph?.sections ?? [])
      if (section.owners.some((id) => routes.has(id))) sections.add(section.id);
  omitUnusableRoads(plan, sections, routes);
}
function approachComponent(plan: IslandPlan, sectionId: string): Set<string> {
  const sections = plan.roadGraph?.sections ?? plan.routes.map((route) => ({ id: route.id, route }));
  const selected = new Set([sectionId]),
    nodes = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const section of sections) {
      if (!selected.has(section.id) && !nodes.has(section.route.from) && !nodes.has(section.route.to)) continue;
      if (!selected.has(section.id)) {
        selected.add(section.id);
        changed = true;
      }
      for (const id of [section.route.from, section.route.to])
        if (!nodes.has(id)) {
          nodes.add(id);
          changed = true;
        }
    }
  }
  return selected;
}
/** Derived baseline is private to the layout cache; never serialized as authoring. */
export interface BridgeRoadBaseline {
  bridges: PlanBridge[];
  approaches: PlanBridge[];
  routes: PlanRoute[];
  graph?: IslandPlan["roadGraph"];
}
export function captureBridgeRoadBaseline(plan: IslandPlan): BridgeRoadBaseline {
  return { bridges: plan.bridges, approaches: plan.roadApproaches ?? [], routes: plan.routes, graph: plan.roadGraph };
}
function routeArcs(route: Pick<PlanRoute, "points">) {
  const arcs = [0];
  for (let i = 1; i < route.points.length; i++) arcs.push(arcs[i - 1] + distance(route.points[i - 1], route.points[i]));
  const nearest = (point: PlanPoint) => {
    let gap = Infinity,
      arc = 0;
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i],
        dx = b.x - a.x,
        dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
      if (d < gap) {
        gap = d;
        arc = arcs[i - 1] + (arcs[i] - arcs[i - 1]) * t;
      }
    }
    return { gap, arc };
  };
  const at = (arc: number) => {
    const i = Math.max(
      1,
      arcs.findIndex((v) => v >= arc)
    );
    const t = Math.max(0, Math.min(1, (arc - arcs[i - 1]) / (arcs[i] - arcs[i - 1] || 1)));
    return {
      x: route.points[i - 1].x + (route.points[i].x - route.points[i - 1].x) * t,
      z: route.points[i - 1].z + (route.points[i].z - route.points[i - 1].z) * t
    };
  };
  return { arcs, nearest, at, length: arcs.at(-1)! };
}

/** Compile only crossing dependencies. Neighbours and authored values remain untouched. */
export function publishPlanningSuspensionBridges(
  plan: IslandPlan,
  baseline: BridgeRoadBaseline,
  defaults: SuspensionBridgeOverrides,
  overrides: Record<string, SuspensionBridgeOverrides>,
  clear: RoadClearance,
  previous?: IslandPlan
): PlanningCheck[] {
  const ground = createPlanningGroundSampler(plan, { natural: true }),
    waters = plan.waters.map((w) => ({
      w,
      ring: createPlanningRingQuery(w.outline),
      surface: createPlanningWaterHeightSampler(plan, w.id)
    }));
  const uncarved = createPlanningGroundSampler({ ...plan, waters: [], roadApproaches: [] }, { natural: true });
  const priorSupport = bridgeGround(
    { ...plan, bridges: baseline.bridges, roadApproaches: baseline.approaches },
    ground
  );
  const checks: PlanningCheck[] = [],
    bridges: PlanBridge[] = [],
    approaches: PlanBridge[] = [];
  const failed: PlanBridge[] = [];
  const routes = new Map(baseline.routes.map((r) => [r.id, r]));
  const physical = new Map(baseline.graph?.sections.map((s) => [s.id, s.route]));
  const sources = [...routes, ...physical].map(([id, route]) => ({ id, route, query: routeArcs(route) }));
  // Reserve the actual post footprint against the same actor corridor used by traversal.
  const segments = (baseline.graph?.sections ?? baseline.routes.map((route) => ({ id: route.id, route }))).flatMap(
    ({ id, route }) => route.points.slice(1).map((b, i) => ({ id, a: route.points[i], b }))
  );
  const postsClear = (a: PlanPoint, b: PlanPoint, config: SuspensionBridgeConfig, side?: number) => {
    const yaw = Math.atan2(b.z - a.z, b.x - a.x),
      margin = WALK_METRICS.radius + 0.05;
    return suspensionBridgeTowers({ a: { ...a, y: 0 }, b: { ...b, y: 0 }, config }).every((post, i) => {
      if (side !== undefined && Math.floor(i / 2) !== side) return true;
      const reach = BRIDGE_TOWER_WIDTH_M / Math.SQRT2 + margin;
      const footprint = boxFootprint({ center: post, sizeX: BRIDGE_TOWER_WIDTH_M, sizeZ: BRIDGE_TOWER_WIDTH_M, yaw });
      return !segments.some(
        ({ a, b }) =>
          Math.min(a.x, b.x) <= post.x + reach &&
          Math.max(a.x, b.x) >= post.x - reach &&
          Math.min(a.z, b.z) <= post.z + reach &&
          Math.max(a.z, b.z) >= post.z - reach &&
          segmentPolygonDistance(a, b, footprint) < margin
      );
    });
  };
  for (const source of baseline.bridges) {
    const priorRoutes = new Map(routes),
      priorPhysical = new Map(physical);
    try {
      const input = { ...defaults, ...overrides[source.id] };
      const originalLength = distance(source.a, source.b);
      resolveSuspensionBridgeConfig(originalLength, source.width, input);
      const { lengthM: requestedLength, ...fittingInput } = input;
      let config = resolveSuspensionBridgeConfig(originalLength, source.width, fittingInput);
      const dx = (source.b.x - source.a.x) / originalLength,
        dz = (source.b.z - source.a.z) / originalLength;
      const center = { x: (source.a.x + source.b.x) / 2, z: (source.a.z + source.b.z) / 2 };
      let a = { x: center.x - (dx * config.lengthM) / 2, z: center.z - (dz * config.lengthM) / 2 },
        b = { x: center.x + (dx * config.lengthM) / 2, z: center.z + (dz * config.lengthM) / 2 };
      // RiverCrossings may join several physical sections at a junction in the river.
      // Fit one continuous span, but keep each section and its logical owners in the road graph.
      const ids = new Set(source.roadSectionIds ?? (source.routeId ? [source.routeId] : []));
      const spine: PlanPoint[] = [],
        junctions: PlanPoint[] = [];
      for (const id of ids) {
        const route = physical.get(id) ?? routes.get(id);
        if (!route) throw new Error("吊桥所属道路已丢失");
        const points = route.points.slice(),
          query = routeArcs(route);
        if (query.nearest(source.a).arc > query.nearest(source.b).arc) points.reverse();
        if (spine.length && distance(spine.at(-1)!, points[0]) > 0.02) throw new Error("吊桥道路分段未连接");
        if (spine.length) junctions.push(points[0]);
        spine.push(...(spine.length ? points.slice(1) : points));
      }
      const spanQuery = spine.length ? routeArcs({ points: spine }) : undefined;
      if (!spanQuery || spanQuery.nearest(source.a).gap > 0.2 || spanQuery.nearest(source.b).gap > 0.2)
        throw new Error("吊桥缺少完整的岸上道路连接");
      for (const section of baseline.graph?.sections ?? [])
        if (ids.has(section.id)) for (const owner of section.owners) ids.add(owner);
      const carrier = sources.filter(
        ({ id, query }) => ids.has(id) || (query.nearest(source.a).gap < 0.2 && query.nearest(source.b).gap < 0.2)
      );
      const structureClear = (a: PlanPoint, b: PlanPoint, config: SuspensionBridgeConfig, side?: number) => {
        if (!postsClear(a, b, config, side)) return false;
        const length = distance(a, b),
          ux = (b.x - a.x) / length,
          uz = (b.z - a.z) / length;
        const margin = WALK_METRICS.radius + 0.05;
        const sectionIds = source.roadSectionIds ?? [source.routeId];
        for (const sign of [-1, 1]) {
          const lateral = sign * (config.widthM / 2 + 0.12);
          const at = (t: number) => ({
            x: a.x + ux * length * t - uz * lateral,
            z: a.z + uz * length * t + ux * lateral
          });
          const p = at(side === 1 ? 0.5 : 0),
            q = at(side === 0 ? 0.5 : 1);
          const footprint = boxFootprint({
            center: { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 },
            sizeX: distance(p, q),
            sizeZ: 0.044,
            yaw: Math.atan2(uz, ux)
          });
          const rail = createPlanningRingQuery(footprint);
          if (segments.some(({ id, a, b }) => !sectionIds.includes(id) && rail.touchesSegment(a, b, margin)))
            return false;
        }
        return true;
      };
      const terrainCellM =
        (Math.hypot(plan.parameters.width, plan.parameters.depth) / (terrainProfile.world.heightmapResolution - 1)) *
        1.5;
      const dryBanks = (a: PlanPoint, b: PlanPoint, config: SuspensionBridgeConfig, side?: number) => {
        const length = distance(a, b),
          dx = (b.x - a.x) / length,
          dz = (b.z - a.z) / length;
        return [a, b].every((point, i) => {
          if (side !== undefined && side !== i) return true;
          const footprint = ribbonOutline(
            [
              { x: point.x - dx * terrainCellM, z: point.z - dz * terrainCellM },
              { x: point.x + dx * terrainCellM, z: point.z + dz * terrainCellM }
            ],
            [config.widthM + 2 * terrainCellM],
            { start: "butt", end: "butt" },
            true
          );
          return !waters.some(({ ring }) => ring.overlapsPolygon(footprint)) && clear([point], footprint);
        });
      };
      // Reserve the whole bridge mouth and the junction turning corridor,
      // using the nearest feasible landing on the same road.
      for (const side of [0, 1]) {
        const startsDry = dryBanks(a, b, config, side);
        if (startsDry && structureClear(a, b, config, side)) continue;
        const from = spanQuery.nearest(side ? b : a).arc,
          to = spanQuery.nearest(side ? a : b).arc;
        let placed = false;
        const directions = startsDry ? [Math.sign(to - from), -Math.sign(to - from)] : [-Math.sign(to - from)];
        for (let step = 0.25; directions.length && !placed; step += 0.25) {
          for (let i = directions.length - 1; i >= 0; i--) {
            const arc = from + directions[i] * step;
            if (arc < 0 || arc > spanQuery.length) {
              directions.splice(i, 1);
              continue;
            }
            const point = spanQuery.at(arc),
              ca = side ? a : point,
              cb = side ? point : b;
            const candidate = resolveSuspensionBridgeConfig(distance(ca, cb), source.width, fittingInput);
            if (!dryBanks(ca, cb, candidate, side)) {
              if (startsDry) directions.splice(i, 1);
              continue;
            }
            if (!structureClear(ca, cb, candidate, side)) continue;
            a = ca;
            b = cb;
            config = candidate;
            placed = true;
            break;
          }
        }
        if (!placed) throw new Error(`吊桥桥头无法避让道路通行走廊 (${source.id}, side ${side})`);
      }
      const compileAt = (a: PlanPoint, b: PlanPoint, config: SuspensionBridgeConfig) => {
        if (!dryBanks(a, b, config)) throw new Error(`吊桥桥头必须落在无障碍的干岸 (${source.id})`);
        if (!structureClear(a, b, config)) throw new Error("吊桥立柱或护绳占用道路通行走廊");
        // The former straight crossing's grade envelope is not a terrain datum. Inheriting it
        // raises an otherwise feasible bank by metres and requires a retaining cliff at the shore.
        let ay = ground(a) + 0.05,
          by = ground(b) + 0.05;
        const allowedRise = config.lengthM * roadLimits.maxSlope - 4 * config.sagM;
        if (allowedRise < -1e-6) throw new Error("吊桥下垂超过现有道路通行坡度");
        if (ay > by + allowedRise) by = ay - allowedRise;
        if (by > ay + allowedRise) ay = by - allowedRise;
        const compile = (ay: number, by: number) =>
          compileSuspensionBridge(
            { ...a, y: ay },
            { ...b, y: by },
            config,
            (p) => {
              const values = waters
                .filter(({ ring }) => ring.inside(p))
                .map(({ surface }) => surface(p))
                .filter((v): v is number => v !== undefined);
              return values.length ? Math.max(...values) : undefined;
            },
            ground
          );
        let fitted = compile(ay, by);
        const limits = [a, b].map((point, side) => {
          const end = side ? spine.at(-1)! : spine[0];
          if (!baseline.graph?.nodes.some((n) => n.degree === 1 && distance(n.position, end) < 1e-5)) return Infinity;
          const arc = spanQuery.nearest(point).arc;
          return priorSupport(end) + WALK_METRICS.step + (side ? spanQuery.length - arc : arc) * roadLimits.maxSlope;
        });
        // A short terminal approach constrains only its own bank. Instead of lifting both
        // ends equally, find the least rise at the other bank that still clears the water.
        // Every trial uses the same deck compiler and the same maximum walking grade.
        for (const side of [0, 1]) {
          const limit = limits[side],
            endpoint = side ? fitted.b : fitted.a;
          if (endpoint.y <= limit) continue;
          const other = side ? a : b;
          let lo = Math.max(ground(other) + 0.05, limit - allowedRise),
            hi = Math.min(limits[1 - side], limit + allowedRise);
          if (hi < lo) continue;
          const trial = (height: number) => (side ? compile(height, limit) : compile(limit, height));
          let candidate = trial(hi);
          const clears = (bridge: typeof candidate) => (side ? bridge.b : bridge.a).y <= limit + 1e-6;
          if (!clears(candidate)) continue;
          for (let i = 0; i < 16; i++) {
            const mid = (lo + hi) / 2,
              next = trial(mid);
            if (clears(next)) {
              hi = mid;
              candidate = next;
            } else lo = mid;
          }
          fitted = candidate;
        }
        return fitted;
      };
      let compiled = compileAt(a, b, config);
      {
        // Automatic spans may land farther up the existing dry road. Prefer natural
        // bank support over a high earthwork abutment immediately beside the water.
        // This implicit reference is deterministic even when a length is authored;
        // manual edits use its centre/axis, so replay never depends on a prior scene.
        const query = spanQuery;
        const aa = query.nearest(source.a).arc,
          bb = query.nearest(source.b).arc,
          forward = aa < bb;
        const fill = (c: typeof compiled) => Math.max(c.a.y - ground(c.a) - 0.05, c.b.y - ground(c.b) - 0.05);
        const bankWidth = waters.find((w) => w.w.id === source.riverId)?.w.bankWidthM ?? 12;
        const surface = waters.find((w) => w.w.id === source.riverId)!.surface;
        const rise = Math.max(...[source.a, source.b].map((p) => uncarved(p) - (surface(p) ?? ground(p))));
        // Search the affected bank envelope, not the entire route when a requested
        // clearance is enormous. This is a terrain-derived locality, not a size cap.
        const reach = Math.max(config.widthM * 2, riverBankReach(bankWidth, rise));
        let extA = 0,
          extB = 0;
        for (let pass = 0; pass < 2; pass++)
          for (const side of [0, 1]) {
            let best = fill(compiled) + 0.02 * (extA + extB),
              choice: typeof compiled | undefined,
              extension = side ? extB : extA;
            for (let step = extension + 1; step <= reach; step++) {
              const arc = (side ? bb : aa) + (side ? (forward ? 1 : -1) : forward ? -1 : 1) * step;
              if (arc < 0 || arc > query.length) break;
              const ca = side ? a : query.at(arc),
                cb = side ? query.at(arc) : b;
              // Bank support may extend the straight crossing, never rotate it into
              // an adjacent road or splice a curved approach into a diagonal deck.
              if ([ca, cb].some((p) => Math.abs((p.x - source.a.x) * dz - (p.z - source.a.z) * dx) > 0.02)) continue;
              const candidateConfig = resolveSuspensionBridgeConfig(distance(ca, cb), source.width, fittingInput);
              try {
                // Keep a dry tail beyond each landing on the connected road spine.
                const x = query.nearest(ca),
                  y = query.nearest(cb);
                if (
                  x.gap > 0.2 ||
                  y.gap > 0.2 ||
                  Math.min(x.arc, y.arc) < 0.25 ||
                  query.length - Math.max(x.arc, y.arc) < 0.25
                )
                  continue;
                // Shared graph junctions must stay on the fitted deck.
                if (
                  junctions.some((p) => {
                    const t =
                      ((p.x - ca.x) * (cb.x - ca.x) + (p.z - ca.z) * (cb.z - ca.z)) / candidateConfig.lengthM ** 2;
                    return (
                      t > 0 &&
                      t < 1 &&
                      Math.abs((p.x - ca.x) * (cb.z - ca.z) - (p.z - ca.z) * (cb.x - ca.x)) / candidateConfig.lengthM >
                        0.02
                    );
                  })
                )
                  continue;
                const outline = ribbonOutline([ca, cb], [candidateConfig.widthM], { start: "butt", end: "butt" }, true);
                if (!clear([ca, cb], outline)) continue;
                const candidate = compileAt(ca, cb, candidateConfig),
                  cost = fill(candidate) + 0.02 * (step + (side ? extA : extB));
                if (cost < best - 1e-6) {
                  best = cost;
                  choice = candidate;
                  extension = step;
                }
              } catch {
                /* Keep the currently feasible span when an optional bank candidate is obstructed. */
              }
            }
            if (choice) {
              compiled = choice;
              a = { x: choice.a.x, z: choice.a.z };
              b = { x: choice.b.x, z: choice.b.z };
              config = choice.config;
              if (side) extB = extension;
              else extA = extension;
            }
          }
      }
      if (requestedLength !== undefined) {
        const cx = (a.x + b.x) / 2,
          cz = (a.z + b.z) / 2,
          length = distance(a, b),
          ux = (b.x - a.x) / length,
          uz = (b.z - a.z) / length;
        config = resolveSuspensionBridgeConfig(requestedLength, source.width, input);
        a = { x: cx - (ux * requestedLength) / 2, z: cz - (uz * requestedLength) / 2 };
        b = { x: cx + (ux * requestedLength) / 2, z: cz + (uz * requestedLength) / 2 };
        compiled = compileAt(a, b, config);
      }
      const bridge: PlanBridge = {
        ...source,
        a,
        b,
        width: config.widthM,
        deckPath: compiled.deckPath,
        deckY: Math.max(compiled.a.y, compiled.b.y),
        suspension: compiled
      };
      const madeApproaches: PlanBridge[] = [];
      for (const candidate of carrier) {
        const route = routes.get(candidate.id) ?? physical.get(candidate.id) ?? candidate.route,
          query = routeArcs(route);
        const forward = query.nearest(source.a).arc < query.nearest(source.b).arc;
        const landing = (endpoint: typeof compiled.a) => {
          const nearest = query.nearest(endpoint);
          if (nearest.gap < 0.2) return { point: endpoint, arc: nearest.arc, bank: true };
          const point = query.at(nearest.arc),
            length = distance(compiled.a, compiled.b);
          const t =
            ((point.x - compiled.a.x) * (compiled.b.x - compiled.a.x) +
              (point.z - compiled.a.z) * (compiled.b.z - compiled.a.z)) /
            length ** 2;
          const gap =
            Math.abs(
              (point.x - compiled.a.x) * (compiled.b.z - compiled.a.z) -
                (point.z - compiled.a.z) * (compiled.b.x - compiled.a.x)
            ) / length;
          if (t <= 0 || t >= 1 || gap > 0.02) throw new Error("吊桥道路分段未连接到桥面");
          // Only XZ is published to roads. Height remains owned by the single compiled deck.
          return {
            point: { ...point, y: bridgeGround({ ...plan, bridges: [bridge], roadApproaches: [] }, ground)(point) },
            arc: nearest.arc,
            bank: false
          };
        };
        const start = landing(forward ? compiled.a : compiled.b),
          end = landing(forward ? compiled.b : compiled.a);
        const first = start.point,
          last = end.point,
          firstArc = start.arc,
          lastArc = end.arc;
        if (lastArc <= firstArc + 0.01) throw new Error("吊桥长度超出所属道路的可衔接范围");
        const makeApproach = (endpoint: typeof first, at: number, direction: -1 | 1, suffix: string) => {
          let joinArc = at,
            join = { x: endpoint.x, z: endpoint.z };
          // A centreline height match alone can end the approach after one metre, leaving
          // the whole bank crossfall to snap into a wide, level bridge mouth. Reserve a
          // width-scaled transition corridor before returning to the natural road surface.
          const transitionLength = Math.max(2, config.widthM * 1.5);
          for (let step = 1; step <= Math.ceil(query.length); step++) {
            joinArc = Math.max(0, Math.min(query.length, at + direction * step));
            join = query.at(joinArc);
            if (
              Math.abs(joinArc - at) >= transitionLength &&
              Math.abs(endpoint.y - ground(join)) <= distance(endpoint, join) * roadLimits.maxSlope + 0.001
            )
              break;
            if (joinArc === 0 || joinArc === query.length) break; // Continue the height envelope across shared road nodes below.
          }
          const lo = Math.min(at, joinArc),
            hi = Math.max(at, joinArc);
          const between = route.points.filter((_, i) => query.arcs[i] > lo && query.arcs[i] < hi);
          const path = (direction < 0 ? [join, ...between, endpoint] : [endpoint, ...between, join]).filter(
            (p, i, points) => !i || distance(p, points[i - 1]) > 1e-6
          );
          const outline = ribbonOutline(
            path,
            path.map(() => config.widthM),
            { start: "butt", end: "butt" },
            true
          );
          if (waters.some(({ ring }) => ring.overlapsPolygon(outline)) || !clear(path, outline))
            throw new Error("吊桥引道穿过水域或障碍");
          const arc = [0];
          for (let i = 1; i < path.length; i++) arc.push(arc[i - 1] + distance(path[i - 1], path[i]));
          const total = arc.at(-1)!;
          // A rising bank needs a cut as well as fill; ignoring its sign would select a one-metre
          // join and leave an unwalkable uphill step after fitting the bridge to local ground.
          const joinHeight = ground(join);
          const deckPath = path.map((p, i) => ({
            ...p,
            y:
              endpoint.y +
              ((joinHeight - endpoint.y) * (direction < 0 ? total - arc[i] : arc[i])) / Math.max(total, 1e-6)
          }));
          return {
            arc: joinArc,
            path,
            support: {
              id: `approach:${source.id}:${suffix}`,
              label: "吊桥岸上引道",
              routeId: route.id,
              riverId: source.riverId,
              a: path[0],
              b: path.at(-1)!,
              width: config.widthM,
              deckPath,
              deckY: Math.max(...deckPath.map((p) => p.y))
            } as PlanBridge
          };
        };
        const before = start.bank
          ? makeApproach(first, firstArc, -1, forward ? "a" : "b")
          : { arc: firstArc, path: [first], support: undefined };
        const after = end.bank
          ? makeApproach(last, lastArc, 1, forward ? "b" : "a")
          : { arc: lastArc, path: [last], support: undefined };
        const deck = (forward ? compiled.deckPath : compiled.deckPath.slice().reverse()).filter((p) => {
          const arc = query.nearest(p).arc;
          return arc > firstArc + 1e-6 && arc < lastArc - 1e-6;
        });
        const points = [
          ...route.points.filter((_, i) => query.arcs[i] < before.arc),
          ...before.path,
          ...deck,
          ...after.path,
          ...route.points.filter((_, i) => query.arcs[i] > after.arc)
        ];
        const roadWidth = (arc: number) => {
          const i = Math.max(
            1,
            query.arcs.findIndex((v) => v >= arc)
          );
          const t = Math.max(0, Math.min(1, (arc - query.arcs[i - 1]) / (query.arcs[i] - query.arcs[i - 1] || 1)));
          const a = route.widths?.[i - 1] ?? route.width,
            b = route.widths?.[i] ?? route.width;
          return a + (b - a) * t;
        };
        const widths = points.map((p) => {
          const arc = query.nearest(p).arc;
          if (arc < before.arc || arc > after.arc) return roadWidth(arc);
          const width = roadWidth(arc < firstArc ? before.arc : after.arc);
          const t =
            arc < firstArc
              ? (arc - before.arc) / (firstArc - before.arc || 1)
              : arc > lastArc
                ? (after.arc - arc) / (after.arc - lastArc || 1)
                : 1;
          return width + (config.widthM - width) * Math.max(0, Math.min(1, t));
        });
        const output = publishRoadPath({ ...route, widths }, points, route);
        if (routes.has(candidate.id)) routes.set(candidate.id, output);
        if (physical.has(candidate.id)) physical.set(candidate.id, output);
        for (const support of [before.support, after.support])
          if (support && !madeApproaches.some((p) => p.id === support.id)) madeApproaches.push(support);
      }
      bridges.push(bridge);
      approaches.push(...madeApproaches);
      checks.push({
        id: `suspension:${bridge.id}`,
        rule: "suspension-bridge",
        owners: [bridge.id],
        required: true,
        status: "pass",
        message: "木吊桥、净空和两岸引道共同发布"
      });
    } catch (error) {
      // A later carrier can fail after earlier carriers were fitted. Publish no
      // part of that bridge transaction, including its temporary road deformation.
      routes.clear();
      for (const [id, route] of priorRoutes) routes.set(id, route);
      physical.clear();
      for (const [id, route] of priorPhysical) physical.set(id, route);
      failed.push(source);
      checks.push({
        id: `suspension:${source.id}`,
        rule: "suspension-bridge",
        owners: [source.id],
        required: false,
        status: "fail",
        message: String(error)
      });
    }
  }
  const retain = <T extends { id: string }>(items: T[], prior: readonly T[] | undefined) =>
    items.map((item) => {
      const old = prior?.find((p) => p.id === item.id);
      return old && JSON.stringify(old) === JSON.stringify(item) ? old : item;
    });
  plan.bridges = retain(bridges, previous?.bridges);
  plan.roadApproaches = approaches;
  plan.routes = retain([...routes.values()], previous?.routes);
  if (baseline.graph)
    plan.roadGraph = {
      ...baseline.graph,
      sections: baseline.graph.sections.map((s) => ({ ...s, route: physical.get(s.id)! }))
    };
  omitCrossings(plan, failed);
  while (plan.bridges.length) {
    try {
      plan.roadApproaches = retain(coordinateApproachHeights(plan, baseline, clear), previous?.roadApproaches);
      break;
    } catch (error) {
      const component =
        error instanceof ApproachCoordinationError ? approachComponent(plan, error.sectionId) : undefined;
      let rejected = plan.bridges.filter(
        (b) => !component || (b.roadSectionIds ?? [b.routeId!]).some((id) => component.has(id))
      );
      if (!rejected.length) rejected = plan.bridges;
      const rejectedIds = new Set(rejected.map((b) => b.id));
      plan.bridges = plan.bridges.filter((b) => !rejectedIds.has(b.id));
      plan.roadApproaches = (plan.roadApproaches ?? []).filter(
        (a) => !rejected.some((b) => a.id.startsWith(`approach:${b.id}:`))
      );
      omitCrossings(plan, rejected);
      for (const check of checks)
        if (check.status === "pass" && check.owners.some((id) => rejectedIds.has(id))) {
          check.status = "unknown";
          check.message = "桥体已拟合，但共享引道未通过；本次不发布桥体";
        }
      checks.push({
        id: "suspension:approaches",
        rule: "suspension-bridge",
        owners: rejected.map((b) => b.id),
        required: false,
        status: "fail",
        message: String(error)
      });
    }
  }
  return checks;
}

/** A road junction has one support height, even when the selected bridge's physical section is short. */
function coordinateApproachHeights(plan: IslandPlan, baseline: BridgeRoadBaseline, clear: RoadClearance): PlanBridge[] {
  const compileApproach = (sectionId: string, ...args: Parameters<typeof compileBridgeApproach>) => {
    try {
      return compileBridgeApproach(...args);
    } catch (error) {
      throw new ApproachCoordinationError(sectionId, String(error));
    }
  };
  const ground = createPlanningGroundSampler(plan, { natural: true });
  const waters = plan.waters.map((w) => createPlanningRingQuery(w.outline));
  const acceptsGrading = (polygon: readonly PlanPoint[]) =>
    !waters.some((w) => w.overlapsPolygon([...polygon])) && clear([], [...polygon]);
  const priorSupport = bridgeGround(
    { ...plan, bridges: baseline.bridges, roadApproaches: baseline.approaches },
    ground
  );
  type Node = {
    p: PlanPoint;
    floor: number;
    y: number;
    width: number;
    owners: Set<string>;
    edges: Map<number, number>;
  };
  const nodes: Node[] = [],
    ids = new Map<string, number>();
  const add = (p: PlanPoint) => {
    const key = `${p.x.toFixed(5)}:${p.z.toFixed(5)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = nodes.length;
      const floor = ground(p);
      nodes.push({ p, floor, y: floor, width: 0, owners: new Set(), edges: new Map() });
      ids.set(key, id);
    }
    return id;
  };
  const routes = plan.roadGraph?.sections ?? plan.routes.map((route) => ({ id: route.id, route }));
  const sections = routes.map(({ id: sectionId, route }) => {
    const path: number[] = [],
      widths: number[] = [];
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i],
        steps = Math.max(1, Math.ceil(distance(a, b) / 0.5));
      for (let j = 0; j < steps; j++) {
        path.push(add({ x: a.x + ((b.x - a.x) * j) / steps, z: a.z + ((b.z - a.z) * j) / steps }));
        const aw = route.widths?.[i - 1] ?? route.width,
          bw = route.widths?.[i] ?? route.width;
        widths.push(aw + ((bw - aw) * j) / steps);
      }
    }
    path.push(add(route.points.at(-1)!));
    widths.push(route.widths?.at(-1) ?? route.width);
    for (let i = 0; i < path.length; i++) {
      nodes[path[i]].width = Math.max(nodes[path[i]].width, widths[i]);
      nodes[path[i]].owners.add(sectionId);
    }
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        length = distance(nodes[a].p, nodes[b].p);
      nodes[a].edges.set(b, length);
      nodes[b].edges.set(a, length);
    }
    return { id: sectionId, route, path, widths };
  });
  // Road ribbons can form a junction before their sampled centre lines coincide. Coordinate that same
  // physical overlap used by the natural crossing publisher, rather than treating it as a dead end.
  const bins = new Map<string, number[]>(),
    maxWidth = Math.max(0, ...nodes.map((n) => n.width));
  for (let id = 0; id < nodes.length; id++) {
    const p = nodes[id].p,
      key = `${Math.floor(p.x / 8)}:${Math.floor(p.z / 8)}`;
    bins.set(key, [...(bins.get(key) ?? []), id]);
  }
  for (let id = 0; id < nodes.length; id++) {
    const node = nodes[id],
      radius = (node.width + maxWidth) / 2;
    for (let z = Math.floor((node.p.z - radius) / 8); z <= Math.floor((node.p.z + radius) / 8); z++)
      for (let x = Math.floor((node.p.x - radius) / 8); x <= Math.floor((node.p.x + radius) / 8); x++)
        for (const other of bins.get(`${x}:${z}`) ?? []) {
          if (other <= id || [...node.owners].some((owner) => nodes[other].owners.has(owner))) continue;
          const length = distance(node.p, nodes[other].p);
          if (length <= (node.width + nodes[other].width) / 2) {
            // A centre line inside the other lane shares that lane's support datum.
            // Outer shoulder overlap still retains its longitudinal grade distance.
            const run = length <= Math.min(node.width, nodes[other].width) / 2 ? 0 : length;
            node.edges.set(other, run);
            nodes[other].edges.set(id, run);
          }
        }
  }
  const supports = plan.roadApproaches ?? [];
  const supportHeights = new Map<Node, number>();
  for (const node of nodes)
    for (const support of supports) {
      const points = support.deckPath ?? [];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          dx = b.x - a.x,
          dz = b.z - a.z;
        const t = ((node.p.x - a.x) * dx + (node.p.z - a.z) * dz) / (dx * dx + dz * dz || 1);
        if (t < -1e-6 || t > 1 + 1e-6) continue;
        if (Math.hypot(node.p.x - a.x - t * dx, node.p.z - a.z - t * dz) <= support.width / 2 + 0.001)
          supportHeights.set(node, Math.max(supportHeights.get(node) ?? -Infinity, a.y + (b.y - a.y) * t));
      }
    }
  for (const [node, height] of supportHeights) node.y = height;
  const onDeck = (p: PlanPoint) =>
    plan.bridges.find((bridge) => {
      const dx = bridge.b.x - bridge.a.x,
        dz = bridge.b.z - bridge.a.z;
      const t = ((p.x - bridge.a.x) * dx + (p.z - bridge.a.z) * dz) / (dx * dx + dz * dz);
      return (
        t >= -1e-5 &&
        t <= 1 + 1e-5 &&
        Math.hypot(p.x - bridge.a.x - t * dx, p.z - bridge.a.z - t * dz) <= bridge.width / 2 + 0.001
      );
    });
  const queue: { id: number; y: number }[] = [];
  const push = (id: number) => {
    const item = { id, y: nodes[id].y };
    let i = queue.length;
    queue.push(item);
    while (i) {
      const parent = (i - 1) >> 1;
      if (queue[parent].y >= item.y) break;
      queue[i] = queue[parent];
      i = parent;
    }
    queue[i] = item;
  };
  const pop = () => {
    const first = queue[0],
      last = queue.pop()!;
    if (queue.length) {
      let i = 0;
      while (i * 2 + 1 < queue.length) {
        let child = i * 2 + 1;
        if (child + 1 < queue.length && queue[child + 1].y > queue[child].y) child++;
        if (queue[child].y <= last.y) break;
        queue[i] = queue[child];
        i = child;
      }
      queue[i] = last;
    }
    return first;
  };
  for (let id = 0; id < nodes.length; id++) {
    const bridge = onDeck(nodes[id].p);
    if (bridge?.suspension) {
      const { a, b, config } = bridge.suspension,
        t = ((nodes[id].p.x - a.x) * (b.x - a.x) + (nodes[id].p.z - a.z) * (b.z - a.z)) / config.lengthM ** 2;
      nodes[id].y = a.y + (b.y - a.y) * t - 4 * config.sagM * t * (1 - t);
    }
    if (nodes[id].y > nodes[id].floor + 1e-6) push(id);
  }
  while (queue.length) {
    const { id, y } = pop();
    if (y < nodes[id].y - 1e-6) continue;
    for (const [next, length] of nodes[id].edges) {
      if (onDeck(nodes[next].p)) continue;
      const height = y - length * roadLimits.maxSlope;
      if (height > nodes[next].y + 1e-6) {
        nodes[next].y = height;
        push(next);
      }
    }
  }
  for (const { path, route } of sections)
    for (const id of [path[0], path.at(-1)!])
      if (nodes[id].edges.size <= 1 && nodes[id].y - priorSupport(nodes[id].p) > WALK_METRICS.step + 0.001)
        throw new ApproachCoordinationError(
          route.id,
          `吊桥抬高后无法在现有路网末端衔接地面 (${route.id}, 桥面 ${nodes[id].y.toFixed(3)}m, 原支撑 ${priorSupport(nodes[id].p).toFixed(3)}m, 地面 ${nodes[id].floor.toFixed(3)}m)`
        );
  const result: PlanBridge[] = [];
  for (const { id: sectionId, route, path, widths } of sections)
    for (let i = 0; i < path.length; i++) {
      if (Math.abs(nodes[path[i]].y - nodes[path[i]].floor) <= 1e-6 || onDeck(nodes[path[i]].p)) continue;
      const first = i;
      while (
        i + 1 < path.length &&
        Math.abs(nodes[path[i + 1]].y - nodes[path[i + 1]].floor) > 1e-6 &&
        !onDeck(nodes[path[i + 1]].p)
      )
        i++;
      const start = Math.max(0, first - 1),
        end = Math.min(path.length, i + 2);
      const points = path.slice(start, end).map((id) => ({ ...nodes[id].p, y: nodes[id].y }));
      if (points.length < 2) continue;
      const width = route.maxWidth ?? route.width;
      const atBridge = (p: (typeof points)[number]): BridgeApproachBoundary | undefined => {
        const bridge = plan.bridges.find((b) => distance(p, b.a) < 1e-5 || distance(p, b.b) < 1e-5);
        if (!bridge) return undefined;
        const length = distance(bridge.a, bridge.b),
          half = bridge.width / 2;
        const nx = -(bridge.b.z - bridge.a.z) / length,
          nz = (bridge.b.x - bridge.a.x) / length;
        return {
          edge: [
            { x: p.x - nx * half, y: p.y, z: p.z - nz * half },
            { x: p.x + nx * half, y: p.y, z: p.z + nz * half }
          ],
          deckSlope:
            ((distance(p, bridge.a) < 1e-5 ? bridge.suspension!.b.y - p.y : bridge.suspension!.a.y - p.y) -
              4 * bridge.suspension!.config.sagM) /
            length,
          deckCurvature: (4 * bridge.suspension!.config.sagM) / (length * length),
          terrainCellM:
            Math.hypot(plan.parameters.width, plan.parameters.depth) / (terrainProfile.world.heightmapResolution - 1)
        };
      };
      result.push({
        id: `support:${sectionId}:${first}`,
        label: "吊桥岸上引道",
        routeId: route.id,
        riverId: "",
        a: points[0],
        b: points.at(-1)!,
        width,
        deckPath: points,
        deckY: Math.max(...points.map((p) => p.y)),
        approach: compileApproach(
          sectionId,
          points,
          widths.slice(start, end),
          ground,
          { start: atBridge(points[0]), end: atBridge(points.at(-1)!) },
          acceptsGrading
        )
      });
    }
  return result;
}
