import type { IslandPlan, PlanPoint, PlanRoute } from "../../semantic-study/IslandPlanModel";
import { sampleRoadSpline } from "./RoadSpline";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { compileRoadPath, publishRoadPath, taperRoadJoins, type RoadClearance } from "./RoadGeometry";

type Section = NonNullable<IslandPlan["roadGraph"]>["sections"][number];
const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;

/** Index physical edges, never expanded logical journeys. Updates replace one edge.
 * A curve may meet another edge only at an already declared common endpoint.
 * This preserves connectivity without discovering a new graph from curve samples.
 */
class RoadEdgeIndex {
  private readonly cells = new Map<string, Set<Section>>();
  private readonly occupied = new Map<Section, string[]>();
  constructor(sections: readonly Section[]) {
    for (const section of sections) this.update(section);
  }
  private buckets(points: readonly PlanPoint[]): string[] {
    const keys = new Set<string>();
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      for (let z = Math.floor(Math.min(a.z, b.z) / 16); z <= Math.floor(Math.max(a.z, b.z) / 16); z++)
        for (let x = Math.floor(Math.min(a.x, b.x) / 16); x <= Math.floor(Math.max(a.x, b.x) / 16); x++)
          keys.add(`${x}/${z}`);
    }
    return [...keys];
  }
  update(section: Section): void {
    for (const key of this.occupied.get(section) ?? []) this.cells.get(key)!.delete(section);
    const keys = this.buckets(section.route.points);
    this.occupied.set(section, keys);
    for (const key of keys) {
      let cell = this.cells.get(key);
      if (!cell) this.cells.set(key, (cell = new Set()));
      cell.add(section);
    }
  }
  clear(section: Section, points: PlanPoint[]): boolean {
    const neighbors = new Set<Section>();
    for (const key of this.buckets(points))
      for (const other of this.cells.get(key) ?? []) if (other !== section) neighbors.add(other);
    for (const other of neighbors) {
      const path = other.route.points;
      const shared: PlanPoint[] = [];
      for (const [id, point] of [
        [section.route.from, points[0]],
        [section.route.to, points.at(-1)!]
      ] as const)
        if (id === other.route.from || id === other.route.to) shared.push(point);
      for (let i = 1; i < points.length; i++)
        for (let j = 1; j < path.length; j++) {
          const a = points[i - 1],
            b = points[i],
            c = path[j - 1],
            d = path[j];
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
          const den = cross(ux, uz, vx, vz);
          if (Math.abs(den) < 1e-9) {
            if (Math.abs(cross(c.x - a.x, c.z - a.z, ux, uz)) > 1e-6) continue;
            const length = ux * ux + uz * uz;
            if (!length) continue;
            const t = ((c.x - a.x) * ux + (c.z - a.z) * uz) / length;
            const u = ((d.x - a.x) * ux + (d.z - a.z) * uz) / length;
            if (Math.min(1, Math.max(t, u)) - Math.max(0, Math.min(t, u)) > 1e-6) return false;
            continue;
          }
          const t = cross(c.x - a.x, c.z - a.z, vx, vz) / den;
          const u = cross(c.x - a.x, c.z - a.z, ux, uz) / den;
          if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) continue;
          const p = { x: a.x + ux * t, z: a.z + uz * t };
          if (!shared.some((endpoint) => distance(endpoint, p) < 1e-4)) return false;
        }
    }
    return true;
  }
}

// A bounded geometry cache reuses unchanged control-point edges. Every hit still
// passes current full-width obstacles and neighboring-edge checks before publication.
let previous = new Map<string, PlanRoute>();

/** Project the accepted connection graph into one spline per physical edge.
 * Bank keys and graph endpoints are fixed; failed artistic bends reduce handles
 * locally. Rendering/navigation consume this projection, never re-infer topology.
 */
export function compileRoadGraphSplines(plan: IslandPlan, clear: RoadClearance): void {
  const graph = plan.roadGraph;
  if (!graph?.sections.length) return;
  const index = new RoadEdgeIndex(graph.sections);
  const water = (plan.waters ?? []).map((w) => createPlanningRingQuery(w.outline));
  const waterKey = JSON.stringify((plan.waters ?? []).map((w) => w.outline));
  const networks = new Map(plan.roadNetwork?.edges.map((edge) => [edge.routeId, edge]));
  const obstaclesKey = JSON.stringify([plan.land, plan.islands, plan.buildings, plan.rocks, plan.plazas]);
  // Key every potentially interacting control corridor before projection mutates
  // the graph. Cache hits must not retain a formerly constrained bend after an
  // obstacle or neighboring edge was edited.
  const inputs = graph.sections.map((section) => {
    const points = section.route.points;
    const reach = Math.max(section.route.width * 4, ...points.slice(1).map((p, i) => distance(p, points[i])));
    return {
      section,
      minX: Math.min(...points.map((p) => p.x)) - reach,
      maxX: Math.max(...points.map((p) => p.x)) + reach,
      minZ: Math.min(...points.map((p) => p.z)) - reach,
      maxZ: Math.max(...points.map((p) => p.z)) + reach,
      key: JSON.stringify([
        section.id,
        points,
        section.route.widths,
        section.owners.map((owner) => networks.get(owner)?.sBend)
      ])
    };
  });
  const contexts = new Map(
    inputs.map((input) => [
      input.section,
      inputs
        .filter(
          (other) =>
            other !== input &&
            other.maxX >= input.minX &&
            other.minX <= input.maxX &&
            other.maxZ >= input.minZ &&
            other.minZ <= input.maxZ
        )
        .map((other) => other.key)
    ])
  );
  const next = new Map<string, PlanRoute>();
  const old = new Map(graph.sections.map((section) => [section.id, section.route]));
  const directed = new Map<string, Section[]>();
  for (const section of graph.sections)
    for (const key of [section.route.from + "|" + section.route.to, section.route.to + "|" + section.route.from])
      directed.set(key, [...(directed.get(key) ?? []), section]);
  for (const section of graph.sections) {
    const route = section.route;
    const network = section.owners.map((owner) => networks.get(owner)).find(Boolean);
    const signature = JSON.stringify([
      section.id,
      route.from,
      route.to,
      route.width,
      route.points,
      route.widths,
      network?.sBend,
      waterKey,
      obstaclesKey,
      contexts.get(section)
    ]);
    const wetSpans = water.map((ring) => ({
      ring,
      spans: route.points.slice(1).flatMap((b, i) => {
        const a = route.points[i];
        return ring.inside(a) || ring.inside(b) || ring.touchesSegment(a, b, 0) ? [{ a, b }] : [];
      })
    }));
    const preservesBridges = (points: PlanPoint[]) =>
      wetSpans.every(({ ring, spans }) =>
        points.slice(1).every((b, i) => {
          const a = points[i];
          if (!ring.inside(a) && !ring.inside(b) && !ring.touchesSegment(a, b, 0)) return true;
          return spans.some((span) => {
            const dx = span.b.x - span.a.x,
              dz = span.b.z - span.a.z,
              length = Math.hypot(dx, dz);
            return (
              length > 0 && [a, b].every((p) => Math.abs(cross(p.x - span.a.x, p.z - span.a.z, dx, dz)) / length < 1e-4)
            );
          });
        })
      );
    const accept: RoadClearance = (points, outline) =>
      preservesBridges(points) && clear(points, outline) && index.clear(section, points);
    const cached = previous.get(signature);
    let projected = cached && accept(cached.points, cached.outline!) ? { ...cached, id: route.id } : undefined;
    if (!projected) {
      // Width is an edge/end condition. Inherited per-sample widths must not
      // turn every old pavement sample into an immutable spline control point.
      // Simplification still validates the complete requested-width corridor.
      const keys = route.points.map((point) => ({ ...point }));
      projected = compileRoadPath(route, keys, accept, network ? 12 : 0.5, 1, {
        sBend: network?.sBend ?? 0,
        startWidth: route.widths?.[0],
        endWidth: route.widths?.at(-1),
        straight: (a, b) => water.some((ring) => ring.inside(a) || ring.inside(b) || ring.touchesSegment(a, b, 0))
      });
      // Sparse input is an already connected corridor. A rejected aesthetic curve
      // keeps that exact corridor only after the same physical validation.
      if (!projected && accept(route.points, route.outline!)) {
        const keypoints = route.points.map((position, i) => ({ position, width: route.widths?.[i] ?? route.width }));
        const samples = sampleRoadSpline(keypoints, { tension: 0 });
        const fallback = publishRoadPath({ ...route, keypoints, widths: samples.widths }, samples.points);
        if (accept(fallback.points, fallback.outline!)) projected = fallback;
      }
      if (!projected) throw new Error(`Road graph edge has no valid full-width projection: ${section.id}`);
    }
    section.route = projected;
    next.set(signature, projected);
    index.update(section);
  }
  taperRoadJoins(
    graph.sections.map((section) => section.route),
    clear
  );
  // Logical journeys keep their selected walk. Replacing edge geometry does not
  // require another shortest-path solve, intersection sweep or network reduction.
  plan.routes = plan.routes.map((route) => {
    const links: NonNullable<PlanRoute["navigationLinks"]> = [];
    const widths: number[] = [];
    for (const link of route.navigationLinks ?? []) {
      const candidates = directed.get(link.from + "|" + link.to) ?? [];
      const section = candidates.find(
        (section) =>
          section.owners.includes(route.id) &&
          (() => {
            const path = old.get(section.id)!.points;
            return distance(link.points[0], path[0]) < 1e-4 || distance(link.points[0], path.at(-1)!) < 1e-4;
          })()
      );
      if (!section) {
        links.push(link);
        widths.push(...link.points.slice(links.length > 1 ? 1 : 0).map(() => link.width));
        continue;
      }
      const edge = section.route,
        forward = edge.from === link.from;
      const points = forward ? edge.points : edge.points.slice().reverse();
      const w = forward ? edge.widths! : edge.widths!.slice().reverse();
      widths.push(...w.slice(links.length ? 1 : 0));
      links.push({ from: link.from, to: link.to, points, width: edge.width });
    }
    if (!links.length) return route;
    const points = links.flatMap((link, i) => link.points.slice(i ? 1 : 0));
    return { ...publishRoadPath({ ...route, keypoints: undefined, widths }, points), navigationLinks: links };
  });
  previous = next;
}
