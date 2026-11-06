import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { RoadGraph } from "./RoadTopology";
import { publishRoadPath, taperRoadJoins, type RoadClearance } from "./RoadGeometry";

const length = (points: PlanPoint[]) =>
  points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.z - points[i].z), 0);
type Section = RoadGraph["sections"][number];
/** Resolve a shared corridor network, rather than retaining every independently searched connection.
 * A minimum-length backbone removes accidental lens-shaped cycles. Only the requested world loop budget
 * can restore additional circuits. Logical connections then follow this backbone to their original endpoints.
 */
export function reduceRoadNetwork(plan: IslandPlan, clear: RoadClearance): void {
  const graph = plan.roadGraph;
  if (!graph) return;
  const sections = graph.sections.map((s) => ({ ...s, owners: [] as string[] }));
  const weight = new Map(sections.map((s) => [s.id, length(s.route.points)]));
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    const p = parent.get(id);
    if (!p) return id;
    const r = root(p);
    parent.set(id, r);
    return r;
  };
  const chosen: Section[] = [],
    redundant: Section[] = [];
  for (const section of sections
    .slice()
    .sort((a, b) => weight.get(a.id)! - weight.get(b.id)! || a.id.localeCompare(b.id))) {
    const a = root(section.route.from),
      b = root(section.route.to);
    if (a === b) redundant.push(section);
    else {
      parent.set(a, b);
      chosen.push(section);
    }
  }
  const adjacency = () => {
    const result = new Map<string, Section[]>();
    for (const s of chosen) for (const n of [s.route.from, s.route.to]) result.set(n, [...(result.get(n) ?? []), s]);
    return result;
  };
  const path = (from: string, to: string, links: Map<string, Section[]>) => {
    const costs = new Map([[from, 0]]),
      previous = new Map<string, { node: string; section: Section }>(),
      open = new Set([from]);
    while (open.size) {
      let at = from,
        best = Infinity;
      for (const n of open)
        if (costs.get(n)! < best) {
          best = costs.get(n)!;
          at = n;
        }
      open.delete(at);
      if (at === to) {
        const walk: { section: Section; from: string; to: string }[] = [];
        let n = to;
        while (n !== from) {
          const p = previous.get(n)!;
          walk.unshift({ section: p.section, from: p.node, to: n });
          n = p.node;
        }
        return walk;
      }
      for (const section of links.get(at) ?? []) {
        const next = section.route.from === at ? section.route.to : section.route.from,
          cost = best + weight.get(section.id)!;
        if (cost < (costs.get(next) ?? Infinity)) {
          costs.set(next, cost);
          previous.set(next, { node: at, section });
          open.add(next);
        }
      }
    }
  };
  // A broad circuit can add a route choice; a narrow duplicate ribbon cannot.
  let loops = (plan.roadNetwork?.domains ?? []).reduce((sum, d) => sum + d.cycleRank, 0);
  const tree = adjacency();
  const circuits = redundant
    .map((section) => {
      const walk = path(section.route.to, section.route.from, tree);
      const points = [
        ...section.route.points,
        ...(walk ?? []).flatMap((w) =>
          w.section.route.from === w.from ? w.section.route.points : w.section.route.points.slice().reverse()
        )
      ];
      const area =
        Math.abs(
          points.reduce((sum, p, i) => {
            const q = points[(i + 1) % points.length];
            return sum + p.x * q.z - q.x * p.z;
          }, 0)
        ) / 2;
      const perimeter = weight.get(section.id)! + (walk ?? []).reduce((sum, w) => sum + weight.get(w.section.id)!, 0);
      return { section, area, open: area > perimeter * section.route.width };
    })
    .filter((c) => c.open)
    .sort((a, b) => b.area - a.area || a.section.id.localeCompare(b.section.id));
  for (const c of circuits) if (loops-- > 0) chosen.push(c.section);
  const protectedNodes = new Set(plan.routes.flatMap((r) => [r.from, r.to]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [node, edges] of adjacency())
      if (edges.length === 1 && !protectedNodes.has(node)) {
        const index = chosen.indexOf(edges[0]);
        if (index >= 0) {
          chosen.splice(index, 1);
          changed = true;
        }
      }
  }
  const links = adjacency();
  const endpoint = (point: PlanPoint, fallback: string) =>
    graph.nodes.find((n) => Math.hypot(n.position.x - point.x, n.position.z - point.z) < 1e-3)?.id ?? fallback;
  const walks = new Map(
    plan.routes.map((route) => [
      route.id,
      path(endpoint(route.points[0], route.from), endpoint(route.points.at(-1)!, route.to), links)
    ])
  );
  if ([...walks.values()].some((w) => !w)) return;
  for (const route of plan.routes) for (const step of walks.get(route.id) ?? []) step.section.owners.push(route.id);
  taperRoadJoins(
    chosen.map((section) => section.route),
    clear
  );
  plan.routes = plan.routes.map((route) => {
    const walk = walks.get(route.id);
    if (!walk?.length) return route;
    const navigationLinks = walk.map((w) => ({
      from: w.from,
      to: w.to,
      width: w.section.route.width,
      points: w.section.route.from === w.from ? w.section.route.points : w.section.route.points.slice().reverse()
    }));
    navigationLinks[0].from = route.from;
    navigationLinks.at(-1)!.to = route.to;
    const points = navigationLinks.flatMap((link, i) => (i ? link.points.slice(1) : link.points));
    const widths = walk.flatMap((w, i) =>
      (w.section.route.from === w.from ? w.section.route.widths! : w.section.route.widths!.slice().reverse()).slice(
        i ? 1 : 0
      )
    );
    return {
      ...publishRoadPath({ ...route, widths }, points, route),
      navigationLinks
    };
  });
  graph.sections = chosen
    .filter((s) => s.owners.length)
    .map((s) => ({
      ...s,
      owners: [...new Set(s.owners)].sort(),
      route: s.route
    }));
  const used = new Map<string, number>();
  for (const s of graph.sections) for (const n of [s.route.from, s.route.to]) used.set(n, (used.get(n) ?? 0) + 1);
  graph.nodes = graph.nodes.filter((n) => used.has(n.id)).map((n) => ({ ...n, degree: used.get(n.id)! }));
  if (plan.planning)
    plan.planning.ports = plan.planning.ports.filter((p) => !p.id.startsWith("road-junction:") || used.has(p.id));
}
