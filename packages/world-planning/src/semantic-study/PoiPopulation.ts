import {
  contentAlgorithm,
  rankedPoiRecipes,
  validatePoiCatalog,
  type PoiContentCandidate,
  type PoiContentContext
} from "./PoiContentCatalog";
import { contains, overlap, polygonBounds, boundsOverlap } from "./WorldPlanningGeometry";
import { createPlanningGroundSampler } from "./WorldPlanningTerrain";
import { envelope } from "./IslandPlanAtoms";
import { settlementRandom } from "./SettlementGeometry";
import type { IslandPlan } from "./IslandPlanModel";
import type { PlanningCheck, SemanticEdit } from "./WorldPlanningContract";
/** Fill unallocated sites from the data catalog after explicit content requests.
 * The placement loop knows only footprints and outputs, never an algorithm's content kind.
 * Failure stays diagnostic; neither neighbouring contents nor requested POI anchors are moved.
 */
export function populatePoiContents(
  plan: IslandPlan,
  edits: Record<string, SemanticEdit>,
  layout?: import("./PoiDistribution").PoiLayoutConfig
): PlanningCheck[] {
  const config = layout?.population;
  if (!config) return [];
  validatePoiCatalog(config);
  const ground = createPlanningGroundSampler(plan),
    checks: PlanningCheck[] = [];
  const obstacles = [
    ...plan.buildings.map((b) => b.outline),
    ...plan.regions.filter((r) => r.kind === "village").map((r) => r.outline),
    ...plan.routes.map((r) => r.outline!),
    ...plan.waters.map((w) => w.outline),
    ...(plan.plazas ?? []).map((p) => p.outline),
    ...(plan.landscapes ?? []).map((p) => p.outline),
    ...plan.rocks.flatMap((r) => r.boxes?.map((b) => envelope(b.center, b.sizeX, b.sizeZ, b.yaw)) ?? [r.outline])
  ].map((r) => ({ ring: r, bounds: polygonBounds(r) }));
  for (const site of plan.poiDistribution!.sites.filter((s) => !s.memberIds.length)) {
    let chosen: PoiContentCandidate | undefined,
      recipeId = "",
      chosenScale = 1,
      attempts = 0;
    const domain = plan.poiDistribution!.domains.find((d) => d.id === site.domainId)!;
    for (const recipe of rankedPoiRecipes(config, plan.parameters.seed, site)) {
      const generator = contentAlgorithm(recipe.algorithm);
      const base: PoiContentContext = {
        plan,
        landscape: layout!.landscape,
        site,
        recipe,
        edits,
        ground,
        origin: site.center,
        scale: 1
      };
      const span = generator.nominalSpan(base);
      // Authored dimensions remain requests under the same reported fitting policy.
      // Merely materializing a height edit must not discard the existing footprint fit.
      for (const scale of config.fit.scales) {
        for (let attempt = 0; attempt < config.fit.attemptsPerScale; attempt++) {
          attempts++;
          const angle = settlementRandom(plan.parameters.seed, `${site.id}:candidate:${attempt}`) * Math.PI * 2,
            offset =
              attempt === 0 ? 0 : Math.max(span * 0.6, config.fit.maxOffsetM) * (attempt / config.fit.attemptsPerScale);
          const candidate = generator.generate({
            ...base,
            scale,
            origin: { x: site.center.x + Math.cos(angle) * offset, z: site.center.z + Math.sin(angle) * offset }
          });
          if (!candidate.members.length || !candidate.footprints.length) continue;
          if (
            candidate.footprints.some((r) => {
              const bounds = polygonBounds(r);
              return (
                !contains(domain.outline, r) ||
                obstacles.some((o) => boundsOverlap(bounds, o.bounds) && overlap(r, o.ring))
              );
            })
          )
            continue;
          chosen = candidate;
          chosenScale = scale;
          recipeId = recipe.id;
          break;
        }
        if (chosen) break;
      }
      if (chosen) break;
    }
    if (!chosen) {
      checks.push({
        id: `poi-fill:${site.id}`,
        rule: "POI-fill",
        required: true,
        status: "fail",
        owners: [site.id],
        message: `${site.id} 的${attempts}个内容候选均被占地约束拒绝；不能发布空POI`
      });
      continue;
    }
    plan.rocks.push(...chosen.rocks);
    plan.mountains.push(...chosen.mountains);
    (plan.landscapes ??= []).push(...chosen.landscapes);
    plan.planning!.modules.push(...chosen.modules);
    site.memberIds.push(...chosen.members);
    site.contentRecipeId = recipeId;
    obstacles.push(...chosen.footprints.map((r) => ({ ring: r, bounds: polygonBounds(r) })));
    if (chosenScale < 1)
      plan.planning!.adjustments.push({
        owners: [site.id, ...chosen.members],
        requested: 1,
        resolved: chosenScale,
        reason: "配方内容按可用占地收缩；未改变POI位置和邻居"
      });
  }
  return checks;
}
