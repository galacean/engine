import {
  createSeedPlanningDocument,
  createSeedPlanningInputs,
  preparePlanningPopulation,
  type PlanningPopulationOptions
} from "./PlanningInitialization";
import {
  exportPlanningAuthoring,
  exportPlanningRecipe,
  importPlanningDocument,
  type PlanningDocument
} from "./PlanningDocument";
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
function templateAnimalValues(id: string, anchor: { x: number; z: number }): Record<string, unknown> {
  const { animals } = WORLD_TEMPLATE_ART[id];
  if (!animals) return { enabled: false };
  const { "birdCount.offsetX": x, "birdCount.offsetZ": z, ...values } = structuredClone(animals);
  if (typeof x === "number" && typeof z === "number") {
    values["birdCount.centerX"] = anchor.x - x;
    values["birdCount.centerZ"] = anchor.z + z;
  }
  return values;
}

/** Upgrade the retired desert preview populations when opening a saved seed in the editor or the world. */
export function refreshDesertAnimalPreset(document: PlanningDocument): void {
  const components = document.entities.world.components;
  const template = worldTemplate(components.worldTemplate?.values.id);
  if (template?.id !== "titan-wasteland" || components.animals?.base) return;
  const values = components.animals?.values ?? {};
  const previousFlock = values["birdCount.species"] === "flamingo";
  const residentsOnly =
    values["birdCount.species"] === "swan" && values["species.min"] === 11 && values["birdCount.max"] === 1;
  const previousCamels =
    values["species.camel.min"] === 4 &&
    values["species.camel.max"] === 4 &&
    values["species.min"] === 1 &&
    values["species.max"] === 1;
  const retired = !components.animals || (values.enabled === false && Object.keys(values).length === 1);
  if (previousFlock || residentsOnly || previousCamels || retired) {
    const next = { ...values, ...templateAnimalValues(template.id, templateCore(template).anchor) };
    delete next["species.camel.min"];
    delete next["species.camel.max"];
    components.animals = { values: next };
  }
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
function buildTemplatePlantings(
  id: string,
  anchor: { x: number; z: number },
  plantings: NonNullable<(typeof WORLD_TEMPLATE_ART)[string]["plantings"]>
): PlanningResource[] {
  return plantings.map((grove) => ({
    resourceType: "vegetation-brush",
    resourceId: `template:${id}:vegetation:${grove.id}`,
    properties: {
      category: grove.kind,
      plantKind: grove.kind,
      distributionKind: grove.single ? "single" : "area",
      ...(grove.single ? { requestedPlantCount: 1 } : {}),
      x: anchor.x - grove.x,
      z: anchor.z + grove.z,
      radiusMetres: grove.radius,
      densityScale: grove.densityScale,
      seed: templateBaseSeed(`${id}:${grove.id}`)
    }
  }));
}

function buildTemplateLakes(
  id: string,
  anchor: { x: number; z: number },
  waters: NonNullable<(typeof WORLD_TEMPLATE_ART)[string]["water"]>
): SpatialEntity[] {
  return waters.map((pool) => {
    const lakeId = `lake:authored:template:${id}:water:${pool.id}`;
    const toPoint = (px: number, pz: number, i: number, ring: string) => ({
      id: `${lakeId}:${ring}:${i}`,
      ring,
      x: anchor.x - px,
      z: anchor.z + pz
    });
    const outer = pool.shoreline
      ? pool.shoreline.map(([px, pz], i) => toPoint(px, pz, i, "shore"))
      : Array.from({ length: 96 }, (_, i) => {
          const angle = (i * 2 * Math.PI) / 96;
          return toPoint(pool.x - Math.cos(angle) * pool.radius, pool.z + Math.sin(angle) * pool.radius, i, "shore");
        });
    const holes = (pool.holes ?? []).flatMap((ring, holeIndex) =>
      ring.map(([px, pz], i) => toPoint(px, pz, i, `island-${holeIndex + 1}`))
    );
    const shoreline = [...outer, ...holes];
    return {
      id: lakeId,
      name: pool.id,
      parent: "world",
      origin: "generated",
      components: {
        lakes: {
          base: { entity: "world", component: "lakes" },
          values: {
            ...LAKE_DEFAULTS,
            count: 0,
            radiusM: pool.radius,
            depthM: pool.depth,
            ...(pool.bankWidthM === undefined ? {} : { bankWidthM: pool.bankWidthM }),
            shoreline,
            referenceLevel: 0
          }
        }
      }
    };
  });
}

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
  const resources: PlanningResource[] = (art.terrain ?? []).map((feature) =>
    feature.kind === "patch"
      ? {
          resourceId: `template:${id}:terrain:${feature.id}`,
          resourceType: "terrain-patch" as const,
          properties: {
            x: anchor.x - feature.x,
            z: anchor.z + feature.z,
            radiusMetres: feature.radius ?? Math.max(feature.width ?? 24, feature.length ?? 24) / 2,
            heightDeltaMetres: feature.height
          }
        }
      : {
          resourceId: `template:${id}:terrain:${feature.id}`,
          resourceType: "terrain-feature" as const,
          properties: {
            kind: feature.kind,
            x: anchor.x - feature.x,
            z: anchor.z + feature.z,
            headingDegrees: 0 - (feature.heading ?? 90),
            lengthMetres: feature.length ?? 120,
            widthMetres: feature.width ?? 80,
            elevationDeltaMetres: feature.height,
            sharpness: 0.6,
            asymmetry: 0.5,
            roughness: 0.15,
            erosion: 0.25,
            seed: templateBaseSeed(`${id}:${feature.id}`)
          }
        }
  );
  const lakes = buildTemplateLakes(id, anchor, art.water ?? []);
  resources.push(...buildTemplatePlantings(id, anchor, art.plantings ?? []));
  const core = { anchor, resources, lakes };
  cores.set(id, core);
  return core;
}

function prepareConfiguredTemplate(
  seed: number,
  id: string,
  options?: PlanningPopulationOptions
): { document: PlanningDocument; result?: ReturnType<typeof preparePlanningPopulation>["result"] } {
  const { spawn, spawnPoi } = WORLD_TEMPLATE_CONFIGS[id]!;
  const document = createSeedPlanningInputs(seed);
  const components = document.entities.world.components;
  const subject = spawn?.subject;
  components.worldTemplate = {
    values: { id, ...(subject && { centerX: subject.position.x, centerZ: subject.position.z }) }
  };
  for (const [type, values] of Object.entries(worldTemplatePaletteValues(id, seed)))
    components[type] = { ...components[type], values: { ...components[type]?.values, ...values } };
  if (!spawn || !spawnPoi) return preparePlanningPopulation(document, options);

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
  const prepared = preparePlanningPopulation(document, options);
  const beforeKey = layout ? JSON.stringify({ ...exportPlanningAuthoring(prepared.document), revision: 0 }) : "";
  if (layout) Object.assign(prepared.document.entities[TEMPLATE_SPAWN_POI_ID].components.layout.values, layout);
  const mutated = layout
    ? JSON.stringify({ ...exportPlanningAuthoring(prepared.document), revision: 0 }) !== beforeKey
    : false;
  return { document: prepared.document, result: mutated ? undefined : prepared.result };
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
  return prepareTemplatePlanningDocument(seed, id, options).document;
}

/** Prepare template authoring together with its validated structural result for worker-local reuse when unchanged. */
export function prepareTemplatePlanningDocument(
  seed: number,
  id: string,
  options?: PlanningPopulationOptions
): { document: PlanningDocument; result?: ReturnType<typeof preparePlanningPopulation>["result"] } {
  const template = worldTemplate(id);
  if (!template) throw new Error("未知世界风格：" + id);
  const art = WORLD_TEMPLATE_ART[id];
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Seed 须为 0–4294967295 的整数");
  if (WORLD_TEMPLATE_CONFIGS[id]) return prepareConfiguredTemplate(seed, id, options);
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
  const { anchor, resources, lakes: baseLakes } = templateCore(template);
  const lakes = art.resolveWater ? buildTemplateLakes(id, anchor, art.resolveWater(seed)) : baseLakes;
  if (!art.plannedSubjects) Object.assign(recipe.parameters.worldTemplate!, { centerX: anchor.x, centerZ: anchor.z });
  if (art.generation)
    recipe.parameters.spatialComposition = spatialCompositionParameters({
      ...art.generation,
      seed: templateBaseSeed(id),
      varyWithWorldSeed: true,
      centerX: anchor.x,
      centerZ: anchor.z
    });
  if (art.surfaceTextures) {
    const { baseUrl, normalUrl, microNormalUrl, roadPattern, tileSizeM, strength } = art.surfaceTextures;
    recipe.parameters.terrainSurface = {
      baseTextureUrl: baseUrl,
      normalTextureUrl: normalUrl,
      ...(microNormalUrl === undefined ? {} : { microNormalTextureUrl: microNormalUrl }),
      ...(roadPattern === undefined ? {} : { roadPattern }),
      tileMetres: tileSizeM,
      normalScale: strength
    };
  }
  const document = importPlanningDocument(recipe);
  document.samplingVersion = initial.samplingVersion;
  document.waterAuthoringVersion = 1;
  const components = document.entities.world.components;
  if (art.initialPlanning?.wayfinding) components.wayfinding = { values: { ...art.initialPlanning.wayfinding } };
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
  if (art.initialLandscapePopulation) {
    components.landscapePopulation = {
      values: { ...components.landscapePopulation?.values, ...art.initialLandscapePopulation }
    };
  }
  if (art.flowerCoverage !== undefined) components.flowers.values.coverage = art.flowerCoverage;
  Object.assign(components.flowers.values, art.initialFlowers);
  components.animals = { values: templateAnimalValues(id, anchor) };
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
    const shoreline = values.shoreline as { ring: string; x: number; z: number }[];
    const outer = shoreline.filter((p) => p.ring === "shore");
    const center = {
      x: outer.reduce((sum, p) => sum + p.x, 0) / outer.length,
      z: outer.reduce((sum, p) => sum + p.z, 0) / outer.length
    };
    values.radiusM = Math.max(...outer.map((p) => Math.hypot(p.x - center.x, p.z - center.z)));
    const spacing = terrainPlan.parameters.width / (profile.world.heightmapResolution - 1);
    const spacingZ = terrainPlan.parameters.depth / (profile.world.heightmapResolution - 1);
    let level = Math.min(...outer.map((point) => ground(point)));
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i],
        b = outer[(i + 1) % outer.length];
      const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / Math.min(spacing, spacingZ)));
      for (let step = 0; step <= count; step++) {
        const px = a.x + ((b.x - a.x) * step) / count;
        const pz = a.z + ((b.z - a.z) * step) / count;
        const gx0 = Math.floor(px / spacing) * spacing;
        const gz0 = Math.floor(pz / spacingZ) * spacingZ;
        for (const ox of [-spacing, 0, spacing, 2 * spacing])
          for (const oz of [-spacingZ, 0, spacingZ, 2 * spacingZ])
            level = Math.min(level, ground({ x: gx0 + ox, z: gz0 + oz }));
      }
    }
    values.referenceLevel = Math.fround(level) - 0.02;
    document.entities[lake.id] = lake;
  }
  let spawnPoiLayout: Record<string, string | number | boolean> | undefined;
  if (art.spawnPoi) {
    const anchorOffset = art.spawnPoi.resolveAnchorOffset?.(seed) ?? art.spawnPoi.anchorOffset;
    const spawnPos = {
      x: anchor.x - (art.spawnOffset?.[0] ?? 0) + (anchorOffset?.[0] ?? 0),
      z: anchor.z + (art.spawnOffset?.[1] ?? 0) + (anchorOffset?.[1] ?? 0)
    };
    const poiLayout = exportPlanningRecipe(document).parameters.poiLayout ?? defaultPoiLayout();
    const { candidates } = distributePois(
      {
        width: terrainPlan.parameters.width,
        depth: terrainPlan.parameters.depth,
        seed,
        domains: [
          { id: "land-main", outline: terrainPlan.land },
          ...terrainPlan.islands.map((outline, i) => ({ id: `offshore-${i}`, outline }))
        ]
      },
      poiLayout
    );
    const sampleRange = (key: string, spec: number | readonly [number, number]) => {
      if (typeof spec === "number") return spec;
      const [min, max] = spec;
      if (!Number.isFinite(min) || !Number.isFinite(max) || min > max)
        throw new Error(`模板出生点 POI 参数范围无效：${key}`);
      return min + (max - min) * settlementRandom(seed, `template:${id}:spawnPoi:${key}`);
    };
    const sampleValue = (key: string, spec: string | number | boolean | readonly [number, number]) =>
      Array.isArray(spec) ? sampleRange(key, spec as readonly [number, number]) : spec;
    if (art.spawnPoi.layout) {
      spawnPoiLayout = Object.fromEntries(
        Object.entries(art.spawnPoi.layout).map(([key, spec]) => [key, sampleValue(`layout:${key}`, spec)])
      );
    }
    (document.passthrough.parameters.poiLayout ??= defaultPoiLayout()).candidates = [
      ...candidates,
      { id: TEMPLATE_SPAWN_POI_ID, origin: spawnPos, domainId: "land-main" }
    ];
    document.entities[TEMPLATE_SPAWN_POI_ID] = {
      id: TEMPLATE_SPAWN_POI_ID,
      name: "出生点",
      parent: "world",
      origin: "generated",
      components: {
        anchor: { values: { ...spawnPos } },
        ...(art.spawnPoi.sizeWeight && {
          poi: { values: { sizeWeight: sampleRange("sizeWeight", art.spawnPoi.sizeWeight) } }
        }),
        ...(spawnPoiLayout && {
          layout: { values: { ...spawnPoiLayout } }
        }),
        ...(art.spawnPoi.landscape && {
          landscape: {
            values: Object.fromEntries(
              Object.entries(art.spawnPoi.landscape).map(([key, spec]) => [key, sampleRange(`landscape:${key}`, spec)])
            )
          }
        })
      }
    };
  }
  const prepared = preparePlanningPopulation(document, { ...art.initialPlanning?.population, ...options });
  const initialized = prepared.document;
  const beforeKey = JSON.stringify({ ...exportPlanningAuthoring(initialized), revision: 0 });
  if (spawnPoiLayout && initialized.entities[TEMPLATE_SPAWN_POI_ID]) {
    const spawnLayout = (initialized.entities[TEMPLATE_SPAWN_POI_ID].components.layout ??= { values: {} });
    Object.assign(spawnLayout.values, spawnPoiLayout);
  }
  if (art.spawnPoi && initialized.entities.world.components.animals?.values?.enabled) {
    const spawnSite = prepared.result.plan.poiDistribution?.sites.find((site) => site.id === TEMPLATE_SPAWN_POI_ID);
    if (spawnSite && spawnSite.areaM2 > 0 && !initialized.entities.world.components.animals.values.homeRadius) {
      const poiRadiusM = Math.max(24, Math.round(Math.sqrt(spawnSite.areaM2 / Math.PI)));
      initialized.entities.world.components.animals.values.homeRadius = poiRadiusM;
    }
  }
  if (art.initialPlanning?.poiMemberMax !== undefined) {
    const layout = (initialized.entities.world.components.layout ??= { values: {} });
    layout.values.memberMax = art.initialPlanning.poiMemberMax;
  }
  if (art.initialPlanning?.layout) {
    const layout = (initialized.entities.world.components.layout ??= { values: {} });
    Object.assign(layout.values, art.initialPlanning.layout);
  }
  if (id === "titan-wasteland" && worldTemplate(id)?.rockSource !== "shared") {
    initialized.entities.world.components.regionalAppearance = { values: { rockMaterial: "yellow" } };
    for (const entity of Object.values(initialized.entities)) {
      if (entity.id === "world" || !entity.components.layout) continue;
      entity.components.regionalAppearance = {
        base: { entity: "world", component: "regionalAppearance" },
        values: settlementRandom(seed, `${entity.id}:rock-material`) < 0.5 ? { rockMaterial: "red" } : {}
      };
    }
  }
  const mutated = JSON.stringify({ ...exportPlanningAuthoring(initialized), revision: 0 }) !== beforeKey;
  return { document: initialized, result: mutated ? undefined : prepared.result };
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
  ) {
    retain("world", "landscapeComposition");
    const composition = document.entities.world.components.landscapeComposition;
    if (WORLD_TEMPLATE_ART[id]?.generation && composition && !composition.base)
      composition.values.varyWithWorldSeed ??= true;
  }
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
