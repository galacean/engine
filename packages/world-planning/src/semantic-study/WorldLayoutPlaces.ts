import { PLANNING_REFERENCE, referenceBuildingSize } from "../planning-data/PlanningReference";
import { WorldPlanningWaterQuery } from "./WorldPlanningWaterQuery";
import { editFootprints, activePlacement } from "./WorldEditPlacement";
import { segmentGap } from "./WorldPlanningGeometry";
import { growRegion, compileRegion } from "./WorldShapeGrowth";
import { routeIntersectsRock, envelope } from "./IslandPlanAtoms";
import { pointInPolygon } from "../geometry/V2Geometry";
import type { IslandPlan, PlanPoint, PlanRegion } from "./IslandPlanModel";
import { PLANNING_TRAVERSAL, planningCorridor, planningSegmentInside } from "./WorldLayoutRoutes";
import { createPlanningGroundSampler, createPlanningRingQuery } from "./WorldPlanningTerrain";
import type { WorldLayoutContext } from "./WorldLayoutPlanner";

const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
function bounds(r: PlanPoint[]) {
  return {
    x0: Math.min(...r.map((p) => p.x)),
    x1: Math.max(...r.map((p) => p.x)),
    z0: Math.min(...r.map((p) => p.z)),
    z1: Math.max(...r.map((p) => p.z))
  };
}
function crosses(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint): boolean {
  const side = (a: PlanPoint, b: PlanPoint, c: PlanPoint) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}
function overlaps(a: PlanPoint[], b: PlanPoint[]): boolean {
  const aa = bounds(a),
    bb = bounds(b);
  if (aa.x1 < bb.x0 || bb.x1 < aa.x0 || aa.z1 < bb.z0 || bb.z1 < aa.z0) return false;
  if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return true;
  return a.some((p, i) => b.some((q, j) => crosses(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])));
}
/** Internal area-navigation witness. This geometry is not a visible road. */
export function findVillageAreaPath(
  plan: IslandPlan,
  region: PlanRegion,
  a: PlanPoint,
  b: PlanPoint,
  width: number,
  ground = createPlanningGroundSampler(plan)
): PlanPoint[] | undefined {
  const ring = createPlanningRingQuery(region.navigationArea ?? region.outline),
    box = bounds(region.navigationArea ?? region.outline),
    rocks = plan.rocks.filter((rock) => {
      const radius = Math.hypot(rock.width, rock.depth) / 2;
      return (
        rock.center.x + radius >= box.x0 &&
        rock.center.x - radius <= box.x1 &&
        rock.center.z + radius >= box.z0 &&
        rock.center.z - radius <= box.z1
      );
    });
  const solids = [
    ...rocks,
    ...plan.buildings
      .filter((building) => building.regionId === region.id)
      .map((building) => ({ ...building, groupId: building.regionId, role: "terrace" as const, obb: building.outline }))
  ];
  const waters = plan.waters
    .filter((water) => {
      const b = bounds(water.outline);
      return b.x1 >= box.x0 && b.x0 <= box.x1 && b.z1 >= box.z0 && b.z0 <= box.z1;
    })
    .map((water) => createPlanningRingQuery(water.outline));
  const valid = (a: PlanPoint, b: PlanPoint) => {
    if (waters.some((water) => water.touchesSegment(a, b, width / 2))) return false;
    if (solids.some((building) => routeIntersectsRock(a, b, building, width / 2 + 0.5))) return false;
    const length = distance(a, b),
      pad = Math.min(0.49, (width + 1) / (length || 1));
    // A boundary gateway owns the final seam; interior area must carry the full width.
    const aa =
      ring.distance(a, width / 2 + 0.01) < width / 2 ? { x: a.x + (b.x - a.x) * pad, z: a.z + (b.z - a.z) * pad } : a;
    const bb =
      ring.distance(b, width / 2 + 0.01) < width / 2 ? { x: b.x + (a.x - b.x) * pad, z: b.z + (a.z - b.z) * pad } : b;
    if (!ring.inside(a) || !ring.inside(b) || !ring.containsSegment(aa, bb, width / 2)) return false;
    // Geometric reachability alone can choose a steep shoreline approach. Check
    // candidate edges on the actual ground so area navigation can take a detour.
    if (plan.planning?.auditMode === "paused") return true;
    const count = Math.max(1, Math.ceil(length / 4));
    let previous = ground(a);
    for (let i = 1; i <= count; i++) {
      const height = ground({ x: a.x + ((b.x - a.x) * i) / count, z: a.z + ((b.z - a.z) * i) / count });
      if (Math.abs(height - previous) / (length / count || 1) > PLANNING_TRAVERSAL.maxSlope) return false;
      previous = height;
    }
    return true;
  };
  if (valid(a, b)) return [a, b];
  const nodes = [
    a,
    b,
    ...solids.flatMap((building) =>
      envelope(building.center, building.width + width + 3, building.depth + width + 3, building.yaw)
    ),
    ...(plan.shapeRecipes
      ?.find((recipe) => recipe.id === region.id)
      ?.blocks.map((block) => ({ x: block.x, z: block.z })) ?? [])
  ]
    .filter(
      (p, i) =>
        i < 2 ||
        (ring.containsSegment(p, p, width / 2) &&
          !solids.some((building) => routeIntersectsRock(p, p, building, width / 2 + 0.5)))
    )
    .slice(0, 128);
  const parent = new Int32Array(nodes.length).fill(-1),
    queue = [0];
  parent[0] = 0;
  for (let cursor = 0; cursor < queue.length; cursor++)
    for (let j = 1; j < nodes.length; j++)
      if (parent[j] < 0 && valid(nodes[queue[cursor]], nodes[j])) {
        parent[j] = queue[cursor];
        if (j === 1) {
          const points = [b];
          let at = parent[1];
          while (at !== 0) {
            points.push(nodes[at]);
            at = parent[at];
          }
          points.push(a);
          return points.reverse();
        }
        queue.push(j);
      }
}
/** Refresh internal navigation witnesses against final terrain and current obstacles.
 * Existing destinations and relations are retained; an unavailable path remains
 * an explicit independent-audit failure rather than dropping the obligation.
 */
export function finalizeVillageAreaPaths(plan: IslandPlan, owners?: ReadonlySet<string>): void {
  const ground = createPlanningGroundSampler(plan);
  const ports = new Map(plan.planning?.ports.map((port) => [port.id, port]) ?? []);
  for (const region of plan.regions.filter(
    (region) => region.kind === "village" && (!owners || owners.has(region.id))
  )) {
    for (const link of region.navigationLinks ?? []) {
      const from = ports.get(link.from),
        to = ports.get(link.to);
      if (!from || !to) continue;
      const points = findVillageAreaPath(plan, region, from.position, to.position, link.width, ground);
      if (points) link.points = points;
    }
  }
}
/** Place irregular village regions and minimum-distance building candidates within their true boundaries.
 * @param c Shared generation transaction; successful sites reserve their approach corridor.
 */
export function generateWorldPlaces(c: WorldLayoutContext): void {
  const collisionQuery = new WorldPlanningWaterQuery(),
    overlaps = (a: PlanPoint[], b: PlanPoint[]) => collisionQuery.overlap(a, b);
  const rockObstacles = c.plan.rocks.map((r) =>
    envelope(
      r.center,
      r.width + c.parameters.roadWidth * PLANNING_REFERENCE.spacing.rockSetbackRoadWidths,
      r.depth + c.parameters.roadWidth * PLANNING_REFERENCE.spacing.rockSetbackRoadWidths,
      r.yaw
    )
  );
  const q = c.parameters,
    landBounds = bounds(c.plan.land),
    ground = createPlanningGroundSampler(c.plan),
    landQuery = createPlanningRingQuery(c.plan.land);
  const sites = Array.from({ length: 240 }, (_, i) => ({
    x: landBounds.x0 + c.random(`place-site-x-${i}`) * (landBounds.x1 - landBounds.x0),
    z: landBounds.z0 + c.random(`place-site-z-${i}`) * (landBounds.z1 - landBounds.z0)
  })).filter((p) => pointInPolygon(p, c.plan.land));
  for (const i of Array.from({ length: q.villages }, (_, i) => i).sort(
    (a, b) =>
      Number(!!c.edits[b === q.villages ? "teleport-0" : `village-${b}`]?.placement) -
      Number(!!c.edits[a === q.villages ? "teleport-0" : `village-${a}`]?.placement)
  )) {
    const teleport = i === q.villages,
      kind = teleport ? ("teleport" as const) : ("village" as const);
    const id = teleport ? "teleport-0" : `village-${i}`,
      label = teleport ? "传送点" : `村落 ${i + 1}`;
    const baseSize =
        (teleport ? 110 : q.villageSize) *
        (PLANNING_REFERENCE.village.sizeFactor.min +
          c.random(`${id}-scale`) * PLANNING_REFERENCE.village.sizeFactor.span),
      baseDensity =
        PLANNING_REFERENCE.village.density.min + c.random(`${id}-density`) * PLANNING_REFERENCE.village.density.span;
    const requested = baseSize * Math.sqrt(c.edits[id]?.size ?? 1);
    const prototype = growRegion({
      id,
      center: { x: 0, z: 0 },
      width: requested * (1.15 + c.random(`${id}-breadth`) * 0.6),
      length: requested * (1.15 + c.random(`${id}-length`) * 0.6),
      angle: c.random(`${id}-angle`) * Math.PI * 2,
      count: q.complexity,
      contourDetail: c.parameters.contourDetail,
      random: c.random
    });
    prototype.label = label;
    if (c.plan.planning && !c.plan.planning.requiredIds.includes(id)) c.plan.planning.requiredIds.push(id);
    const base = compileRegion(prototype),
      ordered = activePlacement(c.edits, id)
        ? [c.edits[id].placement!.origin]
        : [...(c.edits[id]?.placement ? [c.edits[id].placement!.origin] : []), ...sites].sort(
            (a, b) => c.random(`${id}-${a.x}`) - c.random(`${id}-${b.x}`)
          );
    const activitySeats = [{ x: 0, z: 0 }, ...prototype.blocks.map((b) => ({ x: b.x, z: b.z }))]
      .filter((p) => pointInPolygon(p, base))
      .map((p) => ({
        p,
        radius: Math.min(...base.map((a, j) => segmentGap(p, a, base[(j + 1) % base.length]))) / Math.SQRT2
      }))
      .sort((a, b) => b.radius - a.radius);
    let chosen:
      | { p: PlanPoint; outline: PlanPoint[]; factor: number; activity: PlanPoint; activityRadius: number }
      | undefined;
    for (const factor of [1, 0.8, 0.6, 0.4]) {
      for (const p of ordered) {
        if (!c.plan.planning && distance(p, c.plan.spawn) < 110 + requested * factor * 0.5) continue;
        const outline = base.map((v) => ({ x: p.x + v.x * factor, z: p.z + v.z * factor }));
        const seat = activitySeats[0];
        if (!seat) continue;
        const activityRadius = Math.min(12, requested * factor * 0.1, seat.radius * factor * 0.95);
        if (
          activityRadius <
          Math.max(
            PLANNING_REFERENCE.village.internalRoadMinWidthM,
            q.roadWidth * PLANNING_REFERENCE.village.internalRoadPerRoadWidth
          )
        )
          continue;
        const activity = { x: p.x + seat.p.x * factor, z: p.z + seat.p.z * factor };
        if (c.plan.structures?.some((s) => overlaps(outline, s.floor))) continue;
        if (editFootprints(c.edits, id).some((r) => overlaps(outline, r))) continue;
        if (
          !outline.every((p, i) => landQuery.containsSegment(p, outline[(i + 1) % outline.length], 0)) ||
          c.plan.waters.some((w) => overlaps(outline, w.outline)) ||
          rockObstacles.some((r) => overlaps(outline, r))
        )
          continue;
        if (c.plan.regions.some((r) => (r.kind === "village" || r.kind === "teleport") && overlaps(outline, r.outline)))
          continue;
        chosen = { p, outline, factor, activity, activityRadius };
        break;
      }
      if (chosen) break;
    }
    if (!chosen) {
      c.notes.push(`${label}暂无可用占地`);
      continue;
    }
    const { p: origin, outline, factor } = chosen,
      p = chosen.activity,
      size = requested * factor,
      regionQuery = createPlanningRingQuery(outline);
    const recipe = {
      ...prototype,
      rounding: prototype.rounding * factor,
      blocks: prototype.blocks.map((b) => ({
        ...b,
        x: origin.x + b.x * factor,
        z: origin.z + b.z * factor,
        width: b.width * factor,
        length: b.length * factor
      }))
    };
    c.plan.shapeRecipes!.push(recipe);
    const region: PlanRegion = {
      id,
      label: recipe.label,
      kind,
      outline,
      ...(c.plan.planning
        ? {
            surface: "road" as const,
            navigationArea: outline,
            navigationWidth: Math.max(
              PLANNING_REFERENCE.village.internalRoadMinWidthM,
              q.roadWidth * PLANNING_REFERENCE.village.internalRoadPerRoadWidth
            ),
            navigationLinks: []
          }
        : {})
    };
    c.plan.regions.push(region);
    if (!c.plan.planning) c.reservations.push({ a: c.plan.spawn, b: p, width: q.roadWidth + 32 });
    const planning = c.plan.planning,
      internalWidth = Math.max(
        PLANNING_REFERENCE.village.internalRoadMinWidthM,
        q.roadWidth * PLANNING_REFERENCE.village.internalRoadPerRoadWidth
      ),
      activityRadius = chosen.activityRadius;
    let entrance = p;
    if (planning) {
      // A bounded set of true boundary candidates, independent of the future spawn.
      entrance = outline
        .map((a, j) => {
          const b = outline[(j + 1) % outline.length],
            dx = b.x - a.x,
            dz = b.z - a.z,
            t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
          return { x: a.x + t * dx, z: a.z + t * dz };
        })
        .reduce((best, v) => (distance(v, p) < distance(best, p) ? v : best), outline[0]);
      const activityId = `${id}-activity`,
        entranceId = `${id}-entrance`;
      const activity = envelope(p, activityRadius * 2, activityRadius * 2, 0);
      c.plan.places.push(
        { id: activityId, label: `${label}活动区`, purpose: "内部通路汇集与安全落脚", center: p, outline: activity },
        { id: entranceId, label: `${label}入口`, purpose: "对外连接端口", center: entrance, outline: [] }
      );
      if (!planning.requiredIds.includes(id)) planning.requiredIds.push(id);
      planning.modules.push({
        id,
        kind,
        outline,
        dependencies: ["land-main"],
        requested: {
          size: c.edits[id]?.size ?? 1,
          density: teleport ? 1 : (c.edits[id]?.density ?? baseDensity),
          height: c.edits[id]?.height ?? 1
        },
        resolved: { originX: origin.x, originZ: origin.z, size, baseSize, buildings: 0 }
      });
      planning.ports.push(
        ...[
          { id: activityId, position: p, kind: "landing" as const },
          { id: entranceId, position: entrance, kind: "entrance" as const }
        ].map((port) => ({
          ...port,
          ownerId: id,
          height: ground(port.position),
          width: port.kind === "entrance" ? q.roadWidth * 1.5 : internalWidth,
          surfaceId: "ground"
        }))
      );
      planning.reservations.push({
        id: `${id}-activity-space`,
        ownerId: id,
        kind: "activity",
        outline: activity,
        relatedIds: [activityId]
      });
      region.navigationLinks!.push({ from: activityId, to: entranceId, points: [p, entrance], width: internalWidth });
      planning.relations.push({
        id: `${id}-internal-entry`,
        kind: "connects",
        owners: [id],
        ports: [activityId, entranceId],
        required: true,
        network: "supported"
      });
      for (let direction = 0; direction < (teleport ? 2 : 4); direction++) {
        const dx = Math.cos((direction * Math.PI) / 2),
          dz = Math.sin((direction * Math.PI) / 2);
        let radius = Infinity;
        for (let j = 0; j < outline.length; j++) {
          const a = outline[j],
            b = outline[(j + 1) % outline.length],
            ex = b.x - a.x,
            ez = b.z - a.z,
            den = dx * ez - dz * ex;
          if (Math.abs(den) < 1e-8) continue;
          const t = ((a.x - p.x) * ez - (a.z - p.z) * ex) / den,
            u = ((a.x - p.x) * dz - (a.z - p.z) * dx) / den;
          if (t > 0 && u >= 0 && u <= 1) radius = Math.min(radius, t);
        }
        if (!Number.isFinite(radius)) continue;
        const position = { x: p.x + dx * radius, z: p.z + dz * radius };
        if (
          planning.ports.some(
            (port) =>
              port.ownerId === id && port.kind === "entrance" && distance(port.position, position) < internalWidth * 3
          )
        )
          continue;
        const points = findVillageAreaPath(c.plan, region, p, position, internalWidth, ground);
        if (!points) continue;
        const portId = `${id}-entrance-${direction + 1}`;
        planning.ports.push({
          id: portId,
          ownerId: id,
          position,
          height: ground(position),
          width: q.roadWidth * 1.5,
          kind: "entrance",
          surfaceId: "ground"
        });
        c.plan.places.push({
          id: portId,
          label: `${label}入口`,
          purpose: "可选对外接入点",
          center: position,
          outline: []
        });
        region.navigationLinks!.push({ from: activityId, to: portId, points, width: internalWidth });
        planning.relations.push({
          id: `${portId}-area`,
          kind: "connects",
          owners: [id],
          ports: [activityId, portId],
          required: true,
          network: "supported"
        });
      }
    }
    if (factor < 1) c.notes.push(`${label}占地协调为 ${Math.round(size)} 米`);
    const box = bounds(outline),
      placed: { center: PlanPoint; radius: number }[] = [];
    // Rejection sampling enforces both true-polygon containment and object spacing, with a fixed budget.
    const area =
      Math.abs(
        outline.reduce((sum, a, j) => {
          const b = outline[(j + 1) % outline.length];
          return sum + a.x * b.z - b.x * a.z;
        }, 0)
      ) / 2;
    const typicalBuilding = Math.min(
        PLANNING_REFERENCE.building.maxBaseWidthM,
        size * PLANNING_REFERENCE.building.widthPerVillageSize
      ),
      availableArea = Math.max(0, area - activityRadius * activityRadius * 4 - distance(p, entrance) * internalWidth);
    // First resolve physical capacity with the same 640 candidate budget. Density
    // chooses a prefix of that feasible packing, rather than requesting a fixed count.
    const capacity = teleport
      ? 1
      : planning
        ? Math.max(
            1,
            Math.min(
              128,
              Math.floor(
                availableArea /
                  Math.pow(
                    typicalBuilding +
                      internalWidth +
                      Math.max(
                        PLANNING_REFERENCE.spacing.buildingClearanceMinM,
                        size * PLANNING_REFERENCE.spacing.buildingClearancePerVillageSize
                      ),
                    2
                  )
              )
            )
          )
        : q.buildings;
    for (let attempt = 0; attempt < 640 && placed.length < capacity; attempt++) {
      const center = {
        x: box.x0 + c.random(`${id}-building-x-${attempt}`) * (box.x1 - box.x0),
        z: box.z0 + c.random(`${id}-building-z-${attempt}`) * (box.z1 - box.z0)
      };
      const { width, depth } = referenceBuildingSize(
          size,
          c.random(`${id}-building-width-${attempt}`),
          c.random(`${id}-building-depth-${attempt}`),
          0
        ),
        yaw = c.random(`${id}-building-angle-${attempt}`) * Math.PI * 2;
      const radius = Math.hypot(width, depth) / 2;
      if (
        placed.some(
          (b) =>
            distance(b.center, center) <
            b.radius +
              radius +
              Math.max(
                PLANNING_REFERENCE.spacing.buildingClearanceMinM,
                size * PLANNING_REFERENCE.spacing.buildingClearancePerVillageSize
              )
        )
      )
        continue;
      const footprint = envelope(center, width, depth, yaw);
      if (!footprint.every((p, i) => regionQuery.containsSegment(p, footprint[(i + 1) % footprint.length], 0)))
        continue;
      let door: PlanPoint | undefined, doorPath: PlanPoint[] | undefined;
      if (planning) {
        if (distance(center, p) < radius + activityRadius + internalWidth) continue;
        const candidate = {
          id: "candidate",
          groupId: id,
          role: "terrace" as const,
          center,
          width,
          depth,
          yaw,
          height: 10,
          outline: footprint,
          obb: footprint
        };
        if (
          region.navigationLinks!.some((link) =>
            link.points.some(
              (a, j) => j > 0 && routeIntersectsRock(link.points[j - 1], a, candidate, link.width / 2 + 1)
            )
          )
        )
          continue;
        // Four face landings: choose an outward door with a straight supported approach.
        const faces = [
          { x: width / 2 + internalWidth, z: 0 },
          { x: -width / 2 - internalWidth, z: 0 },
          { x: 0, z: depth / 2 + internalWidth },
          { x: 0, z: -depth / 2 - internalWidth }
        ];
        for (const f of faces) {
          const d = {
            x: center.x + f.x * Math.cos(yaw) - f.z * Math.sin(yaw),
            z: center.z + f.x * Math.sin(yaw) + f.z * Math.cos(yaw)
          };
          if (!planningSegmentInside(d, d, outline, internalWidth / 2)) continue;
          const provisional = { ...candidate, regionId: id };
          c.plan.buildings.push(provisional);
          const possible = findVillageAreaPath(c.plan, region, p, d, internalWidth, ground);
          c.plan.buildings.pop();
          if (!possible) continue;
          door = d;
          doorPath = possible;
          break;
        }
        if (!door) continue;
      }
      const index = placed.length;
      placed.push({ center, radius });
      if (planning && door) {
        const buildingId = `${id}-building-${index}`,
          doorId = `${buildingId}-door`,
          routeId = `${buildingId}-path`;
        planning.ports.push({
          id: doorId,
          ownerId: buildingId,
          kind: "landing",
          position: door,
          height: ground(door),
          width: internalWidth,
          surfaceId: "ground"
        });
        region.navigationLinks!.push({ from: `${id}-activity`, to: doorId, points: doorPath!, width: internalWidth });
        planning.relations.push({
          id: routeId,
          kind: "connects",
          owners: [id, buildingId],
          ports: [`${id}-activity`, doorId],
          required: true,
          network: "supported"
        });
      }
      c.plan.buildings.push({
        id: `${id}-building-${index}`,
        regionId: id,
        center,
        width,
        depth,
        yaw,
        height: teleport
          ? (55 + c.random(`${id}-tower-height`) * 65) * (c.edits[id]?.height ?? 1)
          : referenceBuildingSize(size, 0, 0, c.random(`${id}-building-height-${index}`)).height,
        outline: footprint
      });
    }
    if (planning) {
      const feasibleCapacity = placed.length,
        density = teleport ? 1 : Math.max(0, Math.min(1, c.edits[id]?.density ?? baseDensity)),
        retained = Math.round(feasibleCapacity * density);
      if (!teleport) {
        const owned = new Set(c.plan.buildings.filter((b) => b.regionId === id).map((b) => b.id));
        region.buildingCapacity = structuredClone({
          buildings: c.plan.buildings.filter((b) => owned.has(b.id)),
          ports: planning.ports.filter((port) => owned.has(port.ownerId)),
          relations: planning.relations.filter((relation) => relation.owners.some((owner) => owned.has(owner))),
          links: region.navigationLinks!.filter((link) => owned.has(link.to.replace(/-door$/, "")))
        });
      }
      const removed = new Set(
        c.plan.buildings
          .filter((b) => b.regionId === id)
          .slice(retained)
          .map((b) => b.id)
      );
      c.plan.buildings = c.plan.buildings.filter((b) => !removed.has(b.id));
      c.plan.routes = c.plan.routes.filter((r) => ![...removed].some((building) => r.id === `${building}-path`));
      region.navigationLinks = region.navigationLinks!.filter(
        (link) => ![...removed].some((building) => link.to === `${building}-door`)
      );
      planning.ports = planning.ports.filter((port) => !removed.has(port.ownerId));
      planning.relations = planning.relations.filter(
        (relation) => !relation.owners.some((owner) => removed.has(owner))
      );
      planning.modules.find((m) => m.id === id)!.resolved = {
        originX: origin.x,
        originZ: origin.z,
        size,
        area,
        baseSize,
        height: Math.max(0, ...c.plan.buildings.filter((b) => b.regionId === id).map((b) => b.height)),
        buildings: retained,
        capacity: feasibleCapacity,
        density: feasibleCapacity ? retained / feasibleCapacity : 0,
        availableArea
      };
      if (feasibleCapacity < capacity)
        planning.adjustments.push({
          owners: [id],
          reason: "真实边界、活动区与内部通路限制下的建筑容量",
          requested: capacity,
          resolved: feasibleCapacity
        });
    }
    if (placed.length < capacity) c.notes.push(`${label}按间距容纳 ${placed.length} 栋建筑`);
  }
  if (c.plan.planning) {
    const ports = c.plan.planning.ports.filter((p) => p.kind === "entrance"),
      owners = [...new Set(ports.map((port) => port.ownerId))],
      connected = owners.slice(0, 1),
      pending = owners.slice(1);
    while (pending.length) {
      const pairs = pending
          .flatMap((owner, i) =>
            ports
              .filter((p) => p.ownerId === owner)
              .flatMap((b) =>
                ports
                  .filter((p) => connected.includes(p.ownerId))
                  .map((a) => ({ a, b, i, d: distance(a.position, b.position) }))
              )
          )
          .sort((a, b) => a.d - b.d),
        pair = pairs[0];
      const width = q.roadWidth + 24;
      c.reservations.push({ a: pair.a.position, b: pair.b.position, width });
      c.plan.planning.reservations.push({
        id: `potential-${pair.a.ownerId}-${pair.b.ownerId}`,
        ownerId: "routes",
        kind: "corridor",
        outline: planningCorridor(pair.a.position, pair.b.position, width),
        relatedIds: [pair.a.ownerId, pair.b.ownerId]
      });
      connected.push(pair.b.ownerId);
      pending.splice(pair.i, 1);
    }
  }
}
