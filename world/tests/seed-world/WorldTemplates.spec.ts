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
import {
  exportPlanningRecipe,
  upgradePlanningDocument
} from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { spatialCompositionParameters } from "@galacean/engine-world-planning/spatial/SpatialCompositionParameters";
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
import { overlap } from "@galacean/engine-world-planning/semantic-study/WorldPlanningGeometry";
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
import {
  planningGroundSurface,
  planningHeightmap
} from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { compositionTerrain } from "@galacean/engine-world-planning/spatial/SpatialCompositionGeometry";
import { COMPOSITION_RELIEF_OWNER } from "@galacean/engine-world-planning/spatial/SpatialComposition";
import { rockFormationJobs } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Jobs";
import { readRockFormationSettings } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import { generateRockFormation } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Generate";

describe("authored world templates", () => {
  it("幻兽荒原: starts with bounded land and empty automatic water, roads, buildings and vegetation", () => {
    const source = createTemplatePlanningDocument(110613, "titan-wasteland");
    const original = createSeedPlanningInputs(110613).entities.world.components;
    const components = source.entities.world.components;
    for (const type of ["surfacePalette", "rockFormation", "plantMaterial"])
      expect(components[type]).toEqual(original[type]);
    expect(components.lighting.values).toEqual({ timeHours: 12 });
    expect(components.postProcess.values).toEqual({ contrast: 0 });
    expect(source.authoredResources?.filter((resource) => resource.resourceType === "terrain-feature")).toEqual([]);
    const restored = importPlanningScene(exportPlanningScene(source));
    expect(restored.entities.world.components.grassAppearance.values.groundFusion).toBe(false);
    const recipe = exportPlanningRecipe(restored);
    expect(recipe.parameters.landMode).toBe("continuous");
    expect(recipe.parameters).toMatchObject({
      reliefNearAmplitudeM: 9, reliefAmplitudeM: 35, reliefFarAmplitudeM: 110, reliefScaleM: 256
    });
    expect(recipe.parameters.poiLayout?.network.enabled).toBe(false);
    expect(recipe.parameters.farming?.enabled).toBe(false);

    const result = generatePlanningDocument(restored);
    expect(result.accepted).toBe(true);
    const { plan } = result;
    expect(plan.parameters).toMatchObject({ width: 1024, depth: 1024, reliefAmplitudeM: 35, reliefScaleM: 256 });
    const uniformFbm = {
      ...plan,
      parameters: { ...plan.parameters, reliefNearAmplitudeM: 35, reliefFarAmplitudeM: 35 }
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
    expect(plan.rocks).toHaveLength(0);
    expect(plan.landscapes?.filter(({ kind }) => kind === "rock") ?? []).toHaveLength(0);
    expect(plan.farming).toBeUndefined();
    expect(plan.naturalVegetation?.settings.companionStoneDensity).toBe(0);
    expect(plan.flowerRegions ?? []).toHaveLength(0);
    expect(Object.values(plan.naturalVegetation!.world).every(density => density === 0)).toBe(true);
    const template = WORLD_TEMPLATES.find(entry => entry.id === "titan-wasteland")!;
    const nodes = buildWorldTemplateGeometry(template, 110613).nodes;
    expect(nodes.map((node) => node.id)).toEqual(["ancient-mech-wreck", "broken-stone-arch"]);
    expect(nodes.every((node) => node.assetUrl)).toBe(true);
    expect(nodes.map((node) => node.scale)).toEqual([[230, 186, 278], [64, 62, 22]]);
    const site = plan.worldTemplateSite!;
    expect(site.footprints.map(({ id, obb, poiId }) => [id, obb.size, Boolean(poiId)]))
      .toEqual(nodes.map((node) => [node.id, node.scale, true]));
    expect(plan.spawn).toEqual({ x: 512, z: 512 });
    expect(plan.spawn).toEqual({ x: site.spawnView!.eye[0], z: site.spawnView!.eye[2] });

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
  it("publishes parameter-derived Sakura roads, water and vegetation consistently on incremental and saved replay", () => {
    const document = createTemplatePlanningDocument(20261107, "sakura-pearl");
    const first = generatePlanningDocument(document);
    expect(first.accepted).toBe(true);
    const relief = first.plan.rocks.filter((rock) => rock.groupId === COMPOSITION_RELIEF_OWNER);
    expect(relief.length).toBeGreaterThan(0);
    const q = first.plan.parameters.spatialComposition!;
    expect(Math.max(...relief.flatMap((rock) => rock.boxes!.map((box) => box.sizeY)))).toBe(
      Math.max(q.leftReliefM!, q.rightReliefM!)
    );
    const jobs = rockFormationJobs(first.plan, planningHeightmap(first.plan)).filter((job) =>
      job.id.startsWith(COMPOSITION_RELIEF_OWNER + ":")
    );
    expect(jobs).toHaveLength(relief.reduce((count, rock) => count + rock.boxes!.length, 0));
    const settings = readRockFormationSettings(document),
      mesh = generateRockFormation(jobs[0], settings);
    expect(mesh.mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.mesh.indices.length / 3).toBeLessThanOrEqual(settings.targetTriangles);
    expect(mesh.mesh.positions.every(Number.isFinite)).toBe(true);
    expect(mesh.mesh.normals!.every(Number.isFinite)).toBe(true);
    // Waterfalls retain their resolved drop while no part of the rock relief,
    // including the upstream support, is raised through a Terrain height field.
    expect(compositionTerrain(q)).toEqual([]);
    expect(first.plan.waters.some((water) => water.course?.drops.length)).toBe(true);
    expect(
      first.plan.waters.filter((water) => water.id.startsWith("river:authored:landscape-composition:"))
    ).toHaveLength(3);
    expect(first.plan.routes.some((route) => route.id === "landscape-composition:path")).toBe(true);
    const trees = first.plan.landscapes!.filter((item) => item.ownerId === "landscape-composition");
    expect(trees.length).toBeGreaterThan(0);
    const ledgeTrees = first.plan.landscapes!.filter(
      (item) => item.ownerId === COMPOSITION_RELIEF_OWNER && item.kind === "tree"
    );
    expect(ledgeTrees.length).toBeGreaterThan(0);
    expect(
      ledgeTrees.every(
        (tree) => tree.assetId === q.treeAssetId && tree.baseHeight > planningHeightmap(first.plan).sample(tree.center)
      )
    ).toBe(true);
    expect(Math.min(...relief.flatMap((rock) => rock.boxes!.map((box) => box.center.z - box.sizeZ / 2)))).toBeLessThan(
      q.centerZ!
    );
    const snapshot = structuredClone(first.plan.landscapes);
    const replay = generatePlanningDocument(
      importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(document)))),
      first
    );
    expect(replay.accepted).toBe(true);
    expect(replay.plan.landscapes).toEqual(first.plan.landscapes);
    expect(first.plan.landscapes).toEqual(snapshot);
    const edited = {
      ...document,
      ...applySpatialCommands(
        document,
        [
          {
            op: "set",
            entity: "world",
            component: "landscapeComposition",
            values: { roadWidthM: 0, streamWidthM: 0, waterfallWidthM: 0, treeSpacingM: 0, rockSpacingM: 0 }
          }
        ],
        planningRegistry
      )
    };
    const incremental = generatePlanningDocument(edited, replay);
    const cold = generatePlanningDocument(importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(edited)))));
    expect(incremental.accepted).toBe(true);
    expect(cold.accepted).toBe(true);
    for (const key of ["waters", "routes", "landscapes", "rocks", "worldTemplateSite"] as const)
      expect(incremental.plan[key]).toEqual(cold.plan[key]);
    expect(incremental.plan.waters.some((item) => item.id.includes("landscape-composition"))).toBe(false);
    expect(incremental.plan.routes.some((item) => item.id.includes("landscape-composition"))).toBe(false);
    expect(incremental.plan.landscapes!.some((item) => item.ownerId === "landscape-composition")).toBe(false);
  }, 30000);
  it("restores Sakura composition parameters from a legacy save and preserves explicit overrides", () => {
    const document = createSeedPlanningInputs(1);
    document.entities.world.components.worldTemplate = { values: { id: "sakura-pearl", centerX: 480, centerZ: 520 } };
    document.authoredResources = [
      {
        resourceType: "vegetation-brush",
        resourceId: "template:sakura-pearl:vegetation:old-grove",
        properties: {
          category: "tree",
          plantKind: "tree",
          distributionKind: "area",
          x: 480,
          z: 520,
          radiusMetres: 10,
          densityScale: 1,
          seed: 1
        }
      }
    ];
    const migrated = upgradePlanningDocument(document);
    const q = exportPlanningRecipe(migrated).parameters.spatialComposition!;
    expect(q).toEqual(
      spatialCompositionParameters({
        ...WORLD_TEMPLATE_ART["sakura-pearl"].generation,
        centerX: 480,
        centerZ: 520,
        seed: templateBaseSeed("sakura-pearl")
      })
    );
    expect(migrated.authoredResources).toEqual([]);
    const retiredDestination = structuredClone(migrated);
    retiredDestination.entities.world.components.landscapeComposition.values.destinationId = "garden-pavilion";
    expect(
      upgradePlanningDocument(retiredDestination).entities.world.components.landscapeComposition.values.destinationId
    ).toBe("");
    const edited = {
      ...migrated,
      ...applySpatialCommands(
        migrated,
        [
          {
            op: "set",
            entity: "world",
            component: "landscapeComposition",
            values: { roadWidthM: 0, treeSpacingM: 0, headingDegrees: 35, destinationId: "pearl-cherry-tree" }
          }
        ],
        planningRegistry
      )
    };
    const restored = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(edited))));
    expect(exportPlanningRecipe(restored).parameters.spatialComposition).toMatchObject({
      roadWidthM: 0,
      treeSpacingM: 0,
      headingDegrees: 35,
      destinationId: "pearl-cherry-tree"
    });
    expect(restored.entities.world.components.landscapeComposition).toEqual(
      edited.entities.world.components.landscapeComposition
    );
    expect(document.entities.world.components.landscapeComposition.values).toEqual({});
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
      expect(luminance).toBeGreaterThan(Number(WORLD_TEMPLATE_ART["sakura-pearl"].postProcess.bloomThreshold));
    }
    expect(rgb("SM_Mushroom_01", "cap")[0]).toBeGreaterThan(1);
    expect(rgb("SM_Mushroom_01", "stem")).not.toEqual(rgb("SM_Mushroom_01", "cap"));
    expect(rgb("SM_BirchTree_02", "leaves")).toEqual(templateLinearColor("#c179ed"));
    expect(rgb("SM_CoverPlant_06", "foliage", "appearance-431c9ee4ddb29dc7")).toEqual(
      templateLinearColor("#66b83f").map((channel) => channel * 1.1)
    );
    for (const green of [
      templateLinearColor(WORLD_TEMPLATE_ART["sakura-pearl"].grass[1]),
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
    it(`${template.name}: fits the complete subject at standing height in landscape and portrait viewports`, () => {
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
        const { eye, target, fovDegrees } = resolveWorldTemplateView(scene, aspect, 50, 1.8, ground).pose;
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
              ).toBeLessThanOrEqual(1);
              expect(Math.abs(dot(v, up) / (depth * Math.tan((fovDegrees * Math.PI) / 360)))).toBeLessThanOrEqual(1);
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
    it(`${template.name}: reserves its subject before publishing buildings, rocks and roads`, () => {
      const result = generatePlanningDocument(createTemplatePlanningDocument(20261104, template.id));
      expect(result.accepted).toBe(true);
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
        for (const outline of footprints)
          for (const occupied of site.footprints)
            expect(overlap(outline, occupied.outline), JSON.stringify({ id: object.id, outline, occupied })).toBe(
              false
            );
      }
    }, 60000);
    it(`${template.name}: validates native authoring, Scene round-trip and Seed scope restoration`, () => {
      const doc = createTemplatePlanningDocument(7, template.id);
      expect(() => applySpatialCommands(doc, [], planningRegistry)).not.toThrow();
      const recipe = exportPlanningRecipe(doc);
      expect(recipe.parameters.worldTemplate?.id).toBe(template.id);
      expect(recipe.parameters.landformSeed).toBe(templateBaseSeed(template.id));
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
      expect(createSpatialTerrainPlan(sameShape).land).toEqual(terrainA.land);
      expect(terrainA.parameters.terrainPatches!.map((p) => [p.x, p.z])).toEqual(
        terrainB.parameters.terrainPatches!.map((p) => [p.x, p.z])
      );
      expect(a.parameters.terrainSkeleton!.heightM / template.terrain.heightM).toBeGreaterThanOrEqual(0.94);
      expect(a.parameters.terrainSkeleton!.heightM / template.terrain.heightM).toBeLessThanOrEqual(1.06);
      expect(b.parameters.terrainSkeleton!.heightM / template.terrain.heightM).toBeGreaterThanOrEqual(0.94);
      expect(b.parameters.terrainSkeleton!.heightM / template.terrain.heightM).toBeLessThanOrEqual(1.06);
      const geometry = buildWorldTemplateGeometry(template, 0);
      expect(buildWorldTemplateGeometry(template, 0)).toEqual(geometry);
      const other = buildWorldTemplateGeometry(template, 0xffffffff);
      expect(other).toEqual(geometry);
      expect(geometry.nodes.length).toBeGreaterThan(0);
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
