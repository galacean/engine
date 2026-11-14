import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import type { PlanningCheck, SemanticEdit } from "./WorldPlanningContract";
/** A corridor request reserves real space; the mountain owner resolves its component placement. */
export interface CorridorRequest {
  id: string;
  ownerId: string;
  a: PlanPoint;
  b: PlanPoint;
  width: number;
  reason: string;
}
/** Derive bounded repair requests from failed relationships instead of rerolling world randomness.
 * @param candidate Failed complete proposal.
 * @param checks Final relationship checks.
 * @param previous Previously accepted layout, if available.
 * @returns Shared-space requests to submit to the owning landform module.
 */
export function requestPlanningRepairs(
  candidate: IslandPlan,
  checks: PlanningCheck[],
  previous?: IslandPlan
): CorridorRequest[] {
  const failed = checks.filter((c) => c.required && c.status === "fail");
  if (!failed.some((c) => ["P02", "R01", "R02"].includes(c.rule))) return [];
  const source = previous ?? candidate,
    requests: CorridorRequest[] = [];
  for (const route of source.routes.filter(
    (r) => r.kind !== "ridge" && !r.id.includes("building") && !r.id.includes("internal")
  )) {
    for (let i = 1; i < route.points.length; i++)
      requests.push({
        id: `preserve-${route.id}-${i}`,
        ownerId: "landforms",
        a: route.points[i - 1],
        b: route.points[i],
        width: route.width + 6,
        reason: "保护必需连接，要求地貌在通廊之外重新组织"
      });
  }
  if (!requests.length) {
    const ports = candidate.planning?.ports.filter((p) => p.kind === "entrance") ?? [];
    for (let i = 1; i < ports.length; i++)
      requests.push({
        id: `connect-${ports[i].id}`,
        ownerId: "landforms",
        a: ports[i - 1].position,
        b: ports[i].position,
        width: Math.max(ports[i].width, ports[i - 1].width) + 12,
        reason: "为缺失场所连接预留地貌通道"
      });
  }
  return requests.slice(0, 64);
}
