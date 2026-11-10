import {
  createSeedPlanningDocument,
  createSeedPlanningInputs,
  initializePlanningPopulation,
  type PlanningPopulationOptions
} from "./PlanningInitialization";
import { exportPlanningRecipe, importPlanningDocument, type PlanningDocument } from "./PlanningDocument";
import { PLANT_MATERIAL_SLOTS, plantMaterialField } from "./PlantMaterialParameters";
import { settlementRandom } from "../semantic-study/SettlementGeometry";
import { templateBaseSeed, templateLinearColor, worldTemplate, type WorldTemplate } from "./WorldTemplateCatalog";
import { WORLD_TEMPLATE_ART } from "./WorldTemplateArtDirection";
import { spatialCompositionParameters } from "./SpatialCompositionParameters";
import { createSpatialTerrainPlan } from "./layout/SpatialTerrain";
import { createPlanningGroundSampler } from "../semantic-study/WorldPlanningTerrain";
import { planWorldTemplateSite } from "./WorldTemplatePlanning";
import type { PlanningResource } from "./PlanningResources";
import type { SpatialEntity } from "./SpatialDocument";
import { LAKE_DEFAULTS } from "./hydrology/LakeRegions";
import profile from "../planning-data/settlement-profile.json";

/** World material fields shared by first creation and palette-only authoring edits. */
export function worldTemplatePaletteValues(id: string): Record<string, Record<string, number>> {
  if (!worldTemplate(id)) throw new Error("未知世界风格：" + id);
  const art = WORLD_TEMPLATE_ART[id];
  if (!art.grass) return {};
  const colorFields = (slot: string, hex: string) =>
    Object.fromEntries(
      (["r", "g", "b"] as const).map((channel, i) => [slot + "." + channel, templateLinearColor(hex)[i]])
    );
  return {
    rockFormation: colorFields("color", art.stone),
    grassAppearance: { ...colorFields("colorA", art.grass[0]), ...colorFields("colorB", art.grass[1]), saturation: 1 },
    surfacePalette: { ...colorFields("color", art.ground), ...(art.road ? colorFields("road", art.road) : {}) },
    plantMaterial: Object.fromEntries(
      PLANT_MATERIAL_SLOTS.flatMap((slot) => {
        const palette = art.plantPalette;
        const swatch =
          palette?.slots?.[slot.assetId]?.[slot.materialId] ??
          (slot.layers.some((layer) => palette?.layers.includes(layer))
            ? (palette?.species?.[slot.assetId]?.[slot.part] ?? palette?.parts[slot.part])
            : undefined);
        const fallback =
          slot.part === "bark"
            ? art.bark
            : ["petals", "cap"].includes(slot.part)
              ? art.flowers
              : slot.role === "leaf" && slot.layers.includes("trees")
                ? (art.treeFoliage?.[slot.assetId] ?? art.foliage)
                : art.foliage;
        const color = templateLinearColor(swatch?.color ?? fallback).map(
          (channel) => channel * (swatch?.intensity ?? 1)
        );
        return (["r", "g", "b"] as const).map((channel, i) => [
          plantMaterialField(slot.assetId, slot.materialId, channel),
          color[i]
        ]);
      })
    )
  };
}

/** The canonical physical recipe is common to every Seed variation. Retain only
 * its measured author inputs, never a generated world, raster or live object. */
const cores = new Map<
  string,
  { anchor: { x: number; z: number }; resources: PlanningResource[]; lakes: SpatialEntity[] }
>();
function templateCore(template: WorldTemplate) {
  const cached = cores.get(template.id);
  if (cached) return cached;
  const { id, terrain } = template,
    art = WORLD_TEMPLATE_ART[id];
  const canonical = exportPlanningRecipe(createSeedPlanningInputs(templateBaseSeed(id)));
  Object.assign(canonical.parameters, {
    worldTemplate: { id },
    ...(art.generation
      ? { spatialComposition: { ...art.generation, enabled: false, seed: templateBaseSeed(id) } }
      : {}),
    landformSeed: templateBaseSeed(id),
    landMode: art.initialPlanning?.landMode,
    landCoverage: terrain.coverage,
    complexity: 0.6,
    offshoreCoverage: 0.07,
    islandRichness: 0.5,
    terrainSkeleton: {
      countMin: terrain.count,
      countMax: terrain.count,
      directionDegrees: 45,
      lengthM: 600,
      heightM: terrain.heightM,
      widthM: terrain.widthM
    },
    rivers: { countMin: 0, countMax: 0 },
    lakes: { countMin: 0, countMax: 0 }
  });
  const base = createSpatialTerrainPlan(canonical);
  const anchor = planWorldTemplateSite(base, createPlanningGroundSampler(base, { natural: true }))!.center;
  const resources: PlanningResource[] = (art.terrain ?? []).map((feature) => ({
    resourceId: `template:${id}:terrain:${feature.id}`,
    resourceType: "terrain-feature" as const,
    properties: {
      kind: feature.kind,
      x: anchor.x - feature.x,
      z: anchor.z + feature.z,
      headingDegrees: 0 - feature.heading,
      lengthMetres: feature.length,
      widthMetres: feature.width,
      elevationDeltaMetres: feature.height,
      sharpness: 0.6,
      asymmetry: 0.5,
      roughness: 0.15,
      erosion: 0.25,
      seed: templateBaseSeed(`${id}:${feature.id}`)
    }
  }));
  const lakes: SpatialEntity[] = (art.water ?? []).map((pool) => {
    const lakeId = `lake:authored:template:${id}:water:${pool.id}`;
    const shoreline = Array.from({ length: 96 }, (_, i) => {
      const angle = (i * 2 * Math.PI) / 96;
      return {
        id: `${lakeId}:shore:${i}`,
        ring: "shore",
        x: anchor.x - pool.x + Math.cos(angle) * pool.radius,
        z: anchor.z + pool.z + Math.sin(angle) * pool.radius
      };
    });
    return {
      id: lakeId,
      name: pool.id,
      parent: "world",
      origin: "generated",
      components: {
        lakes: {
          base: { entity: "world", component: "lakes" },
          values: { ...LAKE_DEFAULTS, count: 0, radiusM: pool.radius, depthM: pool.depth, shoreline, referenceLevel: 0 }
        }
      }
    };
  });
  for (const grove of art.plantings ?? [])
    resources.push({
      resourceType: "vegetation-brush",
      resourceId: `template:${id}:vegetation:${grove.id}`,
      properties: {
        category: grove.kind,
        plantKind: grove.kind,
        distributionKind: "area",
        x: anchor.x - grove.x,
        z: anchor.z + grove.z,
        radiusMetres: grove.radius,
        densityScale: grove.densityScale,
        seed: templateBaseSeed(`${id}:${grove.id}`)
      }
    });
  const core = { anchor, resources, lakes };
  cores.set(id, core);
  return core;
}

/** Create template authoring with a one-time editable initial population.
 * @param seed Deterministic world identity.
 * @param id Registered template identity.
 * @param options Initial population request, applied after template terrain and resources are installed.
 * @returns Authoring for ordinary Session publication; later edits do not reapply the budget.
 * @throws For invalid template/seed or an unrealizable population request.
 */
export function createTemplatePlanningDocument(
  seed: number,
  id: string,
  options?: PlanningPopulationOptions
): PlanningDocument {
  const template = worldTemplate(id);
  if (!template) throw new Error("未知世界风格：" + id);
  const art = WORLD_TEMPLATE_ART[id];
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Seed 须为 0–4294967295 的整数");
  const initial = createSeedPlanningInputs(seed);
  const recipe = exportPlanningRecipe(initial);
  const jitter = (field: string) => settlementRandom(seed, `template:${id}:${field}`) * 2 - 1;
  const terrain = template.terrain;
  Object.assign(recipe.parameters, {
    worldTemplate: { id },
    landformSeed: templateBaseSeed(id),
    landMode: art.initialPlanning?.landMode,
    landCoverage: terrain.coverage * (1 + jitter("coverage") * 0.02),
    complexity: 0.6 + jitter("coast") * 0.03,
    offshoreCoverage: 0.07,
    islandRichness: 0.5,
    terrainSkeleton: {
      countMin: terrain.count,
      countMax: terrain.count,
      directionDegrees: 45 + jitter("direction") * 3,
      lengthM: 600,
      heightM: terrain.heightM * (1 + jitter("height") * 0.06),
      widthM: terrain.widthM * (1 + jitter("width") * 0.04)
    },
    rivers: { countMin: 0, countMax: 0 },
    lakes: { countMin: 0, countMax: 0 }
  });
  const { anchor, resources, lakes } = templateCore(template);
  recipe.parameters.worldTemplate = { id, centerX: anchor.x, centerZ: anchor.z };
  if (art.generation)
    recipe.parameters.spatialComposition = spatialCompositionParameters({
      ...art.generation,
      seed: templateBaseSeed(id),
      centerX: anchor.x,
      centerZ: anchor.z
    });
  const document = importPlanningDocument(recipe);
  document.samplingVersion = initial.samplingVersion;
  document.waterAuthoringVersion = 1;
  const components = document.entities.world.components;
  if (art.initialPlanning?.roadsEnabled !== undefined)
    components.network.values.enabled = art.initialPlanning.roadsEnabled;
  for (const [type, values] of Object.entries(worldTemplatePaletteValues(id)))
    components[type] = { ...components[type], values: { ...components[type]?.values, ...values } };
  components.lighting = { values: { ...art.lighting } };
  components.postProcess = { values: { ...art.postProcess } };
  components.weather = {
    values: {
      cloudCoverage: 0.45,
      rainRate: 0,
      snowRate: 0,
      temperatureCelsius: 22,
      relativeHumidity: 0.38,
      ...art.weather
    }
  };
  Object.assign(components.landscape.values, art.landscape, art.initialLandscape);
  if (art.flowerCoverage !== undefined) components.flowers.values.coverage = art.flowerCoverage;
  Object.assign(components.flowers.values, art.initialFlowers);
  components.animals = { values: { enabled: false } };
  document.authoredResources = structuredClone(resources);
  // Template lakes enter the same native Source conversion as generated lakes.
  // Resolve their datum against this Seed's terrain before publishing the shape.
  const terrainPlan = createSpatialTerrainPlan(exportPlanningRecipe(document));
  const ground = createPlanningGroundSampler(terrainPlan, {
    natural: true
  });
  for (const input of lakes) {
    const lake = structuredClone(input);
    const values = lake.components.lakes.values;
    const shoreline = values.shoreline as { x: number; z: number }[];
    const center = {
      x: shoreline.reduce((sum, p) => sum + p.x, 0) / shoreline.length,
      z: shoreline.reduce((sum, p) => sum + p.z, 0) / shoreline.length
    };
    values.radiusM = Math.max(...shoreline.map((p) => Math.hypot(p.x - center.x, p.z - center.z)));
    const spacing = terrainPlan.parameters.width / (profile.world.heightmapResolution - 1);
    const spacingZ = terrainPlan.parameters.depth / (profile.world.heightmapResolution - 1);
    let level = Math.min(...shoreline.map((point) => ground(point)));
    const x0 = (Math.floor(Math.min(...shoreline.map((p) => p.x)) / spacing) - 2) * spacing;
    const z0 = (Math.floor(Math.min(...shoreline.map((p) => p.z)) / spacingZ) - 2) * spacingZ;
    const x1 = Math.max(...shoreline.map((p) => p.x)) + spacing * 3;
    const z1 = Math.max(...shoreline.map((p) => p.z)) + spacingZ * 3;
    for (let z = z0; z <= z1; z += spacingZ)
      for (let x = x0; x <= x1; x += spacing) level = Math.min(level, ground({ x, z }));
    values.referenceLevel = Math.fround(level) - 0.001;
    document.entities[lake.id] = lake;
  }
  return initializePlanningPopulation(document, { ...art.initialPlanning?.population, ...options });
}

/** Apply a reference recipe while retaining independently authored plant controls.
 * Lighting presets now belong to the selected reference. New Seeds still retain
 * subsequent manual lighting edits through the ordinary layout-scope contract.
 * @param source Existing independent presentation and ecology authoring to retain.
 * @param seed New deterministic world identity.
 * @param id Template identity, or an empty string for the original procedural world.
 * @param options One-time initialization village target and global building upper bound.
 * @param retainComposition Preserve the current template's edited composition when varying the Seed.
 * @returns New authoring whose population is controlled by editable per-POI profile and spacing values.
 * @throws For invalid initialization inputs or an unrealizable population request.
 */
export function createWorldStylePlanningDocument(
  source: PlanningDocument,
  seed: number,
  id: string,
  options?: PlanningPopulationOptions,
  retainComposition = false
): PlanningDocument {
  const document = id ? createTemplatePlanningDocument(seed, id, options) : createSeedPlanningDocument(seed, options);
  const copied = new Set<string>();
  const retain = (entityId: string, type: string) => {
    const key = JSON.stringify([entityId, type]);
    if (copied.has(key)) return;
    copied.add(key);
    const entity = source.entities[entityId],
      component = entity?.components[type];
    if (!component) {
      if (document.entities[entityId]) delete document.entities[entityId].components[type];
      return;
    }
    document.entities[entityId] ??= { ...structuredClone(entity), components: {} };
    document.entities[entityId].components[type] = structuredClone(component);
    if (component.base) retain(component.base.entity, component.base.component);
  };
  for (const type of [...(id ? [] : ["lighting", "postProcess"]), "landscape", "landscapePopulation", "flowers"])
    retain("world", type);
  if (retainComposition && source.entities.world.components.worldTemplate?.values.id === id)
    retain("world", "landscapeComposition");
  if (id) {
    const art = WORLD_TEMPLATE_ART[id],
      components = document.entities.world.components;
    components.landscape ??= { values: {} };
    Object.assign(components.landscape.values, art.landscape);
    if (art.flowerCoverage !== undefined) {
      components.flowers ??= { values: {} };
      components.flowers.values.coverage = art.flowerCoverage;
    }
  }
  return document;
}
