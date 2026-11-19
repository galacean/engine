import { exportPlanningRecipe, type PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { createTemplatePlanningDocument } from "@galacean/engine-world-planning/spatial/WorldTemplateAuthoring";
import { templateLinearColor, worldTemplate } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";
import { WORLD_TEMPLATE_ART } from "@galacean/engine-world-planning/spatial/WorldTemplateArtDirection";
import {
  planningStartupSeed,
  randomPlanningSeed,
  selectPlanningStartupTemplate,
  selectedPlanningStartupTemplate
} from "./PlanningStartupSeed.ts";
export { planningStartupSeed, randomPlanningSeed, selectPlanningStartupTemplate };

/** Resolve new authoring without replacing a saved world's later edits on refresh.
 * @param search Current page query, carrying the initial template for a new world.
 * @param seed World identity being opened.
 * @param savedTemplate Saved template identity, empty for the original world, undefined if absent.
 * @returns Template to initialize, or undefined to restore the saved document.
 */
export function initialPlanningTemplate(search: string, seed: number, savedTemplate?: string): string | undefined {
  const selection = selectedPlanningStartupTemplate();
  const explicit = selection?.seed === seed ? selection.id : undefined;
  if (savedTemplate === "" || worldTemplate(savedTemplate)) {
    return explicit !== undefined && explicit !== savedTemplate ? explicit : undefined;
  }
  const id = explicit ?? new URLSearchParams(search).get("template");
  if (id === "original" || !id) return "";
  if (!worldTemplate(id)) throw new Error("未知世界风格：" + id);
  return id;
}

/** Authoring is now owned natively by WorldTemplateAuthoring + WORLD_TEMPLATE_ART. */
export function applyPlanningTemplateSurface(_document: PlanningDocument): void {}

/** Refresh local saves from the unreleased Low Poly preview without replacing edited values. */
export function refreshLowPolyPreview(document: PlanningDocument): boolean {
  const { worldTemplate, lighting, postProcess, terrain, layout, landscape, wayfinding, surfacePalette } =
    document.entities.world.components;
  if (worldTemplate?.values.id !== "low-poly") return false;
  const previousLight = {
    sunIntensity: 1.75,
    sunColorR: 1,
    sunColorG: 0.95,
    sunColorB: 0.86,
    ambientIntensity: 1.48,
    iblIntensity: 1.12,
    skyExposure: 1.02,
    skyTintR: 0.214,
    skyTintG: 0.214,
    skyTintB: 0.214,
    groundTintR: 0.18,
    groundTintG: 0.18,
    groundTintB: 0.2,
    customSkyTintStrength: 1,
    customSkyZenithR: 0.61,
    customSkyZenithG: 1.17,
    customSkyZenithB: 1.76,
    customSkyHorizonR: 0.95,
    customSkyHorizonG: 1.37,
    customSkyHorizonB: 1.72,
    shadowStrength: 0.72,
    fogDensity: 0.0034,
    fogExponent: 2
  };
  const previousPost = {
    enabled: true,
    tonemapping: true,
    bloom: false,
    postExposure: 0.13,
    temperature: 17,
    contrast: 12,
    saturation: 5
  };
  const art = WORLD_TEMPLATE_ART["low-poly"];
  const texture = terrain?.values.surfaceBaseTextureUrl;
  if (
    terrain &&
    !terrain.base &&
    typeof texture === "string" &&
    /\/(painted-meadow|matte-meadow|meadow-blocks)(?:-[\w-]+)?\.jpg(?:\?.*)?$/.test(texture)
  )
    terrain.values.surfaceBaseTextureUrl = art.surfaceTextures!.baseUrl;
  // Only the preview carried the explicit atmosphere gradient. Fresh saves already inherit the curve.
  if (!lighting?.base && lighting?.values.customSkyTintStrength === 1 && lighting.values.customSkyZenithB === 1.76) {
    for (const [key, value] of Object.entries(previousLight))
      if (lighting.values[key] === value) delete lighting.values[key];
    if (postProcess && !postProcess.base)
      for (const [key, value] of Object.entries(previousPost))
        if (postProcess.values[key] === value) delete postProcess.values[key];
    const components = document.entities.world.components;
    if (!layout?.base) (components.layout ??= { values: {} }).values.memberMax ??= art.initialPlanning?.poiMemberMax;
    if (!wayfinding?.base)
      (components.wayfinding ??= { values: {} }).values.routeCoverage ??=
        art.initialPlanning?.wayfinding?.routeCoverage;
    if (landscape && !landscape.base && landscape.values.density === 0.65) landscape.values.density = 0;
    const roadFields = ["road.r", "road.g", "road.b"];
    if (
      surfacePalette &&
      !surfacePalette.base &&
      templateLinearColor("#dc8b54").every((value, i) => value === surfacePalette.values[roadFields[i]])
    )
      templateLinearColor(art.road!).forEach((value, i) => (surfacePalette.values[roadFields[i]] = value));
    lighting.values.timeHours ??= 14.6;
  }

  // Upgrade unedited initial Low Poly saves to the refined reference palette, sky, and clouds.
  const isInitialLowPoly =
    lighting &&
    !lighting.base &&
    ((lighting.values.northOffsetDegrees === undefined &&
      lighting.values.timeHours === 14.6 &&
      Object.keys(lighting.values).length === 1) ||
      (lighting.values.northOffsetDegrees === 211 &&
        (lighting.values.skyExposure === 0.72 ||
          lighting.values.skyExposure === 0.98 ||
          postProcess?.values.postExposure === 0.04 ||
          postProcess?.values.postExposure === 0.78)));
  if (isInitialLowPoly) {
    const seed = exportPlanningRecipe(document).parameters.seed;
    const fresh = createTemplatePlanningDocument(seed, "low-poly");
    const freshWorld = fresh.entities.world.components;
    const components = document.entities.world.components;
    for (const key of [
      "lighting",
      "postProcess",
      "weather",
      "grassAppearance",
      "surfacePalette",
      "rockFormation",
      "plantMaterial",
      "landscape",
      "flowers"
    ] as const) {
      if (freshWorld[key] && !components[key]?.base) {
        components[key] = structuredClone(freshWorld[key]);
      }
    }
    const params = document.passthrough?.parameters;
    if (params && params.reliefNearAmplitudeM === 1 && params.reliefAmplitudeM === 5) {
      Object.assign(params, art.initialPlanning?.relief);
    }
  }
  const pondId = "lake:authored:template:low-poly:water:valley-pond";
  const pond = document.entities[pondId];
  const shoreline = pond?.components.lakes?.values.shoreline;
  const legacyAnchor = worldTemplate.values.centerX !== 512 || worldTemplate.values.centerZ !== 512;
  if (legacyAnchor || (pond?.origin === "generated" && Array.isArray(shoreline) && shoreline.length !== 60)) {
    const seed = exportPlanningRecipe(document).parameters.seed;
    const fresh = createTemplatePlanningDocument(seed, "low-poly");
    const freshWorld = fresh.entities.world.components;
    worldTemplate.values = structuredClone(freshWorld.worldTemplate.values);
    const composition = document.entities.world.components.landscapeComposition;
    if (composition && !composition.base && freshWorld.landscapeComposition) {
      composition.values.centerX = freshWorld.landscapeComposition.values.centerX;
      composition.values.centerZ = freshWorld.landscapeComposition.values.centerZ;
    }
    if (document.passthrough?.parameters) {
      Object.assign(document.passthrough.parameters, art.initialPlanning?.relief);
      document.passthrough.parameters.worldTemplate = structuredClone(
        exportPlanningRecipe(fresh).parameters.worldTemplate
      );
      if (document.passthrough.parameters.spatialComposition) {
        document.passthrough.parameters.spatialComposition.centerX = 512;
        document.passthrough.parameters.spatialComposition.centerZ = 512;
      }
    }
    if (fresh.entities[pondId] && (!pond || pond.origin === "generated")) {
      document.entities[pondId] = structuredClone(fresh.entities[pondId]);
    }
    return true;
  }
  return false;
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
