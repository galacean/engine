import type { PlanPoint, PlanPlace, PlanRoute } from "./IslandPlanModel";
import type { PlanningPort, SemanticEdit } from "./WorldPlanningContract";
import { SETTLEMENT_PROFILE as profile } from "../planning-data/SettlementProfile";
import {
  intent,
  settlementRandom,
  settlementCurve,
  settlementRoad,
  flareSettlementRoadEnd
} from "./SettlementGeometry";

/** Sample street centres and connected street cycles before placing buildings.
 * @param id Owning village identifier.
 * @param seed Stable recipe seed.
 * @param edit Normalized centre, loop, curvature and width intents.
 * @param outline Village boundary used for entrance placement.
 * @param span Metric extent used for public-space spacing.
 * @param world Transform village-local coordinates into world metres.
 * @param ground Sample ground elevation at graph endpoints.
 * @returns Optional plaza candidates, independent graph ports and continuous-width street edges.
 */
export function settlementStreetGraph(
  id: string,
  seed: number,
  edit: SemanticEdit,
  outline: PlanPoint[],
  span: number,
  world: (x: number, z: number) => PlanPoint,
  ground: (p: PlanPoint) => number
) {
  const random = (key: string) => settlementRandom(seed, id + key),
    r = profile.road,
    q = profile.village;
  const richness = intent(edit.centerRichness, random("centre-count"));
  const count = 1 + Math.min(2, Math.floor(richness * 3));
  const loopiness = intent(edit.loopiness, 0.55),
    variation = intent(edit.bend),
    widthVariation = intent(edit.widthVariation, 0.7);
  const ports: PlanningPort[] = [],
    plazas: PlanPlace[] = [],
    routes: PlanRoute[] = [];
  const nodes: { id: string; point: PlanPoint }[] = [];
  const add = (pid: string, point: PlanPoint, kind: PlanningPort["kind"] = "landing") => {
    const n = { id: pid, point };
    nodes.push(n);
    ports.push({
      id: pid,
      ownerId: id,
      position: point,
      kind,
      width: r.publicWidth,
      height: ground(point),
      surfaceId: "ground"
    });
    return n;
  };
  const connect = (a: (typeof nodes)[number], b: (typeof nodes)[number], key: string, curve?: PlanPoint[]) => {
    routes.push(
      settlementRoad(
        `${id}-street-${key}`,
        a.id,
        b.id,
        curve ?? settlementCurve(a.point, b.point, variation, seed, id + key),
        r.publicWidth,
        seed,
        widthVariation
      )
    );
  };
  const rotation = random("centres-angle") * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = rotation + (i * Math.PI * 2) / count + (random("centre-angle" + i) - 0.5) * 0.4;
    const radius = count === 1 ? span * 0.045 : span * (0.16 + random("centre-radius" + i) * 0.035);
    const p = world(Math.cos(a) * radius, Math.sin(a) * radius);
    const angle = random("plaza-angle" + i) * Math.PI * 2,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const width = q.plazaWidth * (0.75 + random("plaza-width" + i) * 0.5),
      depth = q.plazaDepth * (0.7 + random("plaza-depth" + i) * 0.6);

    const boundary = Array.from({ length: 24 }, (_, j) => {
      const t = (j * Math.PI) / 12,
        f = 1 + 0.14 * Math.sin(t * 3 + random("plaza-shape" + i) * 6);
      const x = Math.cos(t) * width * 0.5 * f;
      const z = Math.sin(t) * depth * 0.5 * f;
      return { x: p.x + x * c - z * s, z: p.z + x * s + z * c };
    });
    plazas.push({
      id: `${id}-plaza-${i}`,
      label: count === 1 ? "公共广场" : `公共广场 ${i + 1}`,
      purpose: "公共空间与景观留位",
      center: p,
      outline: boundary
    });
    // Preserve existing port IDs for saved routes. Paving can shrink or disappear
    // after packing buildings; the street junction itself remains connected.
    add(plazas[i].id, p);
  }
  // Euclidean spanning tree gives a connected shared network without a fixed radial hub.
  const centers = nodes.slice(),
    connected = new Set([0]);
  while (connected.size < count) {
    let best = { a: 0, b: 0, d: Infinity };
    for (const a of connected)
      for (let b = 0; b < count; b++)
        if (!connected.has(b)) {
          const d = Math.hypot(centers[a].point.x - centers[b].point.x, centers[a].point.z - centers[b].point.z);
          if (d < best.d) best = { a, b, d };
        }
    connect(centers[best.a], centers[best.b], `centre-${best.a}-${best.b}`);
    connected.add(best.b);
  }
  // Each selected centre can grow a cycle enclosing grass. These are geometry nodes, not public markers.
  for (let i = 0; i < count; i++)
    if (loopiness > 0 && (loopiness >= 0.999 || random("loop-keep" + i) < loopiness)) {
      const base = centers[i],
        a = rotation + (i * Math.PI * 2) / count,
        loop = q.streetLoops,
        radius =
          span * (loop.radiusToSpanMin + random("loop-size" + i) * (loop.radiusToSpanMax - loop.radiusToSpanMin)),
        aspect = loop.aspectMin + random("loop-aspect" + i) * (loop.aspectMax - loop.aspectMin),
        cx = base.point.x + Math.cos(a) * radius,
        cz = base.point.z + Math.sin(a) * radius;
      const ring = [base];
      for (let j = 1; j < loop.controlPoints; j++) {
        const t = Math.PI + (j * Math.PI * 2) / loop.controlPoints;
        const extent = 1 + (random(`loop-${i}-radius-${j}`) - 0.5) * 2 * loop.radiusVariation;
        const x = Math.cos(t) * radius * extent,
          z = Math.sin(t) * radius * aspect * extent;
        ring.push(
          add(`${id}-junction-loop-${i}-${j}`, {
            x: cx + x * Math.cos(a) - z * Math.sin(a),
            z: cz + x * Math.sin(a) + z * Math.cos(a)
          })
        );
      }
      // One periodic spline owns the loop: both sides of each node share the
      // same tangent. Junctions can branch without resetting the loop heading.
      const loopPoints: PlanPoint[] = [];
      ring.forEach((node, j) => {
        const n = ring.length,
          prev = ring[(j + n - 1) % n].point,
          next = ring[(j + 1) % n],
          after = ring[(j + 2) % n].point;
        const p = node.point,
          b = next.point,
          steps = Math.max(8, Math.ceil(Math.hypot(b.x - p.x, b.z - p.z) / r.sampleSpacing));
        const points = Array.from({ length: steps + 1 }, (_, k) => {
          const t = k / steps;
          const at = (axis: "x" | "z") =>
            0.5 *
            (2 * p[axis] +
              (-prev[axis] + b[axis]) * t +
              (2 * prev[axis] - 5 * p[axis] + 4 * b[axis] - after[axis]) * t * t +
              (-prev[axis] + 3 * p[axis] - 3 * b[axis] + after[axis]) * t * t * t);
          return k === 0 ? p : k === steps ? b : { x: at("x"), z: at("z") };
        });
        loopPoints.push(...points.slice(0, -1));
      });
      loopPoints.push(base.point);
      const road = settlementRoad(
        `${id}-street-loop-${i}`,
        base.id,
        base.id,
        loopPoints,
        r.publicWidth,
        seed,
        widthVariation
      );
      for (const node of ring.slice(1)) {
        node.point = road.points.reduce((best, p) =>
          Math.hypot(p.x - node.point.x, p.z - node.point.z) < Math.hypot(best.x - node.point.x, best.z - node.point.z)
            ? p
            : best
        );
        ports.find((p) => p.id === node.id)!.position = node.point;
      }
      routes.push(road);
    }
  const publicNodes = nodes.slice(),
    gateCount = 2 + Math.floor(random("gate-count") * 3),
    phase = random("gate-phase") * Math.PI * 2;
  for (let i = 0; i < gateCount; i++) {
    const angle = phase + (i * Math.PI * 2) / gateCount + (random("gate-angle" + i) - 0.5) * 0.35;
    const index =
      ((Math.round((angle / (Math.PI * 2)) * outline.length) % outline.length) + outline.length) % outline.length;
    const gate = add(`${id}-entrance-${i}`, outline[index], "entrance");
    const nearest = publicNodes.reduce((best, n) =>
      Math.hypot(n.point.x - gate.point.x, n.point.z - gate.point.z) <
      Math.hypot(best.point.x - gate.point.x, best.point.z - gate.point.z)
        ? n
        : best
    );
    let heading: PlanPoint | undefined;
    let receivingWidth = r.publicWidth;
    const receiving = routes.find(
      (route) =>
        route.closed &&
        route.points.some((p) => Math.hypot(p.x - nearest.point.x, p.z - nearest.point.z) < r.entryClearance)
    );
    if (receiving) {
      const k = receiving.points.reduce(
        (best, p, j) =>
          Math.hypot(p.x - nearest.point.x, p.z - nearest.point.z) <
          Math.hypot(receiving.points[best].x - nearest.point.x, receiving.points[best].z - nearest.point.z)
            ? j
            : best,
        0
      );
      const before = receiving.points[(k + receiving.points.length - 2) % (receiving.points.length - 1)],
        after = receiving.points[(k + 1) % (receiving.points.length - 1)];
      heading = { x: after.x - before.x, z: after.z - before.z };
      if (heading.x * (gate.point.x - nearest.point.x) + heading.z * (gate.point.z - nearest.point.z) < 0)
        heading = { x: -heading.x, z: -heading.z };
      receivingWidth = receiving.widths![k];
    }
    connect(
      nearest,
      gate,
      `entrance-${i}`,
      settlementCurve(nearest.point, gate.point, variation, seed, id + `entrance-${i}`, { start: heading })
    );
    if (receiving) flareSettlementRoadEnd(routes.at(-1)!, receivingWidth, true);
  }
  return { plazas, ports, routes };
}

/** Derive graph edges without cutting or rebuilding the published road surfaces.
 * @param id Village identity for internal crossing ports.
 * @param routes Complete logical roads, including door approaches.
 * @param ports Existing doors, entrances and public-space connections.
 * @param ground Terrain sampler for new crossing ports.
 * @returns Roads with internal navigation links attached.
 */
export function connectSettlementRoads(
  id: string,
  routes: PlanRoute[],
  ports: PlanningPort[],
  ground: (p: PlanPoint) => number
): PlanRoute[] {
  type Cut = { at: number; point: PlanPoint; id: string; width: number };
  const cuts = routes.map(
    (route) =>
      [
        { at: 0, point: route.points[0], id: route.from, width: route.widths![0] },
        { at: route.points.length - 1, point: route.points.at(-1)!, id: route.to, width: route.widths!.at(-1)! }
      ] as Cut[]
  );
  for (let r = 0; r < routes.length; r++) {
    const road = routes[r];
    for (const port of ports) {
      if (port.id === road.from || port.id === road.to) continue;
      for (let k = 1; k < road.points.length; k++) {
        const a = road.points[k - 1],
          b = road.points[k];
        const dx = b.x - a.x,
          dz = b.z - a.z;
        const t = Math.max(
          0,
          Math.min(1, ((port.position.x - a.x) * dx + (port.position.z - a.z) * dz) / (dx * dx + dz * dz || 1))
        );
        if (Math.hypot(port.position.x - a.x - dx * t, port.position.z - a.z - dz * t) > profile.road.entryClearance)
          continue;
        const at = k - 1 + t;
        if (!cuts[r].some((c) => Math.abs(c.at - at) < 1e-5 && c.id === port.id))
          cuts[r].push({
            at,
            point: port.position,
            id: port.id,
            width: road.widths![k - 1] + (road.widths![k] - road.widths![k - 1]) * t
          });
        break;
      }
    }
  }
  const cross = (a: PlanPoint, b: PlanPoint) => a.x * b.z - a.z * b.x;
  const subtract = (a: PlanPoint, b: PlanPoint) => ({ x: a.x - b.x, z: a.z - b.z });
  const known = new Map<string, string>();
  for (let a = 0; a < routes.length; a++)
    for (let b = a + 1; b < routes.length; b++) {
      const ra = routes[a],
        rb = routes[b];
      for (let i = 1; i < ra.points.length; i++)
        for (let j = 1; j < rb.points.length; j++) {
          const p = ra.points[i - 1],
            q = rb.points[j - 1],
            u = subtract(ra.points[i], p),
            v = subtract(rb.points[j], q),
            denom = cross(u, v);
          if (Math.abs(denom) < 1e-9) continue;
          const delta = subtract(q, p),
            t = cross(delta, v) / denom,
            w = cross(delta, u) / denom;
          if (t < 0 || t > 1 || w < 0 || w > 1) continue;
          const at = i - 1 + t,
            bt = j - 1 + w;
          // Existing connected endpoints already own their shared point.
          if ((at < 1e-5 || at > ra.points.length - 1 - 1e-5) && (bt < 1e-5 || bt > rb.points.length - 1 - 1e-5))
            continue;
          let point = { x: p.x + u.x * t, z: p.z + u.z * t };
          const nearby = ports.find((port) => Math.hypot(port.position.x - point.x, port.position.z - point.z) < 0.8);
          if (nearby) point = nearby.position;
          const key = point.x.toFixed(4) + "," + point.z.toFixed(4);
          let node = nearby?.id ?? known.get(key);
          if (!node) {
            node =
              at < 1e-5
                ? ra.from
                : at > ra.points.length - 1 - 1e-5
                  ? ra.to
                  : bt < 1e-5
                    ? rb.from
                    : bt > rb.points.length - 1 - 1e-5
                      ? rb.to
                      : `${id}-junction-cross-${known.size}`;
            known.set(key, node);
            if (!ports.some((port) => port.id === node))
              ports.push({
                id: node,
                ownerId: id,
                position: point,
                kind: "landing",
                width: profile.road.publicWidth,
                height: ground(point),
                surfaceId: "ground"
              });
          }
          for (const [index, pos, k, fraction] of [
            [a, at, i, t],
            [b, bt, j, w]
          ]) {
            if (cuts[index].some((c) => Math.abs(c.at - pos) < 1e-5 && c.id === node)) continue;
            const widths = routes[index].widths!;
            cuts[index].push({
              at: pos,
              point,
              id: node,
              width: widths[k - 1] + (widths[k] - widths[k - 1]) * fraction
            });
          }
        }
    }
  const joinedPorts = new Set<string>();
  routes.forEach((route, index) => {
    const sorted = cuts[index].sort((a, b) => a.at - b.at),
      out: NonNullable<PlanRoute["navigationLinks"]> = [];
    for (let n = 1; n < sorted.length; n++) {
      const a = sorted[n - 1],
        b = sorted[n];
      if (a.id === b.id) continue;
      if (b.at - a.at < 1e-5) {
        // Distinct semantic ports can share one physical junction. Keep their
        // graph connection even though no length of road lies between them.
        const pair = [a.id, b.id].sort().join("|");
        if (!joinedPorts.has(pair)) {
          joinedPorts.add(pair);
          out.push({ from: a.id, to: b.id, points: [a.point, b.point], width: Math.min(a.width, b.width) });
        }
        continue;
      }
      const points = [a.point],
        widths = [a.width];
      for (let k = Math.floor(a.at) + 1; k < b.at - 1e-5; k++) {
        if (
          Math.hypot(route.points[k].x - a.point.x, route.points[k].z - a.point.z) < 0.5 ||
          Math.hypot(route.points[k].x - b.point.x, route.points[k].z - b.point.z) < 0.5
        )
          continue;
        points.push(route.points[k]);
        widths.push(route.widths![k]);
      }
      points.push(b.point);
      widths.push(b.width);
      out.push({ from: a.id, to: b.id, points, width: Math.max(...widths) });
    }
    route.navigationLinks = out;
  });
  return routes;
}
