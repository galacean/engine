import type { IslandPlan, PlanPoint, PlanRoute } from "../../semantic-study/IslandPlanModel";
import type { PlanningCheck } from "../../semantic-study/WorldPlanningContract";
import { footprintBoundsLookup } from "./FootprintLookup";
import { bounds } from "./Volumes";
import settings from "../../planning-data/road-network.json";
import { layoutRule } from "./LayoutRules";
import { compileRoadPath, publishRoadPath, taperRoadJoins, type RoadClearance } from "./RoadGeometry";
import { rebuildPhysicalRoadTopology, type RoadGraph } from "./RoadTopology";

const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
type Section = RoadGraph["sections"][number];

/** A road may end at a selected POI entrance, member entrance or declared member approach.
 * Unused access candidates and anonymous search-grid ends remain unfinished branches. */
export function isRoadDestination(plan: IslandPlan, point: PlanPoint): boolean {
  // An explicit world-network POI entrance is already a destination, including
  // organizations without internal paths. Do not "repair" it with a return loop.
  const entrance = plan.roadNetwork?.nodes.find(
    (node) =>
      node.poiId &&
      distance(node.position, point) < 1e-3 &&
      plan.roadNetwork!.edges.some((edge) => edge.a === node.id || edge.b === node.id) &&
      plan.spatialLayout?.groups.some((group) => group.id === node.poiId)
  );
  if (entrance) return true;
  if (
    plan.planning?.ports.some(
      (port) =>
        port.destinationAreaId &&
        distance(port.position, point) < 1e-3 &&
        plan.regions.some((area) => area.id === port.destinationAreaId && area.navigationArea?.length)
    )
  )
    return true;
  return (plan.spatialLayout?.groups ?? []).some((group) => {
    if (!layoutRule(group.rule.pattern).allowContentTermini) return false;
    return group.ports.some(
      (port) =>
        distance(port.position, point) < 1e-3 &&
        (group.volumes.some((v) => port.id === v.id + ":port" || port.servesVolumeId === v.id) ||
          port.id === group.id + ":center:port")
    );
  });
}

/** Audit the final pavement, including when loading an accepted cached graph. */
export function auditRoadTermini(plan: IslandPlan): PlanningCheck[] {
  return (plan.roadGraph?.nodes ?? [])
    .filter((n) => n.degree === 1 && !isRoadDestination(plan, n.position))
    .map((n) => ({
      id: `terminal:${n.id}`,
      rule: "road-termination",
      owners: plan
        .roadGraph!.sections.filter((s) => s.route.from === n.id || s.route.to === n.id)
        .flatMap((s) => s.owners),
      required: false,
      status: "fail",
      message: "道路末端没有内容入口；局部预算内未找到可汇入的路段",
      measured: 1,
      limit: 0
    }));
}

/** Remove unsupported tails after bounded attachment. Content entrances and world
 * destinations never move; only guide ends with no journey to serve are shortened.
 * Logical journeys consume the same retained sections as rendering and navigation. */
export function pruneUnservedRoadTails(plan: IslandPlan, clear: RoadClearance): void {
  const graph = plan.roadGraph;
  if (!graph) return;
  const adjacency = new Map<string, Set<Section>>();
  for (const section of graph.sections)
    for (const id of [section.route.from, section.route.to]) {
      if (!adjacency.has(id)) adjacency.set(id, new Set());
      adjacency.get(id)!.add(section);
    }
  const protectedIds = new Set(
    graph.nodes.filter((node) => isRoadDestination(plan, node.position)).map((node) => node.id)
  );
  const queue = graph.nodes.filter((node) => node.degree === 1 && !protectedIds.has(node.id)).map((node) => node.id);
  const removed = new Set<Section>();
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor],
      edges = adjacency.get(id)!;
    if (edges.size !== 1 || protectedIds.has(id)) continue;
    const section = edges.values().next().value!;
    removed.add(section);
    for (const end of [section.route.from, section.route.to]) {
      adjacency.get(end)!.delete(section);
      if (adjacency.get(end)!.size === 1 && !protectedIds.has(end)) queue.push(end);
    }
  }
  if (!removed.size) return;
  const coordinate = (p: PlanPoint) => `${p.x.toFixed(4)},${p.z.toFixed(4)}`;
  const endpoints = (points: PlanPoint[]) => [coordinate(points[0]), coordinate(points.at(-1)!)].sort().join("|");
  const retained = graph.sections.filter((section) => !removed.has(section));
  const byEnds = new Map<string, Section[]>();
  for (const section of retained) {
    const key = endpoints(section.route.points);
    byEnds.set(key, [...(byEnds.get(key) ?? []), section]);
  }
  const nodesByPosition = new Map(graph.nodes.map((node) => [coordinate(node.position), node.id]));
  taperRoadJoins(
    retained.map((section) => section.route),
    clear
  );
  plan.routes = plan.routes.flatMap((route) => {
    const links = (
      route.navigationLinks ?? [{ from: route.from, to: route.to, points: route.points, width: route.width }]
    ).flatMap((link) => {
      const section = byEnds
        .get(endpoints(link.points))
        ?.find(
          (s) =>
            s.owners.includes(route.id) &&
            s.route.points.length === link.points.length &&
            link.points.every(
              (p, i) =>
                distance(
                  p,
                  s.route.points[
                    coordinate(s.route.points[0]) === coordinate(link.points[0]) ? i : s.route.points.length - 1 - i
                  ]
                ) < 1e-3
            )
        );
      if (!section) return [];
      const forward = coordinate(section.route.points[0]) === coordinate(link.points[0]);
      const points = forward ? section.route.points : section.route.points.slice().reverse();
      const widths = forward ? section.route.widths! : section.route.widths!.slice().reverse();
      return [{ link: { ...link, points, width: section.route.width }, widths }];
    });
    if (!links.length) return [];
    const points = links.flatMap((item, i) => item.link.points.slice(i ? 1 : 0));
    const widths = links.flatMap((item, i) => item.widths.slice(i ? 1 : 0));
    const from =
      coordinate(route.points[0]) === coordinate(points[0]) ? route.from : nodesByPosition.get(coordinate(points[0]))!;
    const to =
      coordinate(route.points.at(-1)!) === coordinate(points.at(-1)!)
        ? route.to
        : nodesByPosition.get(coordinate(points.at(-1)!))!;
    links[0].link.from = from;
    links.at(-1)!.link.to = to;
    return [
      {
        ...publishRoadPath({ ...route, from, to, widths, keypoints: undefined }, points, route),
        navigationLinks: links.map((item) => item.link)
      }
    ];
  });
  const published = new Set(plan.routes.map((route) => route.id));
  graph.sections = retained.map((section) => {
    const owners = section.owners.filter((id) => published.has(id));
    return {
      ...section,
      owners,
      route: { ...section.route, id: owners.includes(section.route.id) ? section.route.id : owners[0] }
    };
  });
  graph.nodes = graph.nodes
    .filter((node) => adjacency.get(node.id)!.size > 0)
    .map((node) => ({ ...node, degree: adjacency.get(node.id)!.size }));
  if (plan.planning) {
    plan.planning.modules = plan.planning.modules.map((module) => ({
      ...module,
      memberIds: module.memberIds?.filter((id) => !id.includes(":path:") || published.has(id))
    }));
    plan.planning.ports = plan.planning.ports.filter(
      (port) => !port.id.startsWith("road-junction:") || adjacency.get(port.id)?.size
    );
  }
}

/** Complete through-road leaves by joining existing pavement, leaving placed volumes and accepted roads fixed.
 * Search is bounded and failures remain diagnostics. New connections share real split junctions; they are
 * not passed through a spanning-tree reduction that would immediately recreate the same dangling leaf.
 * @param search Finite local corridor search with the caller's land, water and occupied-volume geometry.
 */
export function attachRoadBranches(
  plan: IslandPlan,
  search: (from: PlanPoint, to: PlanPoint, width: number) => PlanPoint[] | undefined,
  clear: RoadClearance,
  previous: readonly PlanRoute[] = [],
  canJoin: (point: PlanPoint, width: number) => boolean = () => true
): PlanningCheck[] {
  if (!plan.roadGraph) return [];
  // Restore independent accepted attachments in one graph pass. This keeps a local
  // parameter edit from paying one whole topology rebuild for every unaffected join.
  const restored: PlanRoute[] = [];
  for (const prior of previous.filter((r) => r.id.startsWith("road-attachment:"))) {
    const node = plan.roadGraph.nodes.find((n) => n.degree === 1 && distance(n.position, prior.points[0]) < 1e-5);
    if (!node) continue;
    const stem = plan.roadGraph.sections.find((s) => s.route.from === node.id || s.route.to === node.id)!;
    const width = (stem.route.to === node.id ? stem.route.widths?.at(-1) : stem.route.widths?.[0]) ?? stem.route.width;
    const retained =
      Math.abs(prior.width - width) < 1e-6
        ? structuredClone(prior)
        : publishRoadPath(
            {
              ...prior,
              width,
              widths: prior.widths?.map((w) => (w * width) / prior.width),
              keypoints: prior.keypoints?.map((k) => ({ ...k, width: (k.width * width) / prior.width }))
            },
            prior.points
          );
    const end = retained.points.at(-1)!;
    const targetExists = plan.roadGraph.sections.some(
      (s) =>
        !s.owners.some((o) => stem.owners.includes(o)) &&
        s.route.points.slice(1).some((b, i) => {
          const a = s.route.points[i];
          return Math.abs(distance(a, end) + distance(end, b) - distance(a, b)) < 1e-5;
        })
    );
    if (targetExists && canJoin(end, width) && clear(retained.points, retained.outline!)) restored.push(retained);
  }
  if (restored.length) {
    const original = plan.routes;
    plan.routes = [...plan.routes, ...restored];
    if (!rebuildPhysicalRoadTopology(plan, clear)) plan.routes = original;
  }
  // Select connections against a lightweight working graph. New curves become
  // available targets immediately; pavement intersections are compiled once below.
  const acceptedGraph = plan.roadGraph;
  const workingGraph = {
    ...acceptedGraph,
    nodes: acceptedGraph.nodes.map((n) => ({ ...n })),
    sections: acceptedGraph.sections.slice()
  };
  const pending: PlanRoute[] = [];
  const pathGroups = new Map(
    (plan.spatialLayout?.groups ?? []).flatMap((group) =>
      (group.paths ?? []).map((path) => [path.id, group.id] as const)
    )
  );
  const segments = (sections: Section[]) =>
    sections.flatMap((section) =>
      section.route.points.slice(1).map((b, i) => ({ section, a: section.route.points[i], b }))
    );
  const sectionLengths = new Map(
    acceptedGraph.sections.map((section) => [
      section.id,
      section.route.points.slice(1).reduce((sum, p, i) => sum + distance(p, section.route.points[i]), 0)
    ])
  );
  const prepareQueries = () => {
    const pavementAt = footprintBoundsLookup(segments(workingGraph.sections), (segment) => [segment.a, segment.b], 8);
    const adjacency = new Map<string, Section[]>();
    for (const section of workingGraph.sections)
      for (const id of [section.route.from, section.route.to]) {
        let edges = adjacency.get(id);
        if (!edges) adjacency.set(id, (edges = []));
        edges.push(section);
      }
    return { pavementAt, adjacency };
  };
  let queries: ReturnType<typeof prepareQueries> | undefined;
  const leaves = workingGraph.nodes.filter((n) => n.degree === 1 && !isRoadDestination(plan, n.position));
  for (const leaf of leaves) {
    // A prior connection can already have joined this leaf.
    const graph = workingGraph;
    const current = graph.nodes.find((n) => distance(n.position, leaf.position) < 1e-3);
    if (!current || current.degree !== 1) continue;
    // Failed joins leave the working graph unchanged, including its exact query order.
    const { pavementAt, adjacency } = (queries ??= prepareQueries());
    const stem = graph.sections.find((s) => s.route.from === current.id || s.route.to === current.id)!;
    const forward = stem.route.to === current.id;
    const priorPoint = forward ? stem.route.points.at(-2)! : stem.route.points[1];
    const heading = { x: leaf.position.x - priorPoint.x, z: leaf.position.z - priorPoint.z };
    const headingLength = Math.hypot(heading.x, heading.z) || 1;
    heading.x /= headingLength;
    heading.z /= headingLength;
    const width = (forward ? stem.route.widths?.at(-1) : stem.route.widths?.[0]) ?? stem.route.width;
    const publish = (route: PlanRoute, target?: Section) => {
      // Split the lightweight working graph immediately. Subsequent joins must
      // see that this junction already connects the two roads, even though the
      // expensive pavement compilation is deferred until the end of the batch.
      if (target && graph.sections.includes(target)) {
        const end = route.points.at(-1)!;
        const points = target.route.points;
        const existing = graph.nodes.find((node) => distance(node.position, end) < 1e-3);
        if (existing) route.to = existing.id;
        if (distance(points[0], end) > 1e-3 && distance(points.at(-1)!, end) > 1e-3) {
          let cut = 1,
            nearest = Infinity;
          for (let i = 1; i < points.length; i++) {
            const gap = distance(points[i - 1], end) + distance(end, points[i]) - distance(points[i - 1], points[i]);
            if (gap < nearest) {
              cut = i;
              nearest = gap;
            }
          }
          const ratio = distance(points[cut - 1], end) / distance(points[cut - 1], points[cut]);
          const widths = target.route.widths ?? points.map(() => target.route.width);
          const widthAtJoin = widths[cut - 1] + (widths[cut] - widths[cut - 1]) * ratio;
          const parts = [
            {
              from: target.route.from,
              to: route.to,
              points: [...points.slice(0, cut), end],
              widths: [...widths.slice(0, cut), widthAtJoin]
            },
            {
              from: route.to,
              to: target.route.to,
              points: [end, ...points.slice(cut)],
              widths: [widthAtJoin, ...widths.slice(cut)]
            }
          ].map((part, i) => ({
            id: target.id + ":join:" + route.to + ":" + i,
            owners: target.owners,
            route: { ...target.route, ...part }
          }));
          graph.sections.splice(graph.sections.indexOf(target), 1, ...parts);
          for (const part of parts)
            sectionLengths.set(
              part.id,
              part.route.points.slice(1).reduce((sum, p, i) => sum + distance(p, part.route.points[i]), 0)
            );
          if (!existing) graph.nodes.push({ id: route.to, position: end, degree: 2 });
        }
      }
      pending.push(route);
      graph.sections.push({ id: route.id, owners: [route.id], route });
      sectionLengths.set(
        route.id,
        route.points.slice(1).reduce((sum, p, i) => sum + distance(p, route.points[i]), 0)
      );
      // A selected connection consumes both endpoint leaves when applicable.
      // Mid-segment targets already exist in the lightweight graph above.
      for (const endpoint of [route.points[0], route.points.at(-1)!]) {
        const node = graph.nodes.find((n) => distance(n.position, endpoint) < 1e-3);
        if (node) node.degree++;
      }
      queries = undefined;
      return true;
    };
    const prior = previous.find(
      (r) => r.id === `road-attachment:${leaf.id}` && distance(r.points[0], leaf.position) < 1e-5
    );
    const retained =
      prior &&
      (Math.abs(prior.width - width) < 1e-6
        ? structuredClone(prior)
        : publishRoadPath(
            {
              ...prior,
              width,
              widths: prior.widths?.map((w) => (w * width) / prior.width),
              keypoints: prior.keypoints?.map((k) => ({ ...k, width: (k.width * width) / prior.width }))
            },
            prior.points
          ));
    if (retained && clear(retained.points, retained.outline!)) {
      const end = retained.points.at(-1)!;
      const targetExists = graph.sections.some(
        (s) =>
          !s.owners.some((o) => stem.owners.includes(o)) &&
          s.route.points.slice(1).some((b, i) => {
            const a = s.route.points[i],
              length = distance(a, b);
            return Math.abs(distance(a, end) + distance(end, b) - length) < 1e-5;
          })
      );
      if (targetExists && canJoin(end, width) && publish(retained)) continue;
    }
    // One shortest-path tree per leaf is enough to distinguish a useful circuit
    // from a return lane laid alongside the road we have just travelled.
    const costTo = new Map([[current.id, 0]]),
      predecessor = new Map<string, { from: string; section: Section }>();
    const open = new Set([current.id]);
    while (open.size) {
      let at = "",
        best = Infinity;
      for (const id of open)
        if (costTo.get(id)! < best) {
          at = id;
          best = costTo.get(id)!;
        }
      open.delete(at);
      for (const section of adjacency.get(at) ?? []) {
        const next = section.route.from === at ? section.route.to : section.route.from;
        const length = sectionLengths.get(section.id)!;
        const cost = best + length;
        if (cost >= (costTo.get(next) ?? Infinity)) continue;
        costTo.set(next, cost);
        predecessor.set(next, { from: at, section });
        open.add(next);
      }
    }
    const makesRedundantLoop = (route: PlanRoute, target: Section) => {
      const end = route.points.at(-1)!;
      const points = target.route.points;
      let cut = 1,
        nearest = Infinity;
      for (let i = 1; i < points.length; i++) {
        const gap = distance(points[i - 1], end) + distance(end, points[i]) - distance(points[i - 1], points[i]);
        if (gap < nearest) {
          cut = i;
          nearest = gap;
        }
      }
      const before = [...points.slice(0, cut), end],
        after = [end, ...points.slice(cut)];
      const length = (ps: PlanPoint[]) => ps.slice(1).reduce((sum, p, i) => sum + distance(ps[i], p), 0);
      const from =
        (costTo.get(target.route.from) ?? Infinity) + length(before) <=
        (costTo.get(target.route.to) ?? Infinity) + length(after);
      let at = from ? target.route.from : target.route.to;
      if (!costTo.has(at)) return false;
      const ring = [...route.points, ...(from ? before.slice().reverse() : after).slice(1)];
      const localGroups = new Set(target.owners.map((owner) => pathGroups.get(owner)).filter(Boolean));
      while (at !== current.id) {
        const step = predecessor.get(at)!;
        for (const group of localGroups)
          if (!step.section.owners.some((owner) => pathGroups.get(owner) === group)) localGroups.delete(group);
        const ps =
          step.section.route.from === at ? step.section.route.points : step.section.route.points.slice().reverse();
        ring.push(...ps.slice(1));
        at = step.from;
      }
      // An unused guide end cannot gain a destination by circling its own organization.
      if (localGroups.size) return true;
      const area =
        Math.abs(
          ring.reduce((sum, p, i) => {
            const q = ring[(i + 1) % ring.length];
            return sum + p.x * q.z - q.x * p.z;
          }, 0)
        ) / 2;
      return area <= length(ring) * Math.max(route.width, target.route.width);
    };
    const candidates: { section: Section; point: PlanPoint; tangent: PlanPoint; width: number; cost: number }[] = [];
    for (const section of graph.sections) {
      if (section.owners.some((owner) => stem.owners.includes(owner))) continue;
      const route = section.route;
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1],
          b = route.points[i],
          dx = b.x - a.x,
          dz = b.z - a.z;
        const length2 = dx * dx + dz * dz;
        if (length2 < 1e-8) continue;
        const t = Math.max(0, Math.min(1, ((leaf.position.x - a.x) * dx + (leaf.position.z - a.z) * dz) / length2));
        const point = { x: a.x + dx * t, z: a.z + dz * t },
          gap = distance(leaf.position, point);
        if (gap < width * 2 || gap > settings.branchJoinSearchM || !canJoin(point, width)) continue;
        const alignment = ((point.x - leaf.position.x) * heading.x + (point.z - leaf.position.z) * heading.z) / gap;
        const targetWidth = (route.widths?.[i - 1] ?? route.width) * (1 - t) + (route.widths?.[i] ?? route.width) * t;
        const sign = dx * (point.z - leaf.position.z) - dz * (point.x - leaf.position.x) >= 0 ? 1 : -1;
        const tangent = { x: (-dz / Math.sqrt(length2)) * sign, z: (dx / Math.sqrt(length2)) * sign };
        candidates.push({ section, point, tangent, width: targetWidth, cost: gap * (1 + (1 - alignment) * 0.5) });
      }
    }
    candidates.sort((a, b) => a.cost - b.cost || a.section.id.localeCompare(b.section.id));
    const attempted: PlanPoint[] = [];
    for (const candidate of candidates) {
      if (attempted.some((p) => distance(p, candidate.point) < Math.max(width * 2, 6))) continue;
      if (attempted.length >= settings.branchJoinCandidates) break;
      attempted.push(candidate.point);
      // Find connectivity once at the supported narrow corridor. Width fitting
      // belongs to geometry compilation, not five repeated path searches.
      const points = search(leaf.position, candidate.point, width * 0.125);
      const actualWidth = width;
      if (!points) continue;
      const length = points.slice(1).reduce((n, p, i) => n + distance(points[i], p), 0);
      if (length > distance(leaf.position, candidate.point) * settings.branchJoinMaxDetour) continue;
      const endId = `road-junction:${candidate.point.x.toFixed(4)},${candidate.point.z.toFixed(4)}`;
      const id = `road-attachment:${leaf.id}`;
      const keys = points.map((p, i) => ({
        ...p,
        width: i === points.length - 1 ? Math.min(actualWidth, candidate.width) : actualWidth
      }));
      const route = compileRoadPath({ id, from: leaf.id, to: endId, width, label: "路网汇入" }, keys, clear, 1, 1, {
        start: heading,
        end: candidate.tangent
      });
      if (!route) continue;
      // Stop at the first actual pavement intersection. A searched join may cross
      // its target (or another branch) before the requested projection; retaining
      // the remainder creates a second junction and a thin return loop.
      let joined = route;
      let blocked = false;
      let target = candidate.section;
      outer: for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1],
          b = route.points[i];
        let hit: { t: number; point: PlanPoint; section: Section } | undefined;
        const box = bounds([a, b], 1e-6);
        for (const { section, a: c, b: d } of pavementAt(box)) {
          if (
            Math.max(a.x, b.x) + 1e-6 < Math.min(c.x, d.x) ||
            Math.max(c.x, d.x) + 1e-6 < Math.min(a.x, b.x) ||
            Math.max(a.z, b.z) + 1e-6 < Math.min(c.z, d.z) ||
            Math.max(c.z, d.z) + 1e-6 < Math.min(a.z, b.z)
          )
            continue;
          const ux = b.x - a.x,
            uz = b.z - a.z,
            vx = d.x - c.x,
            vz = d.z - c.z;
          const det = ux * vz - uz * vx;
          if (Math.abs(det) < 1e-10) continue;
          const t = ((c.x - a.x) * vz - (c.z - a.z) * vx) / det;
          const u = ((c.x - a.x) * uz - (c.z - a.z) * ux) / det;
          if (t < -1e-7 || t > 1 + 1e-7 || u < -1e-7 || u > 1 + 1e-7) continue;
          const point = { x: a.x + ux * t, z: a.z + uz * t };
          if (distance(point, leaf.position) < 1e-3) continue;
          if (!hit || t < hit.t) hit = { t, point, section };
        }
        if (!hit) continue;
        if (hit.section.owners.some((owner) => stem.owners.includes(owner))) {
          blocked = true;
          break outer;
        }
        target = hit.section;
        const points = [...route.points.slice(0, i), hit.point];
        const widths = [
          ...route.widths!.slice(0, i),
          route.widths![i - 1] + (route.widths![i] - route.widths![i - 1]) * hit.t
        ];
        joined = publishRoadPath(
          {
            ...route,
            to: `road-junction:${hit.point.x.toFixed(4)},${hit.point.z.toFixed(4)}`,
            widths,
            keypoints: undefined
          },
          points
        );
        break outer;
      }
      if (
        blocked ||
        !canJoin(joined.points.at(-1)!, width) ||
        !clear(joined.points, joined.outline!) ||
        makesRedundantLoop(joined, target)
      )
        continue;
      // Recompile graph intersections only; do not move or resmooth existing pavement.
      if (!publish(joined, target)) continue;
      break;
    }
  }
  if (pending.length) {
    const original = plan.routes;
    plan.routes = [...original, ...pending];
    if (!rebuildPhysicalRoadTopology(plan, clear)) {
      plan.routes = original;
      plan.roadGraph = acceptedGraph;
    }
  }
  // Intersection arithmetic can differ by machine epsilon after an unrelated edit.
  // Reuse identical accepted records rather than persisting numerical churn.
  const same = (a: unknown, b: unknown): boolean => {
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-8;
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    const aa = a as Record<string, unknown>,
      bb = b as Record<string, unknown>;
    return (
      Object.keys(aa).length === Object.keys(bb).length && Object.keys(aa).every((k) => k in bb && same(aa[k], bb[k]))
    );
  };
  plan.routes = plan.routes.map((route) => {
    let offset = 0;
    for (const link of route.navigationLinks ?? []) {
      const widths = route.widths?.slice(offset, offset + link.points.length);
      if (widths?.length) link.width = Math.max(...widths);
      offset += link.points.length - 1;
    }
    const prior = previous.find((p) => p.id === route.id);
    return prior && same(route, prior) ? structuredClone(prior) : route;
  });
  return auditRoadTermini(plan);
}
