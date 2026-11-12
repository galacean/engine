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
import { TEMPLATE_SPAWN_POI_ID, WORLD_TEMPLATE_CONFIGS } from "./WorldTemplateConfig";
import { defaultPoiLayout, distributePois } from "../semantic-study/PoiDistribution";
import { spatialCompositionParameters } from "./SpatialCompositionParameters";
import { createSpatialTerrainPlan } from "./layout/SpatialTerrain";
import { createPlanningGroundSampler } from "../semantic-study/WorldPlanningTerrain";
import { planWorldTemplateSite } from "./WorldTemplatePlanning";
import type { PlanningResource } from "./PlanningResources";
import type { SpatialEntity } from "./SpatialDocument";
import { LAKE_DEFAULTS } from "./hydrology/LakeRegions";
import profile from "../planning-data/settlement-profile.json";
/** Clear the camel preset previously saved by the desert preview. */
export function removeDesertCamelPreset(document: PlanningDocument): void {
  const components = document.entities.world.components;
  const animals = components.animals;
  if (components.worldTemplate?.values.id !== "titan-wasteland" || !animals || animals.base) return;
  const { values } = animals;
  if (
    values["species.min"] === 1 &&
    values["species.max"] === 1 &&
    values["species.camel.min"] === 4 &&
    values["species.camel.max"] === 4
  )
    animals.values = { enabled: false };
}

/** World material fields shared by first creation and palette-only authoring edits. */
export function worldTemplatePaletteValues(id: string, seed?: number): Record<string, Record<string, number>> {
  if (!worldTemplate(id)) throw new Error("未知世界风格：" + id);
  const art = WORLD_TEMPLATE_ART[id];
  const colorFields = (slot: string, hex?: string, key?: "ground" | "road" | "stone") => {
    const range = key && WORLD_TEMPLATE_CONFIGS[id]?.palette?.ranges?.[key];
    const base = hex ?? (range ? range[0] : undefined);
    if (!base) return {};
    let color: readonly number[] = templateLinearColor(base);
    if (range && seed !== undefined) {
      const from = templateLinearColor(range[0]);
      const to = templateLinearColor(range[1]);
      const t = settlementRandom(seed, `template:${id}:palette:${key}`);
      color = from.map((value, i) => value + (to[i] - value) * t);
    }
    return Object.fromEntries(["r", "g", "b"].map((channel, i) => [slot + "." + channel, color[i]]));
  };
  const groups = {
    rockFormation: colorFields("color", art.stone, "stone"),
    grassAppearance: art.grass
      ? { ...colorFields("colorA", art.grass[0]), ...colorFields("colorB", art.grass[1]), saturation: 1 }
      : {},
    surfacePalette: { ...colorFields("color", art.ground, "ground"), ...colorFields("road", art.road, "road") },
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
        const base = swatch?.color ?? fallback;
        if (!base) return [];
        const color = templateLinearColor(base).map((channel) => channel * (swatch?.intensity ?? 1));
        return (["r", "g", "b"] as const).map((channel, i) => [
          plantMaterialField(slot.assetId, slot.materialId, channel),
          color[i]
        ]);
      })
    )
  };
  return Object.fromEntries(Object.entries(groups).filter(([, fields]) => Object.keys(fields).length > 0));
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
  const anchor = planWorldTemplateSite(base, createPlanningGroundSampler(base, { natural: true }))?.center ?? {
    x: base.parameters.width / 2,
    z: base.parameters.depth / 2
  };
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

function createConfiguredTemplate(seed: number, id: string, options?: PlanningPopulationOptions): PlanningDocument {
  const { spawn, spawnPoi } = WORLD_TEMPLATE_CONFIGS[id]!;
  const document = createSeedPlanningInputs(seed);
  const components = document.entities.world.components;
  const subject = spawn?.subject;
  components.worldTemplate = {
    values: { id, ...(subject && { centerX: subject.position.x, centerZ: subject.position.z }) }
  };
  for (const [type, values] of Object.entries(worldTemplatePaletteValues(id, seed)))
    components[type] = { ...components[type], values: { ...components[type]?.values, ...values } };
  if (!spawn || !spawnPoi) return initializePlanningPopulation(document, options);

  const recipe = exportPlanningRecipe(document);
  const terrain = createSpatialTerrainPlan(recipe);
  const poiLayout = recipe.parameters.poiLayout ?? defaultPoiLayout();
  const { candidates } = distributePois(
    {
      width: terrain.parameters.width,
      depth: terrain.parameters.depth,
      seed,
      domains: [
        { id: "land-main", outline: terrain.land },
        ...terrain.islands.map((outline, i) => ({ id: `offshore-${i}`, outline }))
      ]
    },
    poiLayout
  );
  const sample = (key: string, [min, max]: readonly number[]) => {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max)
      throw new Error(`模板出生点 POI 参数范围无效：${key}`);
    return min + (max - min) * settlementRandom(seed, `template:${id}:spawnPoi:${key}`);
  };
  document.passthrough.parameters.poiLayout!.candidates = [
    ...candidates,
    { id: TEMPLATE_SPAWN_POI_ID, origin: spawn.position, domainId: "land-main" }
  ];
  const layout =
    spawnPoi.layout &&
    Object.fromEntries(
      Object.entries(spawnPoi.layout).map(([key, value]) => [
        key,
        typeof value === "object" ? sample(key, value) : value
      ])
    );
  document.entities[TEMPLATE_SPAWN_POI_ID] = {
    id: TEMPLATE_SPAWN_POI_ID,
    name: "出生点",
    parent: "world",
    origin: "generated",
    components: {
      anchor: { values: { ...spawn.position } },
      ...(spawnPoi.sizeWeight && { poi: { values: { sizeWeight: sample("sizeWeight", spawnPoi.sizeWeight) } } }),
      ...(layout && { layout: { values: layout } }),
      ...(spawnPoi.landscape && {
        landscape: {
          values: Object.fromEntries(
            Object.entries(spawnPoi.landscape).map(([key, range]) => [key, sample(`landscape:${key}`, range)])
          )
        }
      })
    }
  };
  const initialized = initializePlanningPopulation(document, options);
  if (layout) Object.assign(initialized.entities[TEMPLATE_SPAWN_POI_ID].components.layout.values, layout);
  return initialized;
}

/** Create template authoring with a one-time editable initial population.
 * @param seed Deterministic world identity.
 * @param id Registered template identity.
 * @param options Initial population request, applied after template terrain and resources are installed.
 * @returns Authoring for ordinary Session publication.
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
  if (WORLD_TEMPLATE_CONFIGS[id]) return createConfiguredTemplate(seed, id, options);
  const initial = createSeedPlanningInputs(seed);
  const recipe = exportPlanningRecipe(initial);
  const jitter = (field: string) => settlementRandom(seed, `template:${id}:${field}`) * 2 - 1;
  const terrain = template.terrain;
  Object.assign(recipe.parameters, {
    worldTemplate: { id },
    landformSeed: art.initialPlanning?.relief ? seed : templateBaseSeed(id),
    landMode: art.initialPlanning?.landMode,
    ...art.initialPlanning?.relief,
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
  if (!art.plannedSubjects) Object.assign(recipe.parameters.worldTemplate!, { centerX: anchor.x, centerZ: anchor.z });
  if (art.generation)
    recipe.parameters.spatialComposition = spatialCompositionParameters({
      ...art.generation,
      seed: templateBaseSeed(id),
      centerX: anchor.x,
      centerZ: anchor.z
    });
  if (art.surfaceTextures) {
    const { baseUrl, normalUrl, tileSizeM, strength } = art.surfaceTextures;
    recipe.parameters.terrainSurface = {
      baseTextureUrl: baseUrl,
      normalTextureUrl: normalUrl,
      tileMetres: tileSizeM,
      normalScale: strength
    };
  }
  const document = importPlanningDocument(recipe);
  document.samplingVersion = initial.samplingVersion;
  document.waterAuthoringVersion = 1;
  const components = document.entities.world.components;
  if (art.layout) components.layout = { values: { ...art.layout } };
  if (art.initialPlanning?.roadsEnabled !== undefined)
    components.network.values.enabled = art.initialPlanning.roadsEnabled;
  if (art.initialPlanning?.farmingEnabled !== undefined)
    components.farming.values.enabled = art.initialPlanning.farmingEnabled;
  for (const [type, values] of Object.entries(worldTemplatePaletteValues(id)))
    components[type] = { ...components[type], values: { ...components[type]?.values, ...values } };
  if (art.grassGroundFusion !== undefined) {
    const appearance = (components.grassAppearance ??= { values: {} });
    appearance.values.groundFusion = art.grassGroundFusion;
  }
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
  const initialized = initializePlanningPopulation(document, { ...art.initialPlanning?.population, ...options });
  if (art.initialPlanning?.poiMemberMax !== undefined) {
    const layout = (initialized.entities.world.components.layout ??= { values: {} });
    layout.values.memberMax = art.initialPlanning.poiMemberMax;
  }
  return initialized;
}

/** Apply a reference recipe while retaining independently authored plant controls.
 * Lighting presets now belong to the selected reference. New Seeds still retain
 * subsequent manual lighting edits through the ordinary layout-scope contract.
 * @param source Existing independent presentation and ecology authoring to retain.
 * @param seed New deterministic world identity.
 * @param id Template identity, or an empty string for the original procedural world.
 * @param options Inherited population ranges for fields the new style does not specify.
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
  const population = { ...options, ...WORLD_TEMPLATE_ART[id]?.initialPlanning?.population };
  const document = id
    ? createTemplatePlanningDocument(seed, id, population)
    : createSeedPlanningDocument(seed, options);
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
  if (
    retainComposition &&
    !WORLD_TEMPLATE_CONFIGS[id] &&
    source.entities.world.components.worldTemplate?.values.id === id
  )
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
