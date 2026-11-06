import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import type { PlanningCheck } from "./WorldPlanningContract";
import { contains, overlap, validRing, inRing, segmentGap } from "./WorldPlanningGeometry";
import { planningSegmentInside, PLANNING_TRAVERSAL } from "./WorldLayoutRoutes";
import { routeIntersectsRock } from "./IslandPlanAtoms";
import { auditPlanningRoutes } from "./WorldPlanningRouteAudit";
import { auditPlanningValleys } from "./WorldPlanningValley";
import { auditPlanningWater } from "./WorldPlanningWaterAudit";
import { createPlanningGroundSampler } from "./WorldPlanningTerrain";
/** Independently audit the resolved geometry and original obligations, never a generator success flag.
 * @param plan Candidate planning snapshot.
 * @param changedVillages Density-only scope: terrain, water and route geometry must be unchanged.
 * @returns Located, measurable checks including missing required objects.
 */
export function validatePlanningWorld(plan: IslandPlan, changedVillages?: ReadonlySet<string>): PlanningCheck[] {
  const data = plan.planning;
  if (!data)
    return [{ id: "contract", rule: "E01", owners: [], status: "fail", required: true, message: "缺少规划契约" }];
  const checks: PlanningCheck[] = [];
  const sampleGround = createPlanningGroundSampler(plan);
  const add = (
    id: string,
    rule: string,
    owners: string[],
    pass: boolean,
    message: string,
    position?: PlanPoint,
    measured?: number,
    limit?: number
  ) =>
    checks.push({
      id: `audit-${id}`,
      rule,
      owners,
      status: pass ? "pass" : "fail",
      required: true,
      message,
      position,
      measured,
      limit
    });
  const ids = new Set([
    "land-main",
    "ocean",
    "routes",
    "visual",
    "spawn",
    "ground-final",
    ...data.modules.map((m) => m.id),
    ...plan.rocks.map((r) => r.id),
    ...plan.buildings.map((b) => b.id),
    ...plan.routes.map((r) => r.id),
    ...data.ports.map((p) => p.id),
    ...plan.supports.map((s) => s.id)
  ]);
  for (const id of data.requiredIds) add(`required-${id}`, "E01", [id], ids.has(id), "原始必需对象存在");
  const rings = [
    { id: "land-main", ring: plan.land },
    ...plan.islands.map((ring, i) => ({ id: `offshore-${i}`, ring })),
    ...plan.waters.map((w) => ({ id: w.id, ring: w.outline })),
    ...plan.rocks.map((r) => ({ id: r.id, ring: r.obb })),
    ...plan.buildings.map((b) => ({ id: b.id, ring: b.outline }))
  ];
  for (const { id, ring } of rings.filter(
    (r) => !changedVillages || plan.buildings.some((b) => b.id === r.id && changedVillages.has(b.regionId))
  ))
    add(`ring-${id}`, "G01", [id], validRing(ring), "最终轮廓闭合、无自交且在世界边界内", ring[0]);
  for (const rock of changedVillages ? [] : plan.rocks) {
    const lands = [plan.land, ...plan.islands];
    add(
      `rock-land-${rock.id}`,
      "G02",
      [rock.groupId, rock.id],
      lands.some((r) => contains(r, rock.obb)),
      "岩体占地位于允许陆域",
      rock.center
    );
    add(
      `rock-water-${rock.id}`,
      "W04",
      [rock.groupId, rock.id, ...plan.waters.filter((w) => overlap(rock.obb, w.outline)).map((w) => w.id)],
      !plan.waters.some((w) => overlap(rock.obb, w.outline)),
      "岩体不占据水槽",
      rock.center
    );
    add(
      `rock-ground-${rock.id}`,
      "T01",
      [rock.id],
      Number.isFinite(rock.baseHeight) && Math.abs(rock.baseHeight! - sampleGround(rock.center)) < 0.01,
      "岩体基础使用同版规划地面",
      rock.center
    );
  }
  for (const b of plan.buildings.filter((b) => !changedVillages || changedVillages.has(b.regionId))) {
    add(
      `building-ground-${b.id}`,
      "T01",
      [b.regionId, b.id],
      Number.isFinite(b.baseHeight) && Math.abs(b.baseHeight! - sampleGround(b.center)) < 0.01,
      "建筑基础标高使用同版规划地面",
      b.center
    );
    const region = plan.regions.find((r) => r.id === b.regionId);
    add(
      `building-${b.id}`,
      "G02",
      [b.regionId, b.id],
      !!region && contains(region.outline, b.outline) && contains(plan.land, b.outline),
      "建筑完整占地位于场所及陆域",
      b.center
    );
    add(
      `building-clear-${b.id}`,
      "G03",
      [b.regionId, b.id],
      !plan.rocks.some((r) => overlap(r.obb, b.outline)) &&
        !plan.waters.some((w) => overlap(w.outline, b.outline)) &&
        !plan.buildings.some((other) => other.id !== b.id && overlap(other.outline, b.outline)),
      "建筑避让岩体、水域与其他建筑",
      b.center
    );
    add(
      `building-access-${b.id}`,
      "P01",
      [b.regionId, b.id],
      data.ports.some((p) => p.ownerId === b.id) && !!region?.navigationLinks?.some((r) => r.to === `${b.id}-door`),
      "每栋建筑接入村庄可通行区域",
      b.center
    );
  }
  for (const module of data.modules.filter((m) => m.kind === "teleport"))
    add(
      `destination-${module.id}`,
      "P03",
      [module.id],
      plan.buildings.some((b) => b.regionId === module.id && b.height > 0),
      "传送目的地具有实际地标占位体",
      module.outline[0]
    );
  const obstacles = [
    ...plan.rocks,
    ...plan.buildings.map((b) => ({ ...b, groupId: b.regionId, role: "terrace" as const, obb: b.outline }))
  ];
  for (const route of plan.routes) {
    if (route.kind === "ridge") {
      const s = plan.supports.find((s) => s.routeId === route.id),
        p = data.profiles.find((p) => p.ownerId === route.id && p.kind === "route");
      const grade = s ? Math.abs(s.endHeight - s.startHeight) / Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) : Infinity;
      add(
        `ridge-${route.id}`,
        "R02",
        [route.id],
        !!s &&
          !!p &&
          p.points.length > 1 &&
          grade <= PLANNING_TRAVERSAL.maxSlope &&
          Math.abs(p.points[0].y - s.startHeight) < 0.01 &&
          Math.abs(p.points[p.points.length - 1].y - s.endHeight) < 0.01,
        "登高纵断面与承接坡面一致",
        route.points[0],
        grade,
        PLANNING_TRAVERSAL.maxSlope
      );
    } else {
      const pass = route.points
        .slice(1)
        .every(
          (b, i) =>
            planningSegmentInside(route.points[i], b, plan.land, route.width / 2) &&
            !obstacles.some((r) => routeIntersectsRock(route.points[i], b, r, route.width / 2))
        );
      add(`road-${route.id}`, "R01", [route.id], pass, "最终道路全宽在陆域内且避开具体占用体", route.points[0]);
    }
  }
  if (!changedVillages) checks.push(...auditPlanningWater(plan));
  checks.push(...auditPlanningRoutes(plan, changedVillages));
  const connected = (start: string, goal: string, network: "planned" | "supported") => {
    const visited = new Set([start]);
    for (let k = 0; k < data.ports.length + 2; k++) {
      let changed = false;
      for (const r of data.relations.filter(
        (r) => r.kind === "connects" && (network === "planned" || r.network === "supported")
      )) {
        if (r.ports.some((p) => visited.has(p)))
          for (const p of r.ports)
            if (!visited.has(p)) {
              visited.add(p);
              changed = true;
            }
      }
      if (!changed) break;
    }
    return visited.has(goal);
  };
  for (const id of data.requiredIds.filter((id) => id.startsWith("village-") || id.startsWith("teleport-")))
    add(
      `network-${id}`,
      "P02",
      [id, "routes"],
      connected("spawn", `${id}-entrance`, "planned"),
      "出生点经内部及外部规划网络接入必需村落"
    );
  add(
    "spawn",
    "S01",
    ["spawn"],
    inRing(plan.spawn, plan.land) &&
      !plan.waters.some((w) => inRing(plan.spawn, w.outline)) &&
      !obstacles.some((r) => inRing(plan.spawn, r.obb)) &&
      data.ports.some((p) => p.id === "spawn") &&
      data.relations.some((r) => r.id === "spawn-connection" && r.network === "supported"),
    "出生点有明确落脚和本地受支持接入",
    plan.spawn
  );
  for (const r of data.relations)
    add(
      `relation-${r.id}`,
      "E01",
      r.owners,
      r.ports.every((id) => data.ports.some((p) => p.id === id)),
      "关系端口引用有效"
    );
  if (!changedVillages) checks.push(...auditPlanningValleys(plan));
  return checks;
}
