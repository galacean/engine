import type { IslandPlan, PlanLandscape, PlanPoint } from "./IslandPlanModel";
import { envelope } from "./IslandPlanAtoms";
import { ringGap, contains, overlap } from "./WorldPlanningGeometry";
import { createPlanningGroundSampler } from "./WorldPlanningTerrain";
import { intent, settlementRandom as random, roadGap } from "./SettlementGeometry";
import { SETTLEMENT_PROFILE as profile } from "../planning-data/SettlementProfile";
/** Populate sparse roadside landscape without changing any upstream module.
 * @param plan Published ground, routes, buildings, doors and boundary fences.
 * @param density Normalized landscape abundance; rejected candidates are left empty.
 * @returns Stable tree/rock envelopes with explicit trunk collisions and road ownership.
 */
export function planRoadsideLandscape(plan: IslandPlan, density = profile.landscape.density): PlanLandscape[] {
  const q = profile.landscape,
    seed = plan.parameters.seed,
    ground = createPlanningGroundSampler(plan),
    items: PlanLandscape[] = [],
    doors = plan.planning?.ports.filter((p) => p.id.endsWith("-door")) ?? [];
  for (const road of [...plan.routes].sort((a, b) => a.id.localeCompare(b.id))) {
    if (road.label === "入户支路") continue;
    let travel = 0,
      next = q.sampleSpacing / 2,
      index = 0;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i],
        length = Math.hypot(b.x - a.x, b.z - a.z);
      if (!length) continue;
      while (next <= travel + length) {
        const t = (next - travel) / length,
          key = road.id + "-landscape-" + index++,
          sample = (name: string) => random(seed, key + name);
        next += q.sampleSpacing;
        if (sample("keep") > intent(density) * 0.7 || items.length >= q.maxInstances) continue;
        const kind = sample("kind") < 0.65 ? "tree" : "rock",
          radius =
            kind === "tree"
              ? q.treeRadiusMin + (q.treeRadiusMax - q.treeRadiusMin) * sample("radius")
              : (q.rockWidthMin + (q.rockWidthMax - q.rockWidthMin) * sample("radius")) / 2;
        const side = sample("side") > 0.5 ? 1 : -1,
          offset = (road.maxWidth ?? road.width) / 2 + radius + q.roadClearance + sample("offset") * 3;
        const center = {
          x: a.x + (b.x - a.x) * t - ((b.z - a.z) / length) * offset * side,
          z: a.z + (b.z - a.z) * t + ((b.x - a.x) / length) * offset * side
        };
        const yawRange = profile.moduleSources[kind].yawRadians,
          yaw = yawRange.min + sample("yaw") * (yawRange.max - yawRange.min),
          width = radius * 2,
          depth =
            kind === "tree"
              ? width
              : width *
                (profile.moduleSources.rock.depthPerWidth.min +
                  (profile.moduleSources.rock.depthPerWidth.max - profile.moduleSources.rock.depthPerWidth.min) *
                    sample("aspect")),
          outline = envelope(center, width, depth, yaw);
        if (
          plan.routes.some((r) => overlap(outline, r.outline!)) ||
          plan.buildings.some((b) => overlap(outline, b.outline)) ||
          plan.plazas?.some((p) => overlap(outline, p.outline)) ||
          plan.fences?.some((f) => overlap(outline, envelope(f.center, f.sizeX, f.sizeZ, f.yaw))) ||
          !contains(plan.land, outline) ||
          roadGap(center, plan.routes) < radius + q.roadClearance ||
          plan.buildings.some((b) => ringGap(center, b.outline) < radius + q.buildingClearance) ||
          plan.plazas?.some((p) => ringGap(center, p.outline) < radius + 1) ||
          plan.waters.some((w) => ringGap(center, w.outline) < radius + 1) ||
          plan.rocks.some((r) => overlap(outline, r.obb))
        )
          continue;
        if (
          doors.some((d) => Math.hypot(d.position.x - center.x, d.position.z - center.z) < radius + q.doorClearance) ||
          items.some(
            (p) =>
              Math.hypot(p.center.x - center.x, p.center.z - center.z) <
              radius + Math.max(p.width, p.depth) / 2 + q.instanceGap
          ) ||
          plan.fences?.some((f) => ringGap(center, envelope(f.center, f.sizeX, f.sizeZ, f.yaw)) < radius + 0.5)
        )
          continue;
        items.push({
          id: key,
          ownerId: "landscape",
          sourceId: road.id,
          kind,
          center,
          width,
          depth,
          height:
            kind === "tree"
              ? q.treeHeightMin + (q.treeHeightMax - q.treeHeightMin) * sample("height")
              : q.rockHeightMin + (q.rockHeightMax - q.rockHeightMin) * sample("height"),
          yaw,
          baseHeight: ground(center),
          outline,
          collisionRadius: kind === "tree" ? q.trunkRadius : Math.hypot(width, depth) / 2,
          ...(kind === "tree" ? { canopyRadius: radius } : {})
        });
      }
      travel += length;
    }
  }
  return items;
}
