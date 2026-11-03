import rules from "../planning-data/poi-buildings.json";
import { SETTLEMENT_PROFILE as profile } from "../planning-data/SettlementProfile";
import { resolveBuildingPolicy, sampleBuildingSize, type BuildingPolicy } from "../planning-data/BuildingSizing";
import type { IslandPlan, PlanBuilding } from "./IslandPlanModel";
import type { PoiLayoutConfig } from "./PoiDistribution";
import { envelope } from "./IslandPlanAtoms";
import { contains, overlap } from "./WorldPlanningGeometry";
import { createPlanningGroundSampler } from "./WorldPlanningTerrain";
import { settlementRandom as random } from "./SettlementGeometry";
import type { SemanticEdit } from "./WorldPlanningContract";

/** Place small building groups and individual houses at allocated POIs. They declare door
 * access requirements, not road destinations, plazas or village membership.
 */
export function placePoiBuildings(
  plan: IslandPlan,
  config: PoiLayoutConfig,
  edits: Record<string, SemanticEdit> = {},
  globalPolicy?: Partial<BuildingPolicy>
): void {
  const ground = createPlanningGroundSampler(plan),
    seed = plan.parameters.seed;
  for (const tier of ["medium"] as const) {
    const q = rules[tier];
    let count = 0;
    for (const site of plan.poiDistribution!.sites.filter((p) => p.tier === tier && !p.memberIds.length)) {
      if (count >= q.siteCount) break;
      const owner = `buildings-${site.id}`,
        buildingPolicy = resolveBuildingPolicy(globalPolicy, edits[owner]?.buildingPolicy),
        buildings: PlanBuilding[] = [];
      for (let i = 0; i < q.buildingCount; i++) {
        const id = `${owner}-building-${i}`,
          sample = (key: string) => random(seed, id + key),
          dimensions = sampleBuildingSize(sample, config.content.buildingSize, buildingPolicy),
          angle = sample("orbit") * Math.PI * 2,
          center = { x: site.center.x + Math.cos(angle) * q.spreadM, z: site.center.z + Math.sin(angle) * q.spreadM },
          yaw = sample("yaw") * Math.PI * 2;
        const b: PlanBuilding = {
          id,
          regionId: owner,
          center,
          ...dimensions,
          yaw,
          outline: envelope(center, dimensions.width, dimensions.depth, yaw),
          baseHeight: ground(center),
          doorWidthM: Math.min(profile.building.doorWidth, dimensions.depth),
          doorHeightM: Math.min(profile.building.doorHeight, dimensions.floorHeightsM[0])
        };
        const expanded = envelope(center, b.width + rules.gapM * 2, b.depth + rules.gapM * 2, yaw);
        const domain = plan.poiDistribution!.domains.find((d) => d.id === site.domainId)!;
        if (
          !contains(domain.outline, expanded) ||
          [...plan.buildings, ...buildings].some((o) => overlap(expanded, o.outline)) ||
          plan.regions.filter((r) => r.kind === "village").some((r) => overlap(expanded, r.outline)) ||
          plan.rocks.some((r) => overlap(expanded, r.outline)) ||
          plan.waters.some((w) => overlap(expanded, w.outline)) ||
          plan.routes.some((r) => overlap(expanded, r.outline!))
        )
          continue;
        buildings.push(b);
      }
      if (!buildings.length) continue;
      const points = buildings.flatMap((b) => b.outline),
        xs = points.map((p) => p.x),
        zs = points.map((p) => p.z),
        x0 = Math.min(...xs) - rules.siteMarginM,
        x1 = Math.max(...xs) + rules.siteMarginM,
        z0 = Math.min(...zs) - rules.siteMarginM,
        z1 = Math.max(...zs) + rules.siteMarginM;
      const outline = [
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 }
      ];
      plan.regions.push({ id: owner, kind: "open", label: `房舍组 ${count + 1}`, outline });
      plan.buildings.push(...buildings);
      site.memberIds.push(owner);
      count++;
      plan.planning!.modules.push({
        id: owner,
        kind: "open",
        outline,
        dependencies: [site.id],
        memberIds: buildings.map((b) => b.id),
        requested: {},
        resolved: {
          buildings: buildings.length,
          originX: site.center.x,
          originZ: site.center.z,
          buildingScale: buildingPolicy.scale
        }
      });
      for (const b of buildings) {
        const position = {
          x: b.center.x + (Math.cos(b.yaw) * b.width) / 2,
          z: b.center.z + (Math.sin(b.yaw) * b.width) / 2
        };
        plan.planning!.ports.push({
          id: b.id + "-door",
          ownerId: b.id,
          kind: "landing",
          position,
          height: ground(position),
          width: b.doorWidthM!,
          surfaceId: "ground",
          roadAccess: { required: true, poiId: site.id, heading: { x: Math.cos(b.yaw), z: Math.sin(b.yaw) } }
        });
      }
    }
  }
}
