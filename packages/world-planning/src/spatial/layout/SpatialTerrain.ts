import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { createPlanningData, type SemanticResult } from "../../semantic-study/WorldPlanningContract";
import { planWorldDomain } from "../../semantic-study/WorldLandDomain";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";

/** Planner world bounds and background raster, shared by the water-only host. */
export function createSpatialWorldBase(recipe: SemanticResult["recipe"]): IslandPlan {
  const p = recipe.parameters;
  return {
    mode: "base-map",
    settlementLayout: { profileId: "spatial", activeBounds: [] },
    parameters: {
      width: 1024,
      depth: 1024,
      seed: p.seed,
      valleyWidth: 0,
      riverWidth: 0,
      mountainHeight: 0,
      terrainPatches: p.terrainPatches
    },
    land: [],
    islands: [],
    rocks: [],
    mountains: [],
    waters: [],
    routes: [],
    places: [],
    bridges: [],
    sights: [],
    spawn: { x: 512, z: 512 },
    prompt: "空间体量、区域、连接与环境分布",
    regions: [],
    buildings: [],
    ridges: [],
    supports: [],
    slopes: [],
    plazas: [],
    shapeRecipes: [],
    landscapes: [],
    raster: { heightSamples: 1024, alphaSamples: 1024, spacing: 1024 / 1023 },
    planning: createPlanningData()
  };
}

/** Generate land and offshore islands without POI, roads or ecology. */
export function generateSpatialLand(plan: IslandPlan, recipe: SemanticResult["recipe"], notes: string[]): void {
  const p = recipe.parameters;
  planWorldDomain({
    plan,
    edits: recipe.edits,
    notes,
    frame: { width: 440, length: 440, angle: 0 },
    random: (key) => settlementRandom(p.seed, key),
    parameters: {
      seed: p.seed,
      landSize: p.landCoverage,
      landAspect: p.landAspect,
      landOrientation: p.landOrientation,
      contourDetail: p.complexity,
      offshoreCoverage: p.offshoreCoverage,
      islands: Math.round(p.islandRichness * 6)
    }
  });
}

/** Rebuild the base terrain bands from the same authored parameters and named Seed streams. */
export function generateSpatialTerrain(plan: IslandPlan, recipe: SemanticResult["recipe"]): void {
  const p = recipe.parameters;
  const terrain = { count: 2, directionDegrees: 45, heightM: 50, widthM: 160, lengthM: 600, ...p.terrainSkeleton };
  const terrainPatches = Array.from({ length: terrain.count }, (_, i) => ({
    id: `terrain-band:${i}`,
    x: 180 + settlementRandom(p.seed, `band:${i}:x`) * 660,
    z: 180 + settlementRandom(p.seed, `band:${i}:z`) * 660,
    yawDegrees: terrain.directionDegrees + (settlementRandom(p.seed, `band:${i}:angle`) - 0.5) * 40,
    lengthM: terrain.lengthM ?? 600,
    leftWidthM: terrain.widthM,
    rightWidthM: terrain.widthM * (0.7 + settlementRandom(p.seed, `band:${i}:width`) * 0.5),
    heightM: terrain.heightM,
    bendM: (settlementRandom(p.seed, `band:${i}:bend`) - 0.5) * 160
  }));
  plan.parameters.terrainPatches = [...terrainPatches, ...(p.terrainPatches ?? [])];
}

export function createSpatialTerrainPlan(recipe: SemanticResult["recipe"], notes: string[] = []): IslandPlan {
  const plan = createSpatialWorldBase(recipe);
  generateSpatialLand(plan, recipe, notes);
  generateSpatialTerrain(plan, recipe);
  return plan;
}
