import { describe, expect, it } from "vitest";
import {
  WORLD_TEMPLATES,
  templateBaseSeed,
  templateLinearColor
} from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";
import {
  buildWorldTemplateGeometry,
  fitTemplateAsset,
  templateNodeFootprint
} from "@galacean/engine-world-planning/spatial/WorldTemplateGeometry";
import {
  createTemplatePlanningDocument,
  createWorldStylePlanningDocument,
  worldTemplatePaletteValues
} from "@galacean/engine-world-planning/spatial/WorldTemplateAuthoring";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { TEMPLATE_SPAWN_POI_ID, WORLD_TEMPLATE_CONFIGS } from "@galacean/engine-world-planning/spatial/WorldTemplateConfig";
import {
  exportPlanningScene,
  importPlanningScene
} from "../../demos/seed-world/src/planning/spatial/PlanningSceneAsset.ts";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import { applySpatialCommands } from "@galacean/engine-world-planning/spatial/SpatialDocument";
import { switchPlanningLayoutScope } from "@galacean/engine-world-planning/spatial/PlanningLayoutScope";
import { createSpatialTerrainPlan } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";
import { generatePlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningRuntime";
import {
  createSeedPlanningDocument,
  createSeedPlanningInputs
} from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { contains, overlap } from "@galacean/engine-world-planning/semantic-study/WorldPlanningGeometry";
import { envelope } from "@galacean/engine-world-planning/semantic-study/IslandPlanAtoms";
import { roadSurfaces } from "@galacean/engine-world-planning/spatial/layout/RoadTopology";
import {
  NATURAL_VEGETATION_CONTROLS,
  naturalVegetationDensity
} from "@galacean/engine-world-planning/planning-data/NaturalVegetationProfile";
import { defaultPoiLayout } from "@galacean/engine-world-planning/semantic-study/PoiDistribution";
import { worldTemplateEcology } from "@galacean/engine-world-planning/spatial/WorldTemplateEcology";
import { WORLD_TEMPLATE_ART } from "@galacean/engine-world-planning/spatial/WorldTemplateArtDirection";
import {
  resolveWorldTemplateScene,
  resolveWorldTemplateView
} from "@galacean/engine-world-planning/spatial/WorldTemplateView";
import { createSpatialWorldBase } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";
import {
  readGrassAppearance,
  readSurfacePalette
} from "@galacean/engine-world-planning/spatial/PlanningGrassAppearance";
import { applyPlanningWeather } from "@galacean/engine-world-planning/spatial/PlanningWeather";
import { planningLakeBoundary } from "@galacean/engine-world-planning/semantic-study/PlanningLakeBoundary";
import {
  PLANT_MATERIAL_SLOTS,
  plantMaterialField
} from "@galacean/engine-world-planning/spatial/PlantMaterialParameters";
import { planningGroundSurface } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { readAnimalPopulationConfig } from "@galacean/engine-world-planning/spatial/AnimalPopulationComponent";

describe("authored world templates", () => {
  it.each([1, 7, 42, 110513, 20261110])("publishes the configured Sakura spawn POI for Seed %i", (seed) => {
    const config = WORLD_TEMPLATE_CONFIGS["sakura-pearl"]!;
    const document = createTemplatePlanningDocument(seed, "sakura-pearl");
    const authored = document.entities[TEMPLATE_SPAWN_POI_ID].components;
    for (const [key, value] of Object.entries(config.spawnPoi!.layout!)) {
      if (Array.isArray(value)) {
        expect(authored.layout.values[key]).toBeGreaterThanOrEqual(value[0]);
        expect(authored.layout.values[key]).toBeLessThanOrEqual(value[1]);
      } else expect(authored.layout.values[key]).toBe(value);
    }
    const result = generatePlanningDocument(document);
    expect(result.accepted).toBe(true);
    expect(result.plan.spawn).toEqual(config.spawn!.position);
    expect(result.plan.worldTemplateSite?.spawnPoiId).toBe(TEMPLATE_SPAWN_POI_ID);
    expect(result.plan.worldTemplateSite?.footprints[0].obb.size).toEqual(config.spawn!.subject!.size);
    const poi = result.plan.poiDistribution!.sites.find((site) => site.id === TEMPLATE_SPAWN_POI_ID)!;
    expect(poi.active).toBe(true);
    expect(poi.sizeWeight).toBeGreaterThanOrEqual(config.spawnPoi!.sizeWeight![0]);
    expect(poi.sizeWeight).toBeLessThanOrEqual(config.spawnPoi!.sizeWeight![1]);
    const group = result.plan.spatialLayout!.groups.find((item) => item.id === TEMPLATE_SPAWN_POI_ID)!;
    expect(group.volumes.length).toBeGreaterThan(0);
    expect(group.rule.branchShape).toBe("curve");
    expect(result.plan.rocks.some((rock) => rock.groupId.startsWith("landscape-composition"))).toBe(false);
    const parameters = exportPlanningRecipe(document).parameters;
    expect(parameters.spatialComposition?.enabled).not.toBe(true);
    expect(parameters.terrainSkeleton).toEqual(exportPlanningRecipe(createSeedPlanningInputs(seed)).parameters.terrainSkeleton);
  }, 60000);

  it("resamples Sakura POI authoring for a fresh Seed and restores the original values on return", () => {
    const document = createTemplatePlanningDocument(7, "sakura-pearl");
    const saved = importPlanningScene(exportPlanningScene(document));
    const spawnPoi = () => saved.entities[TEMPLATE_SPAWN_POI_ID].components;
    const original = structuredClone(spawnPoi());
    saved.entities.world.components.world.values.seed = 42;
    switchPlanningLayoutScope(saved, 7);
    expect(spawnPoi().anchor).toEqual(original.anchor);
    expect(spawnPoi().poi).not.toEqual(original.poi);
    expect(spawnPoi().layout).not.toEqual(original.layout);
    saved.entities.world.components.world.values.seed = 7;
    switchPlanningLayoutScope(saved, 42);
    expect(spawnPoi()).toEqual(original);
  });

  it("幻兽荒原: publishes Mojave rock envelopes and landscape on bounded land", () => {
    const source = createTemplatePlanningDocument(110613, "titan-wasteland");
    const original = createSeedPlanningInputs(110613).entities.world.components;
    const components = source.entities.world.components;
    for (const type of ["surfacePalette", "rockFormation", "plantMaterial"])
      expect(components[type]).toEqual(original[type]);
    expect(components.lighting.values).toEqual({ timeHours: 12 });
    expect(components.postProcess.values).toEqual({ contrast: 0 });
    expect(source.authoredResources?.filter((resource) => resource.resourceType === "terrain-feature")).toEqual([]);
    const restored = importPlanningScene(exportPlanningScene(source));
    expect(readAnimalPopulationConfig(restored).enabled).toBe(false);
    expect(restored.entities.world.components.grassAppearance.values.groundFusion).toBe(false);
    const recipe = exportPlanningRecipe(restored);
    expect(recipe.parameters.landMode).toBe("continuous");
    expect(recipe.parameters).toMatchObject({
      reliefNearAmplitudeM: 8, reliefAmplitudeM: 26, reliefFarAmplitudeM: 76, reliefScaleM: 256
    });
    expect(recipe.parameters.poiLayout?.network.enabled).toBe(false);
    expect(recipe.parameters.farming?.enabled).toBe(false);

    const result = generatePlanningDocument(restored);
    expect(result.accepted).toBe(true);
    const { plan } = result;
    expect(plan.parameters).toMatchObject({ width: 1024, depth: 1024, reliefAmplitudeM: 26, reliefScaleM: 256 });
    const uniformFbm = {
      ...plan,
      parameters: { ...plan.parameters, reliefNearAmplitudeM: 26, reliefFarAmplitudeM: 26 }
    };
    const stepped = planningGroundSurface(plan);
    const uniform = planningGroundSurface(uniformFbm);
    const center = { x: 497, z: 607 };
    const outskirts = { x: 512, z: 1022 };
    expect(stepped.sample(center)).toBeLessThan(uniform.sample(center));
    expect(stepped.sample(outskirts) - uniform.sample(outskirts)).toBeGreaterThan(10);
    expect(plan.land).toEqual([
      { x: 0, z: 0 }, { x: 1024, z: 0 }, { x: 1024, z: 1024 }, { x: 0, z: 1024 }
    ]);
    expect(plan.islands).toHaveLength(0);
    expect(plan.poiDistribution!.sites.some(site => site.active)).toBe(true);
    expect(plan.parameters.terrainPatches!.length).toBeGreaterThan(0);
    expect(plan.waters).toHaveLength(0);
    expect(plan.routes).toHaveLength(0);
    expect(plan.buildings).toHaveLength(0);
    expect(plan.rocks.length).toBeGreaterThan(16);
    expect(plan.rocks.every((rock) => rock.assetId === "mojave/A01" && rock.obb.length === 4)).toBe(true);
    expect(plan.landscapes?.filter(({ assetId }) => assetId === "mojave/R03").length).toBeGreaterThan(30);
    expect(plan.landscapes?.filter(({ kind }) => kind === "tree") ?? []).toHaveLength(0);
    expect(plan.farming).toBeUndefined();
    expect(plan.naturalVegetation?.settings.companionStoneDensity).toBe(0);
    expect(plan.flowerRegions ?? []).toHaveLength(0);
    expect(Object.values(plan.naturalVegetation!.world).every(density => density === 0)).toBe(true);
    const template = WORLD_TEMPLATES.find(entry => entry.id === "titan-wasteland")!;
    expect(buildWorldTemplateGeometry(template, 110613).nodes).toEqual([]);
    const site = plan.worldTemplateSite!;
    expect(site.footprints).toEqual([]);
    expect(site.centeredStart).toEqual({ x: 512, z: 512 });
    expect(site.spawnView).toBeUndefined();
    expect(resolveWorldTemplateScene(plan, (x, z) => stepped.sample({ x, z }))).toBeUndefined();

    const edited = applySpatialCommands(restored, [
      { op: "set", entity: "world", component: "world", values: { landMode: "island" } },
      { op: "set", entity: "world", component: "network", values: { enabled: true } },
      { op: "set", entity: "world", component: "farming", values: { enabled: true } }
    ], planningRegistry);
    const enabled = generatePlanningDocument(edited, result);
    expect(enabled.accepted).toBe(true);
    expect(enabled.plan.land).not.toEqual(plan.land);
    expect(enabled.plan.routes.length).toBeGreaterThan(0);
    expect(enabled.plan.farming?.options.enabled).toBe(true);
  }, 60000);

  it("keeps authored forest poses while generating paths and separates roots from canopy bounds", () => {
    const template = WORLD_TEMPLATES.find((entry) => entry.id === "emerald-forest")!;
    const art = WORLD_TEMPLATE_ART[template.id];
    const geometry = buildWorldTemplateGeometry(template, 8, { ...art.generation, roadWidthM: 7 });
    for (const authored of art.models) {
      expect("position" in authored).toBe(true);
      if (!("position" in authored)) continue;
      const node = geometry.nodes.find((entry) => entry.id === authored.id)!;
      expect(node.position).toEqual([0 - authored.position[0], authored.position[1], authored.position[2]]);
      expect(node.assetUrl).toBeTruthy();
      if (!node.footprint) continue;
      const area = (points: { x: number; z: number }[]) =>
        Math.abs(
          points.reduce((sum, point, index) => {
            const next = points[(index + 1) % points.length];
            return sum + point.x * next.z - next.x * point.z;
          }, 0)
        ) / 2;
      expect(area(templateNodeFootprint(node))).toBeCloseTo(node.footprint[0] * node.footprint[1], 8);
      expect(area(templateNodeFootprint(node, true))).toBeCloseTo(node.scale[0] * node.scale[2], 8);
      expect(area(templateNodeFootprint(node))).toBeLessThan(area(templateNodeFootprint(node, true)));
    }
    const scene = resolveWorldTemplateScene(
      {
        parameters: {
          seed: 8,
          width: 1024,
          depth: 1024,
          worldTemplate: { id: template.id },
          spatialComposition: art.generation
        },
        worldTemplateSite: { templateId: template.id, center: { x: 512, z: 512 } }
      } as never,
      (x, z) => x * 0.1 + z * 0.2
    )!;
    const hero = scene.nodes.find((entry) => entry.node.id === art.focus[0])!;
    const visual = templateNodeFootprint(hero.node, true);
    expect(hero.bounds.max[0] - hero.bounds.min[0]).toBeCloseTo(
      Math.max(...visual.map((p) => p.x)) - Math.min(...visual.map((p) => p.x))
    );
    expect(hero.bounds.max[2] - hero.bounds.min[2]).toBeCloseTo(
      Math.max(...visual.map((p) => p.z)) - Math.min(...visual.map((p) => p.z))
    );
    const support = templateNodeFootprint(hero.node).map((point) => [512 + point.x, 512 + point.z]);
    expect(hero.bounds.min[1]).toBeCloseTo(Math.min(...support.map(([x, z]) => x * 0.1 + z * 0.2)));
    const rooted = scene.nodes.filter(({ node }) => node.groundingFootprint);
    expect(rooted.length).toBeGreaterThan(0);
    for (const { node, bounds } of rooted) {
      const planting = templateNodeFootprint({ ...node, footprint: node.groundingFootprint });
      const trunk = templateNodeFootprint(node);
      const floor = (point: { x: number; z: number }) => (512 + point.x) * 0.1 + (512 + point.z) * 0.2;
      expect(bounds.min[1]).toBeCloseTo(Math.min(...planting.map(floor)));
      expect(bounds.min[1]).toBeLessThan(Math.min(...trunk.map(floor)));
    }
  });
  it("plants slanted root openings below the soil while preserving the source shape", () => {
    const size = [12, 18, 10];
    const bounds = { min: [-2, 0, -2], max: [3, 8, 2] };
    const rim = [
      [-1, 0, 0],
      [0, 0.8, 1],
      [1, 1.2, 0],
      [0, 0.4, -1]
    ];
    const groundY = Math.max(...rim.map((point) => point[1]));
    const fit = fitTemplateAsset(size, bounds, groundY);
    const gaps = rim.map((point) => point[1] * fit.scale + fit.offset[1] + size[1] / 2);
    expect(Math.max(...gaps)).toBeCloseTo(0, 12);
    expect(gaps.every((gap) => gap <= Number.EPSILON * size[1])).toBe(true);
    const lowest = fitTemplateAsset(size, bounds);
    expect(Math.max(...rim.map((point) => point[1] * lowest.scale + lowest.offset[1] + size[1] / 2))).toBeGreaterThan(
      0
    );
    for (const invalid of [NaN, Infinity, -1, bounds.max[1]])
      expect(() => fitTemplateAsset(size, bounds, invalid)).toThrow("Invalid template asset bounds");
  });
  it("fits asymmetric models uniformly around their authored root and grounds the lowest point", () => {
    const envelope = [80, 100, 70];
    for (const bounds of [
      { min: [-2, 0, -1], max: [7, 10, 3] },
      { min: [-4, -3, -8], max: [3, 9, 2] }
    ]) {
      const { scale, offset } = fitTemplateAsset(envelope, bounds);
      expect(offset[0]).toBe(0);
      expect(offset[2]).toBe(0);
      expect(bounds.min[1] * scale + offset[1]).toBeCloseTo(-envelope[1] / 2, 12);
      for (const corner of [bounds.min, bounds.max])
        corner.forEach((value, axis) =>
          expect(Math.abs(value * scale + offset[axis])).toBeLessThanOrEqual(envelope[axis] / 2)
        );
      const sourceDistance = Math.hypot(...bounds.max.map((value, axis) => value - bounds.min[axis]));
      const fittedDistance = Math.hypot(
        ...bounds.max.map((value, axis) => value * scale + offset[axis] - (bounds.min[axis] * scale + offset[axis]))
      );
      expect(fittedDistance / sourceDistance).toBeCloseTo(scale, 12);
    }
  });
  it("reapplies only palette fields to a saved project without changing layout or lighting", () => {
    const source = createSeedPlanningInputs(7);
    source.entities.world.components.lighting = { values: { timeHours: 14.25, sunIntensity: 3.4 } };
    source.entities.world.components.postProcess = { values: { postExposure: -0.5, saturation: -3 } };
    source.entities.world.components.rockFormation = { values: { textureScale: 42 } };
    const before = structuredClone(source);
    const palette = worldTemplatePaletteValues("sakura-pearl");
    const commands = Object.entries(palette).map(([component, values]) => ({
      op: "set" as const,
      entity: "world",
      component,
      values
    }));
    const restored = importPlanningScene(
      exportPlanningScene({ ...source, ...applySpatialCommands(source, commands, planningRegistry) })
    );
    const expected = structuredClone(before);
    expected.revision += 1;
    for (const [component, values] of Object.entries(palette))
      expected.entities.world.components[component] = {
        ...expected.entities.world.components[component],
        values: { ...expected.entities.world.components[component]?.values, ...values }
      };
    expect(restored).toEqual(importPlanningScene(exportPlanningScene(expected)));
    expect(source).toEqual(before);
    expect(readSurfacePalette(restored, [1, 1, 1], "road")).toEqual(templateLinearColor("#dbbeaa"));
    expect(readGrassAppearance(restored).colorA).toEqual(templateLinearColor("#ff64a8"));
    expect(readGrassAppearance(restored).colorB).toEqual(templateLinearColor("#79c846"));
    expect(readSurfacePalette(restored, [1, 1, 1])).toEqual(templateLinearColor("#f0bfd6"));
  });
  it("covers native understory variants with independent HDR part colours", () => {
    const palette = worldTemplatePaletteValues("sakura-pearl");
    const rgb = (assetId: string, part: string, materialId?: string) => {
      const slot = PLANT_MATERIAL_SLOTS.find(
        (slot) => slot.assetId === assetId && slot.part === part && (!materialId || slot.materialId === materialId)
      )!;
      expect(slot).toBeDefined();
      return (["r", "g", "b"] as const).map(
        (channel) => palette.plantMaterial[plantMaterialField(assetId, slot.materialId, channel)]
      );
    };
    for (const slot of PLANT_MATERIAL_SLOTS)
      for (const channel of ["r", "g", "b"] as const)
        expect(
          palette.plantMaterial[plantMaterialField(slot.assetId, slot.materialId, channel)]
        ).toBeGreaterThanOrEqual(0);
    const swatches = [
      ["SM_Flower_08_01", "petals", "appearance-540a4c6f542dc7f0", "#ff006f", 20],
      ["SM_Flower_08_02", "petals", "appearance-540a4c6f542dc7f0", "#ff006b", 20],
      ["SM_Flower_08_03", "petals", "appearance-540a4c6f542dc7f0", "#ff0268", 20],
      ["SM_CoverPlant_06", "foliage", "appearance-d7b4b46b60c4bf96", "#e01a56", 15],
      ["SM_BirchTree_01", "bark", "appearance-58da25ba7b394497", "#825636", 1],
      ["SM_BirchTree_01", "bark", "appearance-a8b3441a505dd0f2", "#a06f49", 1],
      ["SM_BirchTree_01", "leaves", "appearance-e832df91cc4eb1a2", "#ff6681", 2]
    ] as const;
    for (const [asset, part, material, hex, intensity] of swatches)
      expect(rgb(asset, part, material)).toEqual(templateLinearColor(hex).map((channel) => channel * intensity));
    const flower = rgb("SM_Flower_08_01", "petals");
    expect(flower[0]).toBeGreaterThan(1);
    expect(rgb("SM_Flower_08_02", "petals")).not.toEqual(flower);
    expect(rgb("SM_Flower_08_03", "petals")).not.toEqual(flower);
    expect(rgb("SM_Flower_08_01", "stem")).not.toEqual(flower);
    expect(rgb("SM_Flower_03_01", "petals")).not.toEqual(flower);
    for (const slot of PLANT_MATERIAL_SLOTS.filter((slot) => slot.part === "petals")) {
      const colour = rgb(slot.assetId, slot.part, slot.materialId);
      // Every flowering variant must retain HDR energy, not only the three saved swatches.
      expect(Math.max(...colour)).toBeGreaterThan(1);
      const luminance = colour[0] * 0.2126 + colour[1] * 0.7152 + colour[2] * 0.0722;
      expect(luminance).toBeGreaterThan(1);
    }
    expect(rgb("SM_Mushroom_01", "cap")[0]).toBeGreaterThan(1);
    expect(rgb("SM_Mushroom_01", "stem")).not.toEqual(rgb("SM_Mushroom_01", "cap"));
    expect(rgb("SM_BirchTree_02", "leaves")).toEqual(rgb("SM_BirchTree_01", "leaves"));
    expect(rgb("SM_BirchTree_07", "leaves")).toEqual(rgb("SM_BirchTree_01", "leaves"));
    expect(rgb("SM_CoverPlant_06", "foliage", "appearance-431c9ee4ddb29dc7")).toEqual(
      templateLinearColor("#66b83f").map((channel) => channel * 1.1)
    );
    for (const green of [
      templateLinearColor(WORLD_TEMPLATE_ART["sakura-pearl"].grass![1]),
      rgb("SM_CoverPlant_06", "foliage", "appearance-431c9ee4ddb29dc7"),
      rgb("SM_Flower_08_01", "stem")
    ])
      expect(green[1]).toBeGreaterThan(Math.max(green[0], green[2]));
  });
  for (const id of ["", ...WORLD_TEMPLATES.map((template) => template.id)]) {
    it(`${id || "original"}: retains underlying plant controls through habitat switches and Seed restoration`, () => {
      const source = createSeedPlanningDocument(7);
      source.entities["plant-controls"] = {
        id: "plant-controls",
        name: "Plant controls",
        components: {
          landscape: { values: { "vegetation.litter": 0.12 } }
        }
      };
      source.entities.world.components.landscape = {
        base: { entity: "plant-controls", component: "landscape" },
        values: {
          ...Object.fromEntries(
            NATURAL_VEGETATION_CONTROLS.filter((layer) => layer.key !== "litter").map((layer, i) => [
              "vegetation." + layer.key,
              0.2 + i * 0.1
            ])
          ),
          "vegetation.cover": 0,
          treeHeightMinM: 11,
          treeHeightMaxM: 19,
          maxSlopeDegrees: 34
        }
      };
      source.entities.world.components.landscapePopulation = {
        values: { multiplier: 1.2, samplingDensityPer1000M2: 12 }
      };
      source.entities.world.components.flowers = { values: { coverage: 0.3, densityPerM2: 0.25 } };
      const before = structuredClone(source);
      const styled = createWorldStylePlanningDocument(source, 8, id);
      const ice = createWorldStylePlanningDocument(styled, 9, "aurora-glacier");
      const restored = createWorldStylePlanningDocument(ice, 10, "sakura-pearl");
      restored.entities.world.components.world.values.seed = 11;
      switchPlanningLayoutScope(restored, 10);
      restored.entities.world.components.world.values.seed = 10;
      switchPlanningLayoutScope(restored, 11);
      for (const doc of [styled, ice, restored, importPlanningScene(exportPlanningScene(restored))]) {
        expect(doc.entities.world.components.landscapePopulation).toEqual(
          source.entities.world.components.landscapePopulation
        );
        const landscape = doc.entities.world.components.landscape;
        expect(landscape.base).toEqual(source.entities.world.components.landscape.base);
        for (const key of [...NATURAL_VEGETATION_CONTROLS.map((layer) => "vegetation." + layer.key), "maxSlopeDegrees"])
          expect(landscape.values[key]).toEqual(source.entities.world.components.landscape.values[key]);
        expect(doc.entities.world.components.flowers.values.densityPerM2).toBe(0.25);
        expect(doc.entities["plant-controls"]).toEqual(source.entities["plant-controls"]);
        expect(doc.entities.world.components.landscape.base?.entity).toBe("plant-controls");
        expect(exportPlanningRecipe(doc).parameters.poiLayout!.landscape.vegetation?.litter).toBe(0.12);
      }
      expect(source).toEqual(before);
    });
    it(`${id || "original"}: applies the authorized reference lighting and preserves later edits across Seeds`, () => {
      const source = createSeedPlanningDocument(7);
      source.entities.world.components.lighting = {
        values: {
          timeHours: 14.25,
          sunIntensity: 3.4,
          ambientIntensity: 1.25,
          iblIntensity: 1.6,
          skyExposure: 1.8,
          customSkyZenithR: 0.3,
          customSkyHorizonB: 2,
          shadowStrength: 0,
          fog: false,
          direct: false
        }
      };
      source.entities.world.components.postProcess = {
        values: {
          enabled: false,
          bloom: false,
          postExposure: -0.5,
          temperature: 7,
          saturation: -3,
          contrast: 0,
          bloomIntensity: 0
        }
      };
      const before = structuredClone(source);
      const styled = createWorldStylePlanningDocument(source, 8, id);
      for (const type of ["lighting", "postProcess"] as const) {
        expect(styled.entities.world.components[type]).toEqual(
          id ? { values: WORLD_TEMPLATE_ART[id][type] } : source.entities.world.components[type]
        );
        expect(styled.entities.world.components[type]).not.toBe(source.entities.world.components[type]);
      }
      styled.entities.world.components.lighting.values.timeHours = 15.5;
      styled.entities.world.components.postProcess.values.postExposure = 0.75;
      const edited = structuredClone(styled.entities.world.components);
      styled.entities.world.components.world.values.seed = 9;
      switchPlanningLayoutScope(styled, 8);
      for (const type of ["lighting", "postProcess"])
        expect(styled.entities.world.components[type]).toEqual(edited[type]);
      styled.entities.world.components.world.values.seed = 8;
      switchPlanningLayoutScope(styled, 9);
      for (const type of ["lighting", "postProcess"])
        expect(styled.entities.world.components[type]).toEqual(edited[type]);
      expect(source).toEqual(before);
    });
  }
  it("round-trips independent material and atmosphere controls for every supplied reference", () => {
    expect(new Set(Object.values(WORLD_TEMPLATE_ART).map((art) => art.reference)).size).toBe(15);
    for (const template of WORLD_TEMPLATES) {
      const styled = createTemplatePlanningDocument(7, template.id);
      const light = structuredClone(styled.entities.world.components.lighting);
      const edited = {
        ...styled,
        ...applySpatialCommands(
          styled,
          [
            {
              op: "set",
              entity: "world",
              component: "surfacePalette",
              values: { "color.r": 0.1, "color.g": 0.2, "color.b": 0.3 }
            }
          ],
          planningRegistry
        )
      };
      expect(edited.entities.world.components.lighting).toEqual(light);
      const restored = importPlanningScene(exportPlanningScene(edited));
      expect(restored.entities.world.components.lighting).toEqual(light);
      expect(readSurfacePalette(restored, [1, 1, 1])).toEqual([0.1, 0.2, 0.3]);
      expect(readGrassAppearance(restored).roadColorStrength).toBe(0);
    }
  });
  it("publishes a new Seed through the full spatial pipeline", () => {
    const result = generatePlanningDocument(createSeedPlanningDocument(20261104));
    expect(result.accepted).toBe(true);
  }, 60000);
  it("converts sRGB source colours to linear exactly at the transfer-function boundaries", () => {
    expect(templateLinearColor("#000000")).toEqual([0, 0, 0]);
    expect(templateLinearColor("#ffffff")).toEqual([1, 1, 1]);
    expect(templateLinearColor("#808080")[0]).toBeCloseTo(0.2158605, 6);
  });
  it("resets bare-ground colour to the native palette without retaining a previous template override", () => {
    const document = createSeedPlanningDocument(1),
      original = [0.2, 0.3, 0.4] as const;
    expect(readSurfacePalette(document, original)).toEqual(original);
    const inheritedRoadField = readGrassAppearance(document).roadColorStrength;
    document.entities.world.components.surfacePalette = { values: { "color.r": 0, "color.b": 0.8 } };
    expect(readSurfacePalette(document, original)).toEqual([0, 0.3, 0.8]);
    expect(readSurfacePalette(document, original, "road")).toEqual([0, 0.3, 0.8]);
    document.entities.world.components.surfacePalette.values["road.g"] = 0;
    expect(readSurfacePalette(document, original, "road")).toEqual([0, 0, 0.8]);
    expect(readSurfacePalette(document, original)).toEqual([0, 0.3, 0.8]);
    expect(readGrassAppearance(document).roadColorStrength).toBe(0);
    delete document.entities.world.components.surfacePalette;
    expect(readSurfacePalette(document, original)).toEqual(original);
    expect(readGrassAppearance(document).roadColorStrength).toBe(inheritedRoadField);
  });
  it("drives native fine rain without restarting it on unrelated scene publications", () => {
    const clouds: unknown[] = [],
      precipitation: unknown[] = [];
    const environment = {
      weatherSystem: { getSnapshot: () => ({ cloud: { cloudCoverage: 0.45, cloudType: 0.52 } }) },
      setCloud: (value: unknown) => clouds.push(value),
      setPrecipitation: (value: unknown) => precipitation.push(value)
    };
    const owner = environment as unknown as Parameters<typeof applyPlanningWeather>[0];
    const rainy = { cloudCoverage: 0.65, rainRate: 0.28, snowRate: 0, temperatureCelsius: 14, relativeHumidity: 0.85 };
    applyPlanningWeather(owner, rainy);
    applyPlanningWeather(owner, { ...rainy });
    expect(precipitation).toHaveLength(1);
    expect(precipitation[0]).toMatchObject({ rainRate: 0.28, snowRate: 0 });
    expect(clouds[0]).toMatchObject({ cloudCoverage: 0.65, cloudType: 0.52 });
    applyPlanningWeather(owner, { ...rainy, rainRate: 0 });
    expect(precipitation).toHaveLength(2);
    expect(precipitation[1]).toMatchObject({ rainRate: 0 });
  });
  for (const template of WORLD_TEMPLATES) {
    const art = WORLD_TEMPLATE_ART[template.id];
    const subjectTest = art.models.length ? it : it.skip;
    subjectTest(`${template.name}: applies the authored framing at standing height in landscape and portrait viewports`, () => {
      const plan = createSpatialWorldBase(exportPlanningRecipe(createTemplatePlanningDocument(1, template.id)));
      const authored = plan.parameters.worldTemplate!;
      plan.worldTemplateSite = {
        templateId: template.id,
        center: { x: authored.centerX ?? plan.parameters.width / 2, z: authored.centerZ ?? plan.parameters.depth / 2 },
        footprints: []
      };
      const ground = (x: number, z: number) => 0.015 * x + 0.025 * z;
      const scene = resolveWorldTemplateScene(plan, ground)!;
      for (const aspect of [16 / 9, 9 / 16]) {
        const { eye, target, fovDegrees, frameFraction } = resolveWorldTemplateView(scene, aspect, 50, 1.8, ground).pose;
        const frameLimit = Math.max(1, frameFraction);
        if (aspect < 1) expect(frameFraction).toBeLessThanOrEqual(1);
        expect(eye[1]).toBeCloseTo(ground(eye[0], eye[2]) + 1.8, 6);
        const forward = target.map((v, i) => v - eye[i]);
        const length = Math.hypot(...forward);
        forward.forEach((v, i) => (forward[i] = v / length));
        const right = [forward[2], 0, -forward[0]];
        const horizontalLength = Math.hypot(...right);
        right.forEach((v, i) => (right[i] = v / horizontalLength));
        const up = [
          right[1] * forward[2] - right[2] * forward[1],
          right[2] * forward[0] - right[0] * forward[2],
          right[0] * forward[1] - right[1] * forward[0]
        ];
        const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
        for (const x of [scene.focusBounds.min[0], scene.focusBounds.max[0]])
          for (const y of [scene.focusBounds.min[1], scene.focusBounds.max[1]])
            for (const z of [scene.focusBounds.min[2], scene.focusBounds.max[2]]) {
              const v = [x - eye[0], y - eye[1], z - eye[2]],
                depth = dot(v, forward);
              expect(depth).toBeGreaterThan(0);
              expect(
                Math.abs(dot(v, right) / (depth * Math.tan((fovDegrees * Math.PI) / 360) * aspect))
              ).toBeLessThanOrEqual(frameLimit);
              expect(Math.abs(dot(v, up) / (depth * Math.tan((fovDegrees * Math.PI) / 360)))).toBeLessThanOrEqual(frameLimit);
            }
      }
    });
    it(`${template.name}: applies only its declared habitat without clearing the saved plant settings`, () => {
      const authored = defaultPoiLayout(),
        before = structuredClone(authored);
      const effective = worldTemplateEcology(template.id, authored);
      const density = naturalVegetationDensity(effective.landscape.vegetation);
      if (!template.vegetation) {
        expect(effective).toBe(authored);
        expect(density).toEqual(naturalVegetationDensity(authored.landscape.vegetation));
        expect(density.trees).toBeGreaterThan(0);
      } else if (template.vegetation === "desert") {
        expect(density.trees).toBe(0);
        expect(density.grass).toBe(0);
        expect(density.shrubs).toBeGreaterThan(0);
        expect(density.shrubs).toBe(NATURAL_VEGETATION_CONTROLS.find((layer) => layer.key === "shrubs")!.density);
      } else if (template.vegetation === "grass") {
        expect(density.grass).toBeGreaterThan(0);
        expect(Object.entries(density).every(([key, value]) => key === "grass" || value === 0)).toBe(true);
      } else expect(Object.values(density).every((value) => value === 0)).toBe(true);
      expect(authored).toEqual(before);
      const fresh = createTemplatePlanningDocument(7, template.id);
      const art = WORLD_TEMPLATE_ART[template.id];
      const densityOverrides = (values: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith("vegetation.")));
      expect(densityOverrides(fresh.entities.world.components.landscape.values)).toEqual(
        densityOverrides({ ...art.landscape, ...art.initialLandscape })
      );
      const edited = { ...authored, landscape: { ...authored.landscape, vegetation: { trees: 0.4, shrubs: 0 } } };
      const userDensity = naturalVegetationDensity(worldTemplateEcology(template.id, edited).landscape.vegetation);
      expect(userDensity.trees).toBe(0.4);
      expect(userDensity.shrubs).toBe(0);
    });
    subjectTest(`${template.name}: reserves its subject before publishing buildings, rocks and roads`, () => {
      const result = generatePlanningDocument(createTemplatePlanningDocument(20261104, template.id));
      expect(result.accepted).toBe(true);
      if (template.vegetation === "grass") {
        expect(result.plan.buildings.length).toBeGreaterThan(0);
        expect(result.plan.worldTemplateSite).toBeUndefined();
        expect(result.plan.planning!.reservations.some((area) => area.ownerId === "world-template")).toBe(false);
        expect(result.plan.farming).toBeUndefined();
        expect(result.plan.rocks).toEqual([]);
        expect(result.plan.landscapes?.some((plant) => plant.kind === "rock")).toBe(false);
        expect(result.plan.naturalVegetation!.world.grass).toBeGreaterThan(0);
        const populated = result.plan.spatialLayout!.groups.filter((group) => group.volumes.length > 0);
        expect(populated).toHaveLength(1);
        expect(populated[0].rule.branchShape).toBe("curve");
        expect(populated[0].paths.length).toBeGreaterThan(0);
        return;
      }
      const site = result.plan.worldTemplateSite!;
      expect(site.templateId).toBe(template.id);
      const surface = planningGroundSurface(result.plan),
        ground = (x: number, z: number) => surface.sample({ x, z });
      const scene = resolveWorldTemplateScene(result.plan, ground)!;
      const { eye, target } = resolveWorldTemplateView(scene, 16 / 9, 50, 1.8, ground).pose;
      const steps = Math.ceil(
        Math.hypot(target[0] - eye[0], target[2] - eye[2]) / Math.min(surface.spacingX, surface.spacingZ)
      );
      for (let step = 0; step <= steps; step++) {
        const t = step / steps,
          x = eye[0] + (target[0] - eye[0]) * t,
          z = eye[2] + (target[2] - eye[2]) * t;
        expect(ground(x, z)).toBeLessThanOrEqual(eye[1] + (target[1] - eye[1]) * t + Number.EPSILON * 1024);
      }
      if (WORLD_TEMPLATE_ART[template.id].water?.length) {
        const waterIds = new Set(
          WORLD_TEMPLATE_ART[template.id].water!.map((pool) => `lake:authored:template:${template.id}:water:${pool.id}`)
        );
        const lakes = result.plan.waters.filter((water) => waterIds.has(water.id));
        expect(lakes).toHaveLength(waterIds.size);
        for (const lake of lakes) expect(planningLakeBoundary(result.plan, lake).boundary.rings.length).toBeGreaterThan(0);
      }
      const vegetation = result.plan.naturalVegetation!.world;
      if (!template.vegetation) {
        expect(vegetation.trees).toBeGreaterThan(0);
        expect(result.plan.landscapes!.some((plant) => plant.kind === "tree")).toBe(true);
      } else if (template.vegetation === "desert") {
        const authored = WORLD_TEMPLATE_ART[template.id].initialLandscape?.["vegetation.shrubs"];
        expect(vegetation.shrubs).toBe(authored ?? NATURAL_VEGETATION_CONTROLS.find(layer => layer.key === "shrubs")!.density);
      }
      else expect(Object.values(vegetation).every((value) => value === 0)).toBe(true);
      expect(result.plan.planning!.reservations.some((area) => area.ownerId === "world-template")).toBe(true);
      for (const object of [
        ...result.plan.buildings,
        ...result.plan.rocks,
        ...roadSurfaces(result.plan),
        ...(result.plan.landscapes ?? [])
      ]) {
        const footprints =
          "boxes" in object && object.boxes?.length
            ? object.boxes.map((box) => envelope(box.center, box.sizeX, box.sizeZ, box.yaw))
            : "kind" in object && object.kind === "tree" && object.collisionRadius !== undefined
              ? [envelope(object.center, object.collisionRadius * 2, object.collisionRadius * 2, object.yaw)]
              : [object.outline!];
        for (const outline of footprints) {
          for (const occupied of site.footprints) {
            const supportsSubject =
              "groupId" in object &&
              object.groupId === "landscape-composition:subject-terrace" &&
              contains(outline, occupied.outline);
            if (!supportsSubject)
              expect(overlap(outline, occupied.outline), JSON.stringify({ id: object.id, outline, occupied })).toBe(
                false
              );
          }
        }
      }
    }, 60000);
    it(`${template.name}: validates native authoring, Scene round-trip and Seed scope restoration`, () => {
      const doc = createTemplatePlanningDocument(7, template.id);
      expect(() => applySpatialCommands(doc, [], planningRegistry)).not.toThrow();
      const recipe = exportPlanningRecipe(doc);
      expect(recipe.parameters.worldTemplate?.id).toBe(template.id);
      expect(recipe.parameters.landformSeed).toBe(
        WORLD_TEMPLATE_CONFIGS[template.id] ? undefined : art.initialPlanning?.relief ? 7 : templateBaseSeed(template.id)
      );
      const core = structuredClone(doc.authoredResources);
      const restored = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(doc))));
      expect(exportPlanningRecipe(restored)).toEqual(recipe);
      restored.entities.world.components.world.values.seed = 8;
      switchPlanningLayoutScope(restored, 7);
      expect(exportPlanningRecipe(restored).parameters.worldTemplate?.id).toBe(template.id);
      expect(restored.authoredResources).toEqual(core);
      restored.entities.world.components.world.values.seed = 7;
      switchPlanningLayoutScope(restored, 8);
      expect(exportPlanningRecipe(restored)).toEqual(recipe);
      expect(restored.authoredResources).toEqual(core);
    });
    it(`${template.name}: preserves the subject, bounds terrain variation and reproduces the same Seed`, () => {
      const a = exportPlanningRecipe(createTemplatePlanningDocument(0, template.id));
      const b = exportPlanningRecipe(createTemplatePlanningDocument(0xffffffff, template.id));
      expect(a.parameters.worldTemplate).toEqual(b.parameters.worldTemplate);
      const terrainA = createSpatialTerrainPlan(a),
        terrainB = createSpatialTerrainPlan(b);
      expect(createSpatialTerrainPlan(a)).toEqual(terrainA);
      // Shoreline tessellation may change with size. Holding authored shape controls
      // fixed must instead produce exactly the same coast under another world Seed.
      const sameShape = structuredClone(b);
      sameShape.parameters.landCoverage = a.parameters.landCoverage;
      sameShape.parameters.complexity = a.parameters.complexity;
      const anchors = (terrain: typeof terrainA) => terrain.parameters.terrainPatches!.map((p) => [p.x, p.z]);
      if (WORLD_TEMPLATE_CONFIGS[template.id]) {
        expect(terrainB.land).not.toEqual(terrainA.land);
        expect(anchors(terrainA)).not.toEqual(anchors(terrainB));
      } else {
        expect(createSpatialTerrainPlan(sameShape).land).toEqual(terrainA.land);
        if (art.initialPlanning?.relief) expect(anchors(terrainA)).not.toEqual(anchors(terrainB));
        else expect(anchors(terrainA)).toEqual(anchors(terrainB));
        for (const recipe of [a, b]) {
          const heightRatio = recipe.parameters.terrainSkeleton!.heightM / template.terrain.heightM;
          expect(heightRatio).toBeGreaterThanOrEqual(0.94);
          expect(heightRatio).toBeLessThanOrEqual(1.06);
        }
      }
      const geometry = buildWorldTemplateGeometry(template, 0);
      expect(buildWorldTemplateGeometry(template, 0)).toEqual(geometry);
      const other = buildWorldTemplateGeometry(template, 0xffffffff);
      expect(other).toEqual(geometry);
      expect(geometry.nodes).toHaveLength(art.models.length);
      const ids = new Set<string>();
      for (const node of geometry.nodes) {
        expect(ids.has(node.id)).toBe(false);
        expect([...node.position, ...node.rotation, ...node.scale].every(Number.isFinite)).toBe(true);
        expect(node.scale.every((value) => value > 0)).toBe(true);
        // Every missing-asset envelope stays inside the published activity reservation.
        const yaw = (node.rotation[1] * Math.PI) / 180;
        for (const x of [-node.scale[0] / 2, node.scale[0] / 2])
          for (const z of [-node.scale[2] / 2, node.scale[2] / 2]) {
            expect(Math.abs(node.position[0] + x * Math.cos(yaw) - z * Math.sin(yaw))).toBeLessThanOrEqual(
              geometry.radius
            );
            expect(Math.abs(node.position[2] + x * Math.sin(yaw) + z * Math.cos(yaw))).toBeLessThanOrEqual(
              geometry.radius
            );
          }
        ids.add(node.id);
      }
    });
  }
  it("rejects unknown templates and invalid Seeds before changing authoring", () => {
    expect(() => createTemplatePlanningDocument(1, "missing")).toThrow("未知世界风格");
    for (const seed of [-1, 0.5, Infinity, NaN, 0x100000000])
      expect(() => createTemplatePlanningDocument(seed, WORLD_TEMPLATES[0].id)).toThrow("Seed");
  });
});
