import type { PlanningDocument } from "../PlanningDocument";
import type { SemanticRecipe } from "../../semantic-study/WorldPlanningContract";
import type { LegacyPoiSite } from "./LegacyPoiDistribution";
import { assignLayoutOrganizations } from "./LegacyLayoutProfiles";
import { createSpatialTerrainPlan } from "../layout/SpatialTerrain";
import { poiTerritories, poiTerritoryLandOutline } from "../ecology/PoiTerritories";
import { generateRiverRegions, RIVER_DEFAULTS } from "../hydrology/RiverRegions";
import { generateLakeRegions, LAKE_DEFAULTS } from "../hydrology/LakeRegions";
import { compileAuthoredRivers } from "../hydrology/AuthoredRivers";
import { compileAuthoredLakes } from "../hydrology/AuthoredLakes";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { reliefField } from "../terrain/ReliefField";
import { sampleRegionRelief } from "../terrain/RegionRelief";

/** Recover content bindings from the historical terrain allocation before changing the partition solver.
 * @param recipe Effective saved world and local water/terrain authoring.
 * @param sites Historical anchors and categories, without current relaxation.
 * @param offsets Historical power offsets in squared metres.
 * @param resources Saved native authored terrain and water resources.
 * @returns The original terrain-assigned organization for each retained identity.
 */
export function legacyPoiContentOrganizations(
  recipe: SemanticRecipe,
  sites: readonly LegacyPoiSite[],
  offsets: ReadonlyMap<string, number>,
  resources: PlanningDocument["authoredResources"]
) {
  const plan = createSpatialTerrainPlan(recipe);
  plan.authoredResources = structuredClone(resources ?? []);
  plan.poiDistribution = {
    candidates: sites.map((site) => ({ id: site.id, origin: { ...site.center }, domainId: site.domainId })),
    sites: sites.map((site) => ({
      ...site,
      origin: { ...site.center },
      active: true,
      areaM2: 0,
      weightM2: offsets.get(site.id) ?? 0
    })),
    domains: [
      { id: "land-main", outline: plan.land },
      ...plan.islands.map((outline, i) => ({ id: `offshore-${i}`, outline }))
    ],
    spacingM: 1,
    minAreaM2: 0,
    metrics: {
      count: sites.length,
      candidateCount: sites.length,
      dormantCount: 0,
      maxUncoveredM: 0,
      minSeparationM: null,
      budgetLimited: false
    }
  };
  generateRiverRegions(
    plan,
    { ...RIVER_DEFAULTS, ...recipe.parameters.rivers },
    Object.fromEntries(
      Object.entries(recipe.edits)
        .filter(([, edit]) => edit.rivers)
        .map(([id, edit]) => [id, edit.rivers!])
    )
  );
  generateLakeRegions(
    plan,
    { ...LAKE_DEFAULTS, ...recipe.parameters.lakes },
    Object.fromEntries(
      Object.entries(recipe.edits)
        .filter(([, edit]) => edit.lakes)
        .map(([id, edit]) => [id, edit.lakes!])
    )
  );
  compileAuthoredRivers(plan);
  compileAuthoredLakes(plan);
  const outlines = new Map(poiTerritories(plan).map((cell) => [cell.poiId, poiTerritoryLandOutline(plan, cell)]));
  const waters = plan.waters.map((water) => createPlanningRingQuery(water.outline));
  const relief = reliefField(
    (plan.parameters.terrainPatches ?? []).map((patch) => ({ ...patch, heightM: Math.abs(patch.heightM) }))
  );
  return assignLayoutOrganizations(
    recipe.parameters.seed,
    sites,
    sampleRegionRelief(outlines, relief, (point) => !waters.some((water) => water.inside(point)))
  );
}
