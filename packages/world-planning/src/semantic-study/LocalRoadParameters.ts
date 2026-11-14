import { isGlobalRoadId } from "../spatial/layout/RoadIdentity";
import roadProfile from "../planning-data/units/road.json";
import type { IslandPlan } from "./IslandPlanModel";
import type { PlanningCheck, SemanticEdit } from "./WorldPlanningContract";
import { ribbonOutline } from "./WorldRibbon";

/** Width changes keep the published path and ports. The common collision checks validate the new ribbon. */
export function applyLocalRoadParameters(plan: IslandPlan, edits: Record<string, SemanticEdit>): PlanningCheck[] {
  const checks: PlanningCheck[] = [];
  const replacements = new Map<object, NonNullable<IslandPlan["regions"][number]["navigationLinks"]>[number]>();
  plan.routes = plan.routes.map((route) => {
    if (isGlobalRoadId(route.id)) return route;
    const width = edits[route.id]?.road?.widthM;
    if (width === undefined) return route;
    if (!Number.isFinite(width) || width < roadProfile.minimumWidth || width > 10) {
      checks.push({
        id: `road-width:${route.id}`,
        rule: "road-width",
        owners: [route.id],
        required: true,
        status: "fail",
        message: `${route.id} 道路宽度必须在 ${roadProfile.minimumWidth}–10 m 内`
      });
      return route;
    }
    const factor = width / route.width,
      widths = (route.widths ?? route.points.map(() => route.width)).map((w) =>
        Math.max(roadProfile.minimumWidth, w * factor)
      );
    const navigationLinks = route.navigationLinks?.map((link) => {
      const next = { ...link, width: Math.max(roadProfile.minimumWidth, link.width * factor) };
      replacements.set(link, next);
      return next;
    });
    return {
      ...route,
      width,
      widths,
      maxWidth: Math.max(...widths),
      keypoints: route.keypoints?.map((p) => ({ ...p, width: Math.max(roadProfile.minimumWidth, p.width * factor) })),
      navigationLinks,
      outline: ribbonOutline(route.points, widths, route.caps, true, route.closed)
    };
  });
  // Region navigation summaries share links with their roads. Replace without mutating cached villages.
  if (replacements.size)
    plan.regions = plan.regions.map((region) => ({
      ...region,
      navigationLinks: region.navigationLinks?.map((link) => replacements.get(link) ?? link)
    }));
  return checks;
}
