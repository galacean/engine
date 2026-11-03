import type { IslandPlan } from "./IslandPlanModel";
import type { SemanticEdit, PlanningCheck } from "./WorldPlanningContract";
import { envelope } from "./IslandPlanAtoms";
import { settlementCurve, settlementRoad, flareSettlementRoadEnd } from "./SettlementGeometry";
import { createPlanningGroundSampler } from "./WorldPlanningTerrain";
import { ringArea, inRing, contains } from "./WorldPlanningGeometry";
import { applyBuildingSize, DEFAULT_MINIMUM_BUILDING_AREA_M2 } from "../planning-data/BuildingSizing";
import { adaptSettlementPlazas } from "./SettlementPlazas";

/** Apply authored instance dimensions and pose to the generated building baseline, then reconnect its door
 * to the existing road junction. No neighbouring instance or public road is moved.
 * The caller validates and publishes the entire transaction, or keeps the previous snapshot.
 */
export function applyBuildingPlacementEdits(
  plan: IslandPlan,
  edits: Record<string, SemanticEdit>,
  minimumArea = DEFAULT_MINIMUM_BUILDING_AREA_M2
): PlanningCheck[] {
  const ground = createPlanningGroundSampler(plan),
    checks: PlanningCheck[] = [];
  for (const building of plan.buildings) {
    const edit = edits[building.id],
      transform = edit?.transform,
      size = edit?.buildingSize;
    if (!transform && !size && edit?.buildingPolicy?.minimumFootprintM2 === undefined) continue;
    const { offsetX = 0, offsetZ = 0, rotationDegrees = 0 } = transform ?? {};
    // The old transform scale and the metric component are aliases during migration,
    // not two multipliers. New authored dimensions take precedence.
    const scale = size?.scale ?? transform?.scale ?? 1;
    if (![offsetX, offsetZ, rotationDegrees].every(Number.isFinite) || Math.abs(offsetX) > 30 || Math.abs(offsetZ) > 30)
      throw new Error("建筑变换超出局部编辑范围");
    const owner = plan.planning!.modules.find((m) => m.id === building.regionId),
      inheritedScale = building.sizingScale ?? owner?.resolved.buildingScale ?? 1;
    Object.assign(
      building,
      applyBuildingSize(
        building,
        { ...size, scale },
        inheritedScale,
        edit?.buildingPolicy?.minimumFootprintM2 ??
          edits[building.regionId]?.buildingPolicy?.minimumFootprintM2 ??
          minimumArea
      )
    );
    building.center = { x: building.center.x + offsetX, z: building.center.z + offsetZ };
    building.yaw += (rotationDegrees * Math.PI) / 180;
    if (building.doorWidthM !== undefined) building.doorWidthM = Math.min(building.doorWidthM * scale, building.depth);
    if (building.doorHeightM !== undefined)
      building.doorHeightM = Math.min(
        building.doorHeightM * scale,
        building.floorHeightsM?.[0] ?? building.height / (building.floorCount ?? 1)
      );
    building.outline = envelope(building.center, building.width, building.depth, building.yaw);
    building.baseHeight = ground(building.center);
    const doorId = building.id + "-door",
      port = plan.planning!.ports.find((p) => p.id === doorId);
    if (!port) throw new Error("建筑缺少门口接入点");
    const position = {
      x: building.center.x + (Math.cos(building.yaw) * building.width) / 2,
      z: building.center.z + (Math.sin(building.yaw) * building.width) / 2
    };
    const entryMoved = rotationDegrees !== 0 || position.x !== port.position.x || position.z !== port.position.z;
    port.position = position;
    port.height = ground(port.position);
    port.width = building.doorWidthM ?? port.width * scale;
    const index = plan.routes.findIndex((r) => r.from === doorId);
    if (index < 0 && port.roadAccess) {
      port.roadAccess.heading = { x: Math.cos(building.yaw), z: Math.sin(building.yaw) };
      continue;
    }
    if (index < 0) continue;
    const old = plan.routes[index],
      end = old.points.at(-1)!,
      beforeEnd = old.points.at(-2)!;
    if (!owner) throw new Error("建筑缺少所属空间");
    const road = entryMoved
      ? settlementRoad(
          old.id,
          old.from,
          old.to,
          settlementCurve(port.position, end, owner.requested.bend ?? 0.5, plan.parameters.seed, old.id, {
            start: { x: Math.cos(building.yaw), z: Math.sin(building.yaw) },
            end: { x: end.x - beforeEnd.x, z: end.z - beforeEnd.z }
          }),
          old.width,
          plan.parameters.seed,
          owner.requested.widthVariation ?? 0.7,
          old.label
        )
      : old;
    if (entryMoved) flareSettlementRoadEnd(road, old.widths?.at(-1) ?? old.width);
    plan.routes[index] = road;
    checks.push({
      id: `${building.id}-own-access`,
      rule: "building-entry",
      owners: [building.id, road.id],
      required: true,
      status: road.points.slice(1).some((p) => inRing(p, building.outline)) ? "fail" : "pass",
      message: "建筑门口支路需从外侧接入，不能穿过自身占地"
    });
  }
  for (const module of plan.planning!.modules.filter((m) => m.kind === "village")) {
    const buildings = plan.buildings.filter((b) => b.regionId === module.id);
    const floorArea = buildings.reduce((sum, b) => sum + b.width * b.depth * (b.floorCount ?? 1), 0);
    const targetRatio = module.requested.floorAreaRatio;
    if (targetRatio && floorArea) {
      const center = { x: module.resolved.originX, z: module.resolved.originZ };
      const base = module.outline;
      const scaled = (scale: number) =>
        base.map((p) => ({ x: center.x + (p.x - center.x) * scale, z: center.z + (p.z - center.z) * scale }));
      let scale = Math.sqrt(floorArea / targetRatio / ringArea(base));
      // The village boundary describes its contents. It is not a veto on buildings.
      // Preserve all buildings and derive the nearest density that can enclose them.
      if (!buildings.every((b) => contains(scaled(scale), b.outline))) {
        let low = scale,
          high = Math.max(1, scale);
        while (!buildings.every((b) => contains(scaled(high), b.outline)) && high < 32) high *= 2;
        for (let i = 0; i < 20; i++) {
          const middle = (low + high) / 2;
          if (buildings.every((b) => contains(scaled(middle), b.outline))) high = middle;
          else low = middle;
        }
        scale = high;
      }
      module.outline = scaled(scale);
      const region = plan.regions.find((r) => r.id === module.id);
      if (region) region.outline = module.outline;
    }
    const area = ringArea(module.outline);
    module.resolved.area = area;
    module.resolved.floorAreaRatio =
      buildings.reduce((sum, b) => sum + b.width * b.depth * (b.floorCount ?? 1), 0) / area;
    module.resolved.coverage = buildings.reduce((sum, b) => sum + b.width * b.depth, 0) / area;
  }
  adaptSettlementPlazas(plan);
  return checks;
}
