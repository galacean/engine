import { ribbonOutline } from "../../semantic-study/WorldRibbon";
import { compileRoadGraphSplines } from "./RoadGraphSplines";
import { reduceRoadNetwork } from "./RoadNetworkReduction";
import type { IslandPlan, PlanPoint, PlanRoute } from "../../semantic-study/IslandPlanModel";
import { publishRoadPath, taperRoadJoins, type RoadClearance } from "./RoadGeometry";

/** Unique physical sections retain all logical connection owners for parameter selection and navigation. */
export interface RoadGraph {
  /** Connectivity is decided on corridor keys, before any spline samples exist. */
  construction?: "keypoints";
  nodes: { id: string; position: PlanPoint; degree: number }[];
  sections: { id: string; owners: string[]; route: PlanRoute }[];
}
const key = (p: PlanPoint) => `${p.x.toFixed(4)},${p.z.toFixed(4)}`;
const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const cross = (a: PlanPoint, b: PlanPoint) => a.x * b.z - a.z * b.x;
const sub = (a: PlanPoint, b: PlanPoint) => ({ x: a.x - b.x, z: a.z - b.z });
const at = (a: PlanPoint, b: PlanPoint, t: number) =>
  t === 0 ? { ...a } : t === 1 ? { ...b } : { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
interface Segment {
  a: PlanPoint;
  b: PlanPoint;
  route: PlanRoute;
  cuts: number[];
  reversedCuts?: boolean;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  tolerance: number;
  owners: Set<string>;
  wa: number;
  wb: number;
}
interface Edge {
  id: string;
  a: string;
  b: string;
  width: number;
  wa: number;
  wb: number;
  owners: Set<string>;
}

/** Remove optional access and layout-guide stubs with no content or published global destination.
 * Candidate group paths stay cached for later re-routing; only resolved roads enter the published plan.
 */
export function pruneUnusedAccessPaths(plan: IslandPlan): void {
  const linked = new Set(
    plan.roadNetwork?.nodes
      .filter((n) => plan.roadNetwork!.edges.some((e) => e.a === n.id || e.b === n.id))
      .map((n) => n.portId)
  );
  const discard = new Set<string>();
  for (const group of plan.spatialLayout?.groups ?? []) {
    // An empty, unconnected island organization has neither content nor a world
    // journey to serve. Keep its candidate spine cached, but publish no isolated road.
    if (!group.volumes.length && !group.ports.some((port) => linked.has(port.id))) {
      for (const path of group.paths) discard.add(path.id);
      continue;
    }
    const optional = new Set(
      group.ports
        .filter(
          (p) =>
            (p.access || p.id.startsWith(group.id + ":guide:") || p.id.startsWith(group.id + ":junction:")) &&
            !linked.has(p.id) &&
            !group.volumes.some((v) => p.id === v.id + ":port" || p.servesVolumeId === v.id)
        )
        .map((p) => p.id)
    );
    const remaining = group.paths.filter((p) => plan.routes.some((r) => r.id === p.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const port of optional) {
        const edges = remaining.filter((p) => !discard.has(p.id) && (p.from === port || p.to === port));
        // Layout guides choose free-space branch positions, not destinations. Prune
        // their unused tails before terminal attachment can draw a return loop.
        // A rule-authored backbone remains a through-road when member spurs are disabled.
        // Its free end is joined by the final network attachment pass, not deleted here.
        if (edges.length === 1 && !edges[0].backbone) {
          discard.add(edges[0].id);
          const next = edges[0].from === port ? edges[0].to : edges[0].from;
          if (next.includes(":junction:") && !linked.has(next)) optional.add(next);
          changed = true;
        }
      }
    }
  }
  plan.routes = plan.routes.filter((r) => !discard.has(r.id));
  if (plan.planning)
    plan.planning.modules = plan.planning.modules.map((module) => ({
      ...module,
      memberIds: module.memberIds?.filter((id) => !discard.has(id))
    }));
}

/** Nearly parallel arrivals use one entrance stem before branching, instead of
 * bending independently into a narrow lens. Positions are private drafts; content
 * entrances stay exact and the proposed full-width corridor must remain clear. */
function sharedEntranceSpines(
  source: PlanRoute[],
  network: Map<string, { spine?: PlanPoint[] }>,
  clear: RoadClearance
) {
  const result = new Map(source.map((route) => [route.id, (network.get(route.id)?.spine ?? route.points).slice()]));
  const entrances = new Map<string, { route: PlanRoute; start: boolean }[]>();
  for (const route of source)
    for (const start of [true, false]) {
      const point = route.points[start ? 0 : route.points.length - 1];
      if (!point) continue;
      const id = key(point);
      entrances.set(id, [...(entrances.get(id) ?? []), { route, start }]);
    }
  const prefix = (points: PlanPoint[], length: number) => {
    const selected = [points[0]];
    let along = 0;
    for (let i = 1; i < points.length; i++) {
      const step = distance(points[i - 1], points[i]);
      if (along + step >= length) {
        selected.push(at(points[i - 1], points[i], (length - along) / step));
        return selected;
      }
      selected.push(points[i]);
      along += step;
    }
  };
  for (const arms of entrances.values()) {
    if (arms.length < 2) continue;
    // Internal paths are the accepted entrance approach. Global journeys share
    // it rather than moving the POI or adding an artificial return circuit.
    arms.sort(
      (a, b) =>
        Number(network.has(a.route.id)) - Number(network.has(b.route.id)) || a.route.id.localeCompare(b.route.id)
    );
    for (let i = 1; i < arms.length; i++) {
      const arm = arms[i];
      if (!network.has(arm.route.id)) continue;
      const input = result.get(arm.route.id)!;
      const oriented = arm.start ? input : input.slice().reverse();
      const probe = prefix(oriented, 16);
      if (!probe) continue;
      for (const reference of arms.slice(0, i)) {
        const raw = result.get(reference.route.id)!;
        const stem = prefix(reference.start ? raw : raw.slice().reverse(), 16);
        if (!stem) continue;
        const a = sub(stem.at(-1)!, stem[0]),
          b = sub(probe.at(-1)!, probe[0]);
        const dot = (a.x * b.x + a.z * b.z) / (Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z));
        if (dot < 0.5 || distance(stem.at(-1)!, probe.at(-1)!) > Math.max(arm.route.width, reference.route.width) * 2)
          continue;
        let cut = 1,
          along = 0;
        while (cut < oriented.length - 1 && along + distance(oriented[cut - 1], oriented[cut]) < 16) {
          along += distance(oriented[cut - 1], oriented[cut]);
          cut++;
        }
        const proposed = [...stem, ...oriented.slice(cut)];
        const width = Math.min(
          arm.route.maxWidth ?? arm.route.width,
          reference.route.maxWidth ?? reference.route.width
        );
        if (
          !clear(
            proposed,
            ribbonOutline(
              proposed,
              proposed.map(() => width),
              undefined,
              true
            )
          )
        )
          continue;
        result.set(arm.route.id, arm.start ? proposed : proposed.reverse());
        break;
      }
    }
  }
  return result;
}

/** Build an actual road graph before smoothing: coincident spans are one edge; crossings become shared junctions.
 * Simplified search spines retain shared runs without forcing entrance grid foldbacks. Each physical chain is compiled once, then reused by every journey.
 */
function buildConnectionGraph(plan: IslandPlan, clear: RoadClearance, keysOnly = false): boolean {
  // Generated junction IDs encode their current coordinate. A bank move must not
  // retain an old coordinate ID that a new intersection can legitimately reuse.
  const source = plan.routes
      .map((input) => {
        const route =
          keysOnly && input.keypoints?.length
            ? {
                ...input,
                points: input.keypoints.map((key) => key.position),
                widths: input.keypoints.map((key) => key.width)
              }
            : input;
        if (!route.points.length) return route;
        const from = route.from.startsWith("road-junction:") ? `road-junction:${key(route.points[0])}` : route.from;
        const to = route.to.startsWith("road-junction:") ? `road-junction:${key(route.points.at(-1)!)}` : route.to;
        return from === route.from && to === route.to ? route : { ...route, from, to };
      })
      .sort((a, b) => a.id.localeCompare(b.id)),
    segments: Segment[] = [];
  const sourceById = new Map(source.map((route) => [route.id, route]));
  const networkByRoute = new Map(plan.roadNetwork?.edges.map((edge) => [edge.routeId, edge]));
  const spines = keysOnly ? sharedEntranceSpines(source, networkByRoute, clear) : undefined;
  const byRoute = new Map<string, Segment[]>();
  // Logical journeys may share exactly the same span. Intersect each physical
  // undirected span once; all journey references consume its shared cut list.
  const physicalSegments = new Map<string, Segment>();
  const endpoints = new Map<string, string>();
  for (const r of source)
    if (r.points.length) {
      if (!endpoints.has(key(r.points[0]))) endpoints.set(key(r.points[0]), r.from);
      if (!endpoints.has(key(r.points.at(-1)!))) endpoints.set(key(r.points.at(-1)!), r.to);
    }
  const nodeId = (coordinate: string) => endpoints.get(coordinate) ?? `road-junction:${coordinate}`;
  for (const route of source) {
    const points = spines?.get(route.id) ?? route.points;
    // Most spine keys are exact samples; do not project each key onto every sampled span.
    const sampledWidths = new Map<string, number>();
    if (points !== route.points)
      route.points.forEach((p, i) => {
        const id = `${p.x}:${p.z}`;
        if (!sampledWidths.has(id)) sampledWidths.set(id, route.widths?.[i] ?? route.width);
      });
    const widthAt = (point: PlanPoint) => {
      const exact = sampledWidths.get(`${point.x}:${point.z}`);
      if (exact !== undefined) return exact;
      let best = Infinity,
        width = route.width;
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1],
          b = route.points[i],
          dx = b.x - a.x,
          dz = b.z - a.z,
          length = dx * dx + dz * dz;
        const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length)) : 0;
        const gap = distance(point, at(a, b, t));
        if (gap < best) {
          best = gap;
          width = (route.widths?.[i - 1] ?? route.width) * (1 - t) + (route.widths?.[i] ?? route.width) * t;
        }
      }
      return width;
    };
    const spineWidths = points === route.points ? route.widths : points.map(widthAt);
    const parts: Segment[] = [];
    for (let i = 1; i < points.length; i++)
      if (distance(points[i - 1], points[i]) > 1e-5) {
        const part: Segment = {
          a: points[i - 1],
          b: points[i],
          route,
          minX: Math.min(points[i - 1].x, points[i].x),
          maxX: Math.max(points[i - 1].x, points[i].x),
          minZ: Math.min(points[i - 1].z, points[i].z),
          maxZ: Math.max(points[i - 1].z, points[i].z),
          tolerance:
            1e-6 + 1e-7 * Math.max(Math.abs(points[i].x - points[i - 1].x), Math.abs(points[i].z - points[i - 1].z)),
          cuts: [0, 1],
          owners: new Set([route.id]),
          wa: spineWidths?.[i - 1] ?? route.width,
          wb: spineWidths?.[i] ?? route.width
        };
        const ka = `${part.a.x}:${part.a.z}`,
          kb = `${part.b.x}:${part.b.z}`;
        const signature = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const existing = physicalSegments.get(signature);
        if (existing) {
          existing.owners.add(route.id);
          part.cuts = existing.cuts;
          part.reversedCuts = part.a.x !== existing.a.x || part.a.z !== existing.a.z;
          part.owners = existing.owners;
        } else {
          physicalSegments.set(signature, part);
          segments.push(part);
        }
        parts.push(part);
      }
    byRoute.set(route.id, parts);
  }
  // Sampled pavement has sub-metre segments. A coarse search-grid bucket would
  // compare thousands of disjoint pairs; bounds still guard the exact intersection.
  const cellM = 4;
  const buckets = new Map<string, number[]>();
  const cut = (s: Segment, t: number) => {
    if (t >= -1e-7 && t <= 1 + 1e-7) s.cuts.push(Math.max(0, Math.min(1, t)));
  };
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i],
      candidates = new Set<number>();
    for (let x = Math.floor((s.minX - s.tolerance) / cellM); x <= Math.floor((s.maxX + s.tolerance) / cellM); x++)
      for (let z = Math.floor((s.minZ - s.tolerance) / cellM); z <= Math.floor((s.maxZ + s.tolerance) / cellM); z++) {
        const id = `${x}:${z}`,
          bucket = buckets.get(id) ?? [];
        for (const j of bucket) candidates.add(j);
        bucket.push(i);
        buckets.set(id, bucket);
      }
    for (const j of candidates) {
      const t = segments[j];
      const tolerance = s.tolerance + t.tolerance;
      if (
        s.maxX + tolerance < t.minX ||
        t.maxX + tolerance < s.minX ||
        s.maxZ + tolerance < t.minZ ||
        t.maxZ + tolerance < s.minZ
      )
        continue;
      if (t.route.id === s.route.id && t.owners.size === 1 && s.owners.size === 1) continue;
      const u = sub(s.b, s.a),
        v = sub(t.b, t.a),
        w = sub(t.a, s.a),
        d = cross(u, v);
      if (Math.abs(d) > 1e-9) {
        const a = cross(w, v) / d,
          b = cross(w, u) / d;
        if (a >= -1e-7 && a <= 1 + 1e-7 && b >= -1e-7 && b <= 1 + 1e-7) {
          cut(s, a);
          cut(t, b);
        }
      } else if (Math.abs(cross(w, u)) < 1e-6) {
        const project = (p: PlanPoint, a: PlanPoint, d: PlanPoint) =>
          ((p.x - a.x) * d.x + (p.z - a.z) * d.z) / (d.x * d.x + d.z * d.z);
        cut(s, project(t.a, s.a, u));
        cut(s, project(t.b, s.a, u));
        cut(t, project(s.a, t.a, v));
        cut(t, project(s.b, t.a, v));
      }
    }
  }
  const positions = new Map<string, PlanPoint>(),
    edges = new Map<string, Edge>(),
    walks = new Map<string, { edge: string; from: string; to: string }[]>();
  const stops = new Set<string>();
  for (const route of source) {
    const walk: { edge: string; from: string; to: string }[] = [];
    for (const segment of byRoute.get(route.id)!) {
      const cuts = [...new Set(segment.reversedCuts ? segment.cuts.map((t) => 1 - t) : segment.cuts)].sort(
        (a, b) => a - b
      );
      for (let i = 1; i < cuts.length; i++) {
        const a = at(segment.a, segment.b, cuts[i - 1]),
          b = at(segment.a, segment.b, cuts[i]),
          ka = key(a),
          kb = key(b);
        if (ka === kb) continue;
        positions.set(ka, a);
        positions.set(kb, b);
        const id = ka < kb ? ka + "|" + kb : kb + "|" + ka;
        const edge = edges.get(id) ?? { id, a: ka, b: kb, width: 0, wa: 0, wb: 0, owners: new Set<string>() };
        const wa = segment.wa + (segment.wb - segment.wa) * cuts[i - 1];
        const wb = segment.wa + (segment.wb - segment.wa) * cuts[i];
        edge.wa = Math.max(edge.wa, edge.a === ka ? wa : wb);
        edge.wb = Math.max(edge.wb, edge.a === ka ? wb : wa);
        edge.width = Math.max(edge.wa, edge.wb);
        edge.owners.add(route.id);
        edges.set(id, edge);
        walk.push({ edge: id, from: ka, to: kb });
      }
    }
    if (walk.length) {
      stops.add(walk[0].from);
      stops.add(walk.at(-1)!.to);
    }
    walks.set(route.id, walk);
  }
  // A bank junction can move while its selected POI entrance remains on the
  // sampled pavement. Keep that existing vertex as a stop; creating another
  // road merely to rediscover the entrance is unnecessary.
  const usedEntrances = new Set(plan.roadNetwork?.edges.flatMap((edge) => [edge.a, edge.b]));
  for (const node of plan.roadNetwork?.nodes ?? []) {
    const coordinate = key(node.position);
    if (!usedEntrances.has(node.id) || !positions.has(coordinate)) continue;
    for (const [point, id] of endpoints) if (id === node.id && point !== coordinate) endpoints.delete(point);
    endpoints.set(coordinate, node.id);
    stops.add(coordinate);
  }
  const adjacency = new Map<string, Edge[]>();
  for (const edge of edges.values())
    for (const node of [edge.a, edge.b]) adjacency.set(node, [...(adjacency.get(node) ?? []), edge]);
  const ownership = (e: Edge) => JSON.stringify([...e.owners].sort());
  for (const [node, links] of adjacency)
    if (links.length !== 2 || ownership(links[0]) !== ownership(links[1])) stops.add(node);
  const graph: RoadGraph = { ...(keysOnly ? { construction: "keypoints" as const } : {}), nodes: [], sections: [] },
    mapped = new Map<string, number>();
  for (const edge of edges.values()) {
    if (mapped.has(edge.id)) continue;
    // Walk backwards to a junction before compiling the maximal shared chain.
    let start = edge.a,
      previous = edge,
      seen = new Set<string>();
    while (!stops.has(start) && !seen.has(start)) {
      seen.add(start);
      const next = adjacency.get(start)!.find((e) => e !== previous)!;
      start = next.a === start ? next.b : next.a;
      previous = next;
    }
    const points = [positions.get(start)!],
      chain: Edge[] = [];
    const widths = [previous.a === start ? previous.wa : previous.wb];
    let node = start,
      current = previous;
    do {
      chain.push(current);
      node = current.a === node ? current.b : current.a;
      points.push(positions.get(node)!);
      widths.push(current.a === node ? current.wa : current.wb);
      if (stops.has(node) || node === start) break;
      current = adjacency.get(node)!.find((e) => e !== current)!;
    } while (chain.length <= edges.size);
    const owners = [...edge.owners].sort(),
      owner = sourceById.get(owners[0])!;
    const sectionId = `road-section:${start}|${node}|${chain[0].id}`;
    const definition = {
      id: sectionId,
      label: owner.label,
      kind: owner.kind,
      from: nodeId(start),
      to: nodeId(node),
      width: Math.max(...widths),
      widths
    };
    const published = publishRoadPath(definition, points);
    published.width = published.maxWidth!;
    const index = graph.sections.length;
    // Parallel chains can have identical endpoints. Their first physical edge
    // distinguishes them without hashing or depending on logical journey owners.
    graph.sections.push({ id: sectionId, owners, route: published });
    for (const e of chain) mapped.set(e.id, index);
  }
  for (const node of stops)
    graph.nodes.push({ id: nodeId(node), position: positions.get(node)!, degree: adjacency.get(node)?.length ?? 0 });
  taperRoadJoins(
    graph.sections.map((section) => section.route),
    clear
  );
  plan.routes = source.map((route) => {
    const links: NonNullable<PlanRoute["navigationLinks"]> = [];
    const sampledWidths: number[][] = [];
    let prior = -1;
    for (const step of walks.get(route.id)!) {
      const index = mapped.get(step.edge)!;
      if (index === prior) continue;
      prior = index;
      const section = graph.sections[index].route,
        forward = section.from === nodeId(step.from);
      sampledWidths.push(forward ? section.widths! : section.widths!.slice().reverse());
      links.push({
        from: forward ? section.from : section.to,
        to: forward ? section.to : section.from,
        points: forward ? section.points : section.points.slice().reverse(),
        width: section.width
      });
    }
    if (!links.length) return route;
    links[0].from = route.from;
    links.at(-1)!.to = route.to;
    const points = links.flatMap((link, i) => (i ? link.points.slice(1) : link.points));
    const widths = sampledWidths.flatMap((w, i) => w.slice(i ? 1 : 0));
    return {
      ...publishRoadPath({ ...route, widths }, points, route),
      navigationLinks: links
    };
  });
  plan.roadGraph = graph;
  if (plan.planning) plan.planning.ports = plan.planning.ports.filter((p) => !p.id.startsWith("road-junction:"));
  // Index incident widths once; scanning every section for every junction is quadratic.
  const incidentWidths = new Map<string, number>();
  for (const section of graph.sections)
    for (const id of [section.route.from, section.route.to])
      incidentWidths.set(id, Math.max(incidentWidths.get(id) ?? -Infinity, section.route.width));
  const publishedPorts = new Set(plan.planning?.ports.map((port) => port.id));
  for (const node of graph.nodes)
    if (plan.planning && !publishedPorts.has(node.id)) {
      plan.planning.ports.push({
        id: node.id,
        ownerId: "world-routes",
        position: node.position,
        height: 0,
        width: incidentWidths.get(node.id) ?? -Infinity,
        kind: "landing"
      });
      publishedPorts.add(node.id);
    }
  return true;
}

/** Build connectivity and select useful physical edges on sparse corridor keys.
 * Curves are a projection of this graph; they never feed another whole-world topology solve.
 * Hydrology can first insert bank keys by deferring the final spline projection.
 */
export function resolveRoadTopology(plan: IslandPlan, clear: RoadClearance, smooth = true, deferSplines = false): void {
  buildConnectionGraph(plan, clear, true);
  reduceRoadNetwork(plan, clear);
  if (smooth && !deferSplines) compileRoadGraphSplines(plan, clear);
}

/** Unique physical pavement for all renderers; IDs still select their logical owning parameter record. */
export function roadSurfaces(plan: IslandPlan): PlanRoute[] {
  return plan.roadGraph?.sections.map((section) => section.route) ?? plan.routes;
}

/** All logical connections owning a physical road surface; selection never duplicates pavement. */
export function roadSurfaceOwners(plan: IslandPlan, route: PlanRoute): string[] {
  return plan.roadGraph?.sections.find((s) => s.route === route)?.owners ?? [route.id];
}

/** Split accepted pavement at new joins without resmoothing or reducing required connections. */
export function rebuildRoadTopology(plan: IslandPlan, clear: RoadClearance): boolean {
  return buildConnectionGraph(plan, clear);
}

/** Split changed canonical pavement, then resolve journey references without another network reduction. */
export function rebuildPhysicalRoadTopology(
  plan: IslandPlan,
  clear: RoadClearance,
  priorPaths?: ReadonlyMap<string, readonly PlanPoint[]>
): boolean {
  const graph = plan.roadGraph;
  if (!graph) return rebuildRoadTopology(plan, clear);
  const journeys = plan.routes,
    represented = new Set(graph.sections.flatMap((s) => s.owners));
  const inputs = [
    ...graph.sections,
    ...journeys.filter((r) => !represented.has(r.id)).map((route) => ({ id: route.id, owners: [route.id], route }))
  ];
  const sections = new Map(inputs.map((s) => [s.id, s]));
  const ends = new Map<string, { id: string; forward: boolean; points: readonly PlanPoint[] }[]>();
  for (const s of inputs) {
    const points = priorPaths?.get(s.id) ?? s.route.points;
    for (const forward of [true, false]) {
      const a = points[forward ? 0 : points.length - 1],
        b = points[forward ? points.length - 1 : 0];
      const id = `${key(a)}|${key(b)}`;
      ends.set(id, [...(ends.get(id) ?? []), { id: s.id, forward, points }]);
    }
  }
  plan.routes = inputs.map((s) => ({ ...s.route, id: s.id }));
  if (!buildConnectionGraph(plan, clear, graph.construction === "keypoints")) {
    plan.routes = journeys;
    return false;
  }
  const compiled = new Map(plan.routes.map((r) => [r.id, r]));
  for (const section of plan.roadGraph!.sections) {
    section.owners = [...new Set(section.owners.flatMap((id) => sections.get(id)!.owners))].sort();
  }
  plan.routes = journeys.map((route) => {
    const mapped = (route.navigationLinks ?? []).map((link) => {
      const candidates = ends.get(`${key(link.points[0])}|${key(link.points.at(-1)!)}`) ?? [];
      const source =
        candidates.find(
          (c) =>
            c.points.length === link.points.length &&
            link.points.every((p, i) => distance(p, c.points[c.forward ? i : c.points.length - 1 - i]) < 1e-4)
        ) ?? (candidates.length === 1 ? candidates[0] : undefined);
      if (!source) return { links: [link], widths: link.points.map(() => link.width) };
      const current = compiled.get(source.id)!;
      const links = current.navigationLinks!.map((l) => ({ ...l }));
      if (!source.forward) {
        links.reverse();
        for (const l of links) {
          [l.from, l.to] = [l.to, l.from];
          l.points = l.points.slice().reverse();
        }
      }
      return { links, widths: source.forward ? current.widths! : current.widths!.slice().reverse() };
    });
    if (!mapped.length) return route;
    const links = mapped.flatMap((m) => m.links);
    links[0].from = route.from;
    links.at(-1)!.to = route.to;
    const points = links.flatMap((l, i) => (i ? l.points.slice(1) : l.points));
    const widths = mapped.flatMap((m, i) => (i ? m.widths.slice(1) : m.widths));
    return { ...publishRoadPath({ ...route, widths, keypoints: undefined }, points, route), navigationLinks: links };
  });
  return true;
}
