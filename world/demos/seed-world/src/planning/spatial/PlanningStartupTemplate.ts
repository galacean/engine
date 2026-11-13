import { exportPlanningRecipe, type PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { templateLinearColor, worldTemplate } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";
import { WORLD_TEMPLATE_ART } from "@galacean/engine-world-planning/spatial/WorldTemplateArtDirection";
import { defaultPoiLayout, distributePois } from "@galacean/engine-world-planning/semantic-study/PoiDistribution";
import { settlementRandom } from "@galacean/engine-world-planning/semantic-study/SettlementGeometry";
import { createSpatialTerrainPlan } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";

import mojaveAssets from "../../MojaveAssets.json";

let selection: { id: string; seed: number } | undefined;

/** Remember an explicit launch selection for this page lifetime only.
 * @param id Registered theme, or empty for the original world.
 * @param seed Selected world identity.
 */
export function selectPlanningStartupTemplate(id: string, seed: number): void {
  selection = { id, seed };
}

/** Resolve new authoring without replacing a saved world's later edits on refresh.
 * @param search Current page query, carrying the initial template for a new world.
 * @param seed World identity being opened.
 * @param savedTemplate Saved template identity, empty for the original world, undefined if absent.
 * @returns Template to initialize, or undefined to restore the saved document.
 */
export function initialPlanningTemplate(search: string, seed: number, savedTemplate?: string): string | undefined {
  const explicit = selection?.seed === seed ? selection.id : undefined;
  if (savedTemplate !== undefined) return explicit !== undefined && explicit !== savedTemplate ? explicit : undefined;
  const id = explicit ?? new URLSearchParams(search).get("template");
  if (id === "original" || !id) return "";
  if (!worldTemplate(id)) throw new Error("未知世界风格：" + id);
  return id;
}

/** Author the sand surface on new desert template documents. */
export function applyPlanningTemplateSurface(document: PlanningDocument): void {
  const components = document.entities.world.components;
  if (components.worldTemplate?.values.id !== "titan-wasteland") return;
  const terrain = (components.terrain ??= { values: {} });
  Object.assign(terrain.values, {
    roadSurfacePattern: true,
    surfaceNormalTextureUrl: mojaveAssets.surface.rippleNormal,
    surfaceTileM: 12,
    surfaceNormalScale: 1,
    surfaceMicroNormalTextureUrl: mojaveAssets.surface.microNormal
  });
  applyDesertLayout(document);
}

/** Refresh local saves from the unreleased Low Poly preview without replacing edited values. */
export function refreshLowPolyPreview(document: PlanningDocument): void {
  const { worldTemplate, lighting, postProcess, terrain, layout, landscape, wayfinding, surfacePalette } =
    document.entities.world.components;
  if (worldTemplate?.values.id !== "low-poly") return;
  const previousLight = {
    sunIntensity: 1.75, sunColorR: 1, sunColorG: 0.95, sunColorB: 0.86,
    ambientIntensity: 1.48, iblIntensity: 1.12, skyExposure: 1.02,
    skyTintR: 0.214, skyTintG: 0.214, skyTintB: 0.214,
    groundTintR: 0.18, groundTintG: 0.18, groundTintB: 0.2,
    customSkyTintStrength: 1, customSkyZenithR: 0.61, customSkyZenithG: 1.17, customSkyZenithB: 1.76,
    customSkyHorizonR: 0.95, customSkyHorizonG: 1.37, customSkyHorizonB: 1.72,
    shadowStrength: 0.72, fogDensity: 0.0034, fogExponent: 2
  };
  const previousPost = {
    enabled: true, tonemapping: true, bloom: false, postExposure: 0.13, temperature: 17,
    contrast: 12, saturation: 5
  };
  const art = WORLD_TEMPLATE_ART["low-poly"];
  const texture = terrain?.values.surfaceBaseTextureUrl;
  if (terrain && !terrain.base && typeof texture === "string" &&
      /\/(painted-meadow|matte-meadow|meadow-blocks)(?:-[\w-]+)?\.jpg(?:\?.*)?$/.test(texture))
    terrain.values.surfaceBaseTextureUrl = art.surfaceTextures!.baseUrl;
  // Only the preview carried the explicit atmosphere gradient. Fresh saves already inherit the curve.
  if (lighting?.base || lighting?.values.customSkyTintStrength !== 1 ||
      lighting.values.customSkyZenithB !== 1.76) return;
  for (const [key, value] of Object.entries(previousLight))
    if (lighting.values[key] === value) delete lighting.values[key];
  if (postProcess && !postProcess.base)
    for (const [key, value] of Object.entries(previousPost))
      if (postProcess.values[key] === value) delete postProcess.values[key];
  const components = document.entities.world.components;
  if (!layout?.base) (components.layout ??= { values: {} }).values.memberMax ??= art.initialPlanning?.poiMemberMax;
  if (!wayfinding?.base)
    (components.wayfinding ??= { values: {} }).values.routeCoverage ??= art.initialPlanning?.wayfinding?.routeCoverage;
  if (landscape && !landscape.base && landscape.values.density === 0.65) landscape.values.density = 0;
  const roadFields = ["road.r", "road.g", "road.b"];
  if (surfacePalette && !surfacePalette.base &&
      templateLinearColor("#dc8b54").every((value, i) => value === surfacePalette.values[roadFields[i]]))
    templateLinearColor(art.road!).forEach((value, i) => (surfacePalette.values[roadFields[i]] = value));
}

/** Refreshes an older desert preview that still carries the original template relief values. */
export function updateDesertPreviewRelief(document: PlanningDocument): void {
  const { worldTemplate, terrain } = document.entities.world.components;
  if (worldTemplate?.values.id !== "titan-wasteland" || !terrain) return;
  const values = terrain.values;
  if (
    values.reliefNearAmplitudeM !== 9 ||
    values.reliefAmplitudeM !== 35 ||
    values.reliefFarAmplitudeM !== 110 ||
    values.reliefScaleM !== 256
  )
    return;
  Object.assign(values, WORLD_TEMPLATE_ART["titan-wasteland"].initialPlanning?.relief);
}

/** Author a richer starting area on top of the ordinary Seed planner. */
function applyDesertLayout(document: PlanningDocument): void {
  const components = document.entities.world.components;
  if (components.worldTemplate?.values.id !== "titan-wasteland") return;
  const terrain = (components.terrain ??= { values: {} });
  Object.assign(terrain.values, {
    reliefNearAmplitudeM: 13,
    reliefAmplitudeM: 16,
    reliefFarAmplitudeM: 24,
    reliefScaleM: 80
  });

  const recipe = exportPlanningRecipe(document);
  const plan = createSpatialTerrainPlan(recipe);
  const { width, depth, seed } = plan.parameters;
  const centerX = width / 2;
  const centerZ = depth / 2;
  const { candidates } = distributePois(
    {
      width,
      depth,
      seed,
      domains: [
        { id: "land-main", outline: plan.land },
        ...plan.islands.map((outline, index) => ({ id: `offshore-${index}`, outline }))
      ]
    },
    recipe.parameters.poiLayout ?? defaultPoiLayout()
  );
  for (const { id, origin, domainId } of candidates) {
    if (domainId !== "land-main" || Math.hypot(origin.x - centerX, origin.z - centerZ) > 190) continue;
    const poi = (document.entities[id] ??= { id, name: id, parent: "world", origin: "generated", components: {} });
    const layout = (poi.components.layout ??= { values: {} });
    Object.assign(layout.values, {
      widthMinM: 16,
      widthMaxM: 42,
      depthMinM: 13,
      depthMaxM: 34,
      heightMinM: 7,
      heightMaxM: 18
    });
  }

  // Seeded terrain features form a distant skyline from the central starting area.
  const mountainPrefix = "template:titan-wasteland:ridge:";
  const resources = (document.authoredResources ?? []).filter((item) => !item.resourceId.startsWith(mountainPrefix));
  const range = (id: string, axis: string, minimum: number, maximum: number) =>
    minimum + (maximum - minimum) * settlementRandom(seed, `${id}:${axis}`);
  const ridgeCount = 7;
  for (let index = 0; index < ridgeCount; index++) {
    const id = mountainPrefix + index;
    const bearing = (index * 360) / ridgeCount + range(id, "bearing", -12, 12);
    const angle = (bearing * Math.PI) / 180;
    const distance = range(id, "distance", 235, 290);
    resources.push({
      resourceId: id,
      resourceType: "terrain-feature",
      properties: {
        kind: "ridge",
        x: centerX + Math.cos(angle) * distance,
        z: centerZ + Math.sin(angle) * distance,
        headingDegrees: (360 - bearing) % 360,
        lengthMetres: range(id, "length", 100, 175),
        widthMetres: range(id, "width", 52, 88),
        elevationDeltaMetres: range(id, "height", 31, 49),
        sharpness: 0.56,
        asymmetry: 0.48,
        roughness: 0.29,
        erosion: 0.24,
        seed: Math.floor(range(id, "shape", 0, 0x1_0000_0000))
      }
    });
  }
  document.authoredResources = resources;
}
