import { resolveBuildingPolicy, sampleBuildingSize } from "../planning-data/BuildingSizing";
import type { PlanPoint, PlanBuilding, PlanRoute, PlanRegion, PlanPlace } from "./IslandPlanModel";
import type { PlanningPort, SemanticEdit } from "./WorldPlanningContract";
import { SETTLEMENT_PROFILE as profile } from "../planning-data/SettlementProfile";
import { envelope } from "./IslandPlanAtoms";
import { contains, overlap, ringArea, inRing } from "./WorldPlanningGeometry";
import {
  intent,
  settlementRandom as random,
  settlementCurve,
  settlementRoad,
  flareSettlementRoadEnd
} from "./SettlementGeometry";
import { settlementStreetGraph, connectSettlementRoads } from "./SettlementStreetGraph";
import { fitSettlementPlazas } from "./SettlementPlazas";
export interface SettlementVillageResult {
  region: PlanRegion;
  buildings: PlanBuilding[];
  routes: PlanRoute[];
  plazas: PlanPlace[];
  plazaCandidates: PlanPlace[];
  ports: PlanningPort[];
  requestedCount: number;
  capacity: number;
  coverage: number;
  buildingGap: number;
  floorAreaRatio: number;
}
/** One village owns its doors, local road graph, public space and occupancy boundary.
 * @param id Stable module identity.
 * @param center Allocated site independent of local edits.
 * @param seed World random seed.
 * @param edit Semantic controls and resolved metric building policy.
 * @param ground Shared terrain sampler.
 * @returns Owned geometry and feasible placements found within the search budget, with no edits to other villages.
 */
export function planSettlementVillage(
  id: string,
  center: PlanPoint,
  seed: number,
  edit: SemanticEdit,
  ground: (p: PlanPoint) => number
): SettlementVillageResult {
  const q = profile.village,
    b = profile.building,
    r = profile.road,
    buildingPolicy = resolveBuildingPolicy(edit.buildingPolicy),
    widthMax = buildingPolicy.widthMaxM * buildingPolicy.scale,
    depthMax = buildingPolicy.depthMaxM * buildingPolicy.scale;
  const sample = (key: string) => random(seed, id + key),
    size = intent(edit.size),
    density = intent(edit.density),
    variation = intent(edit.bend),
    buildingGap = q.buildingGapMax + (q.buildingGapMin - q.buildingGapMax) * density;
  const areaDriven = edit.floorAreaRatio !== undefined,
    targetCount = areaDriven ? Math.max(1, Math.round(edit.buildingCount ?? 12)) : q.maxBuildings,
    floorAreaRatio = Math.max(0.01, edit.floorAreaRatio ?? 0.3),
    sizes = Array.from({ length: targetCount }, (_, i) =>
      sampleBuildingSize((key) => sample(`building-${i}-${key}`), intent(edit.width), buildingPolicy)
    ),
    targetArea = sizes.reduce((sum, d) => sum + d.width * d.depth, 0) / floorAreaRatio;
  // The smallest site must fit a full building beside circulation.
  // Interpolate the entire semantic range above that feasibility floor; never shrink houses.
  const centerCount = 1 + Math.min(2, Math.floor(intent(edit.centerRichness, sample("centre-count")) * 3));
  const topologyAllowance =
    (centerCount - 1) * Math.max(widthMax, depthMax) + intent(edit.loopiness, 0.55) * r.publicWidth * 5;
  const minimumSpan =
    topologyAllowance +
    Math.max(
      q.span * q.scaleMin,
      2 * (Math.hypot(widthMax, depthMax) + q.buildingGapMax + q.boundaryInset + q.sitePaddingM)
    );
  const maximumSpan = Math.max(q.span * q.scaleMax, minimumSpan * 1.25);
  const aspect = 0.46 + sample("aspect") * 0.1;
  const unitOutline = Array.from({ length: 32 }, (_, i) => {
    const t = (i * Math.PI) / 16,
      f = 1 + 0.035 * Math.sin(t * 3 + sample("outline") * 6);
    return { x: Math.cos(t) * 0.5 * f, z: Math.sin(t) * aspect * f };
  });
  const span = areaDriven
      ? Math.sqrt(targetArea / ringArea(unitOutline))
      : minimumSpan + (maximumSpan - minimumSpan) * size,
    rx = span / 2,
    rz = span * aspect,
    angle = sample("angle") * Math.PI * 2,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const world = (x: number, z: number): PlanPoint => ({ x: center.x + x * c - z * s, z: center.z + x * s + z * c });
  const outline = Array.from({ length: 32 }, (_, i) => {
    const t = (i * Math.PI) / 16,
      f = 1 + 0.035 * Math.sin(t * 3 + sample("outline") * 6);
    return world(Math.cos(t) * rx * f, Math.sin(t) * rz * f);
  });
  const region: PlanRegion = {
    id,
    label: `村庄 ${Number(id.split("-").at(-1)) + 1}`,
    kind: "village",
    outline,
    navigationArea: outline,
    navigationLinks: []
  };
  const { plazas, ports, routes: base } = settlementStreetGraph(id, seed, edit, outline, span, world, ground);
  const widthVariation = intent(edit.widthVariation, 0.7);
  const addPort = (pid: string, p: PlanPoint, kind: PlanningPort["kind"], width: number, ownerId = id) => {
    if (!ports.some((v) => v.id === pid))
      ports.push({ id: pid, ownerId, position: p, kind, width, height: ground(p), surfaceId: "ground" });
  };
  const splits = new Map<string, Map<number, string>>(
    base.map((route) => [
      route.id,
      new Map([
        [0, route.from],
        [route.points.length - 1, route.to]
      ])
    ])
  );
  const buildings: PlanBuilding[] = [],
    entries: { route: PlanRoute; base: PlanRoute; index: number }[] = [];
  // Density controls spacing. Keep each feasible placement; floor area is measured
  // afterward and never removes buildings. Search limits are not physical capacity.
  for (let i = 0; i < Math.max(q.candidateBudget, targetCount * 50) && buildings.length < targetCount; i++) {
    const p = world((sample("x" + i) * 2 - 1) * rx, (sample("z" + i) * 2 - 1) * rz),
      slot = areaDriven ? buildings.length : i,
      dimensions = areaDriven
        ? sizes[slot]
        : sampleBuildingSize((key) => sample(`building-${i}-${key}`), intent(edit.width), buildingPolicy),
      { width, depth } = dimensions;
    let best = { route: base[0], index: 0, distance: Infinity };
    for (const route of base)
      for (let k = 2; k < route.points.length - 2; k++) {
        const distance = Math.hypot(route.points[k].x - p.x, route.points[k].z - p.z);
        if (distance < best.distance) best = { route, index: k, distance };
      }
    if (
      !areaDriven &&
      (best.distance > r.maxEntryLength + width / 2 || best.distance < width / 2 + r.publicWidth / 2 + 1)
    )
      continue;
    const junction = best.route.points[best.index],
      facing = Math.atan2(junction.z - p.z, junction.x - p.x),
      yaw = facing + (sample("yaw" + i) - 0.5) * Math.PI * 0.7 * intent(edit.direction),
      obb = envelope(p, width, depth, yaw),
      gap = areaDriven ? buildingGap * Math.max(0, 1 - i / (targetCount * 12)) : buildingGap,
      expanded = envelope(p, width + 2 * gap, depth + 2 * gap, yaw);
    if (
      !contains(outline, envelope(p, width + q.boundaryInset * 2, depth + q.boundaryInset * 2, yaw)) ||
      (!areaDriven && base.some((route) => overlap(expanded, route.outline!))) ||
      buildings.some((other) => overlap(expanded, other.outline)) ||
      (!areaDriven && entries.some((e) => overlap(expanded, e.route.outline!)))
    )
      continue;
    const bid = id + "-building-" + slot,
      door = { x: p.x + (Math.cos(yaw) * width) / 2, z: p.z + (Math.sin(yaw) * width) / 2 };
    let access: PlanRoute | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      const points = settlementCurve(door, junction, variation * (1 - attempt * 0.25), seed, bid + "entry" + attempt, {
        start: { x: Math.cos(yaw), z: Math.sin(yaw) },
        end: {
          x: best.route.points[best.index - 1].x - best.route.points[best.index + 1].x,
          z: best.route.points[best.index - 1].z - best.route.points[best.index + 1].z
        }
      });
      const candidate = settlementRoad(
        bid + "-access",
        bid + "-door",
        best.route.id + "-node-" + best.index,
        points,
        r.entryWidth,
        seed,
        widthVariation,
        "入户支路"
      );
      flareSettlementRoadEnd(candidate, best.route.widths?.[best.index] ?? best.route.width);
      if (
        contains(outline, candidate.outline!) &&
        !buildings.some((other) =>
          overlap(
            candidate.outline!,
            envelope(other.center, other.width + r.entryClearance, other.depth + r.entryClearance, other.yaw)
          )
        )
      ) {
        access = candidate;
        break;
      }
    }
    if (!access && !areaDriven) continue;
    const doorWidth = Math.min(b.doorWidth, depth),
      doorHeight = Math.min(b.doorHeight, dimensions.floorHeightsM[0]);
    buildings.push({
      id: bid,
      regionId: id,
      center: p,
      width,
      depth,
      height: dimensions.height,
      doorWidthM: doorWidth,
      doorHeightM: doorHeight,
      floorCount: dimensions.floorCount,
      floorHeightsM: dimensions.floorHeightsM,
      sizingScale: dimensions.sizingScale,
      yaw,
      outline: obb,
      baseHeight: ground(p)
    });
    addPort(bid + "-door", door, "landing", doorWidth, bid);
    if (access) {
      const existing = splits.get(best.route.id)!.get(best.index),
        junctionId = existing ?? access.to;
      access.to = junctionId;
      splits.get(best.route.id)!.set(best.index, junctionId);
      addPort(junctionId, junction, "landing", r.publicWidth);
      entries.push({ route: access, base: best.route, index: best.index });
    }
  }
  const capacity = buildings.length,
    area = ringArea(outline);
  const retainedPorts = new Set([
    ...buildings.map((b) => b.id + "-door"),
    ...base.flatMap((r) => [r.from, r.to]),
    ...entries.flatMap((e) => [e.route.from, e.route.to])
  ]);
  for (let i = ports.length - 1; i >= 0; i--)
    if (!retainedPorts.has(ports[i].id) && !ports[i].id.includes("junction-loop")) ports.splice(i, 1);
  const proposedRoutes = [...base, ...entries.map((e) => e.route)];
  // Streets guide orientation, but cannot reserve land ahead of the authored buildings.
  // Publish only their collision-free portions/edges; the global network may reconnect doors.
  const viableRoutes = areaDriven
    ? proposedRoutes.filter(
        (route) =>
          !buildings.some((building) =>
            route.from === building.id + "-door" || route.to === building.id + "-door"
              ? route.points.slice(1, -1).some((point) => inRing(point, building.outline))
              : overlap(route.outline!, building.outline)
          )
      )
    : proposedRoutes;
  const routes = connectSettlementRoads(id, viableRoutes, ports, ground);
  region.navigationLinks = routes.flatMap((route) => route.navigationLinks ?? []);
  return {
    region,
    buildings,
    routes,
    plazas: fitSettlementPlazas(plazas, buildings, outline),
    plazaCandidates: plazas,
    ports,
    requestedCount: areaDriven ? targetCount : capacity,
    capacity,
    buildingGap,
    floorAreaRatio: buildings.reduce((sum, b) => sum + b.width * b.depth * (b.floorCount ?? 1), 0) / area,
    coverage: buildings.reduce((sum, b) => sum + b.width * b.depth, 0) / area
  };
}
