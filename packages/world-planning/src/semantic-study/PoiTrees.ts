import { createNaturalTreeDimensions } from "../planning-data/NaturalVegetationProfile";
import rules from "../planning-data/poi-trees.json";
import type { IslandPlan } from "./IslandPlanModel";
import type { SemanticEdit } from "./WorldPlanningContract";
import { envelope } from "./IslandPlanAtoms";
import { contains, overlap } from "./WorldPlanningGeometry";
import { settlementRandom as random } from "./SettlementGeometry";
import { createPlanningGroundSampler } from "./WorldPlanningTerrain";
/** A landmark is a published spatial element. Ambient abundance cannot delete it. */
export function placePoiTrees(
  plan: IslandPlan,
  edits: Record<string, SemanticEdit>,
  config: import("./ContextLandscape").LandscapeConfig
): void {
  const ground = createPlanningGroundSampler(plan);
  const treeDimensions = createNaturalTreeDimensions(plan.parameters.seed);
  const obstacles = [
    ...plan.buildings.map((b) => b.outline),
    ...plan.rocks.map((r) => r.outline),
    ...plan.routes.map((r) => r.outline!),
    ...plan.waters.map((w) => w.outline),
    ...(plan.plazas ?? []).map((p) => p.outline)
  ];
  plan.landscapes = [];
  for (const site of plan.poiDistribution!.sites.filter((s) => rules.tiers.includes(s.tier) && !s.memberIds.length)) {
    const id = `tree-${site.id}`,
      seed = plan.parameters.seed,
      tree = treeDimensions(id, poiTreeHeight(seed, id, site.id, config, edits, site.tier), site.center),
      { width, depth } = tree,
      yaw = random(seed, id + "yaw") * Math.PI * 2;
    const ring = envelope(site.center, width + rules.clearanceM * 2, depth + rules.clearanceM * 2, yaw);
    if (
      !plan.poiDistribution!.domains.some((d) => contains(d.outline, ring)) ||
      obstacles.some((o) => overlap(ring, o))
    )
      continue;
    plan.landscapes.push({
      id,
      ownerId: site.id,
      poiId: site.id,
      role: "poi",
      sourceId: site.id,
      context: "poi",
      kind: "tree",
      center: site.center,
      ...tree,
      yaw,
      baseHeight: ground(site.center),
      outline: envelope(site.center, width, depth, yaw),
      collisionRadius: width / 2,
      canopyRadius: width / 2
    });
    site.memberIds.push(id);
  }
}

/** Height changes preserve the landmark footprint and all road access constraints. */
export function poiTreeHeight(
  seed: number,
  id: string,
  poiId: string,
  config: import("./ContextLandscape").LandscapeConfig,
  edits: Record<string, SemanticEdit>,
  tier: import("./PoiDistribution").PoiTier = "small",
  heightRule?: { heightMultiplier: number; minimumAboveAmbientM: number }
): number {
  const tierScope = config.tierOverrides?.[tier];
  const local = edits[poiId]?.landscape;
  const multiplier = heightRule?.heightMultiplier ?? rules.heightMultiplier;
  const floor = heightRule ? config.treeHeightMaxM + heightRule.minimumAboveAmbientM : 0;
  const min = local?.treeHeightMinM ?? tierScope?.treeHeightMinM ?? Math.max(floor, config.treeHeightMinM * multiplier),
    max = local?.treeHeightMaxM ?? tierScope?.treeHeightMaxM ?? Math.max(min, config.treeHeightMaxM * multiplier);
  if (!(min > 0 && max >= min && max <= 120)) throw new Error("POI 树高范围无效");
  return min + random(seed, id + "height") * (max - min);
}
