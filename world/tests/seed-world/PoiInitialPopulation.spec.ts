import { describe, expect, it } from "vitest";
import { importPlanningDocument, exportPlanningAuthoring, upgradePlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { createSeedPlanningDocument, createSeedPlanningInputs } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { initializePlanningPopulation } from "@galacean/engine-world-planning/spatial/PlanningPopulationInitialization";
import { applySpatialCommands } from "@galacean/engine-world-planning/spatial/SpatialDocument";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import { exportPlanningScene, importPlanningScene } from "../../demos/seed-world/src/planning/spatial/PlanningSceneAsset.ts";
import { SEMANTIC_DEFAULTS } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { defaultPoiLayout } from "@galacean/engine-world-planning/semantic-study/PoiDistribution";
import { initialLayoutConfiguration } from "@galacean/engine-world-planning/spatial/layout/LayoutProfiles";
import { solveLayoutGroup } from "@galacean/engine-world-planning/spatial/layout/LayoutKernel";
import { VolumeIndex } from "@galacean/engine-world-planning/spatial/layout/Volumes";
import { generateSpatialWorld } from "@galacean/engine-world-planning/spatial/layout/SpatialWorld";
import { reliefField } from "@galacean/engine-world-planning/spatial/terrain/ReliefField";
import { volumeGroundSlope } from "@galacean/engine-world-planning/spatial/layout/VolumeTerrain";
import { createPlanningGroundSampler } from "@galacean/engine-world-planning/semantic-study/WorldPlanningTerrain";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { importRuntimeHierarchy } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-hierarchy-source";
import { RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";

const site = { id: "plateau-village", origin: { x: 512, z: 512 }, center: { x: 512, z: 512 },
  domainId: "land-main", active: true, areaM2: 1, weightM2: 0, memberIds: [] };
const generate = (document: Parameters<typeof generateSpatialWorld>[0]) =>
  generateSpatialWorld(document, undefined, undefined, { environment: false });
const villages = (result: ReturnType<typeof generate>) => new Set(result.plan.buildings.map(building => building.regionId));
let defaultDocument: ReturnType<typeof createSeedPlanningDocument> | undefined;
const firstVisit = () => structuredClone(defaultDocument ??= createSeedPlanningDocument(1));

function flatInputs() {
  const document = createSeedPlanningInputs(1);
  for (const type of ["terrain", "rivers", "lakes"]) Object.assign(document.entities.world.components[type].values, { countMin: 0, countMax: 0 });
  return document;
}

describe("building terrain acceptance", () => {
  it("uses pedestrian spacing for building purposes independently of the sampled organization", () => {
    for (const branchShape of ["radial", "curve"] as const) {
      const organization = { id: "connected", weight: 1, elementProfile: "outcrop", roadMode: "none", branchShape };
      const building = initialLayoutConfiguration(7, site, undefined, "habitable", organization).rule;
      expect([building.spacingMinM, building.spacingMaxM]).toEqual([4, 8]);
      expect(building.spacingMinM).toBeGreaterThan(building.pathWidthM);
      const rock = initialLayoutConfiguration(7, site, undefined, "outcrop", organization).rule;
      expect([rock.spacingMinM, rock.spacingMaxM]).toEqual(branchShape === "curve" ? [-28, 8] : [36, 60]);
    }
    expect(() => planningRegistry.validate("layout", {
      elementProfile: "habitable", spacingMinM: -2, spacingMaxM: 8
    })).not.toThrow();
  });

  it("uses the 12 degree physical slope limit independently of a flat plateau's altitude", () => {
    const configuration = initialLayoutConfiguration(7, site, undefined, "habitable");
    expect(configuration.rule.maxGroundSlopeDegrees).toBe(12);
    expect(configuration).not.toHaveProperty("terrainPlacement");
    const construction = { members: [[{ center: { x: 512, z: 512 }, width: 8, depth: 8, height: 5, yaw: 0, elevation: 0 }]] };
    const solve = (slope: number) => solveLayoutGroup(site.id, site.center, configuration.rule, 7, new VolumeIndex(),
      () => true, point => 100 + (point.x - 512) * Math.tan(slope * Math.PI / 180),
      undefined, {}, "", {}, () => true, undefined, construction);
    expect(solve(0).volumes).toHaveLength(1);
    expect(solve(0).volumes[0].boxes[0].elevation).toBeCloseTo(99.95);
    expect(solve(11).volumes).toHaveLength(1);
    expect(solve(13).volumes).toHaveLength(0);
  });

  it("realizes buildings on raised gentle terrain that the former displacement gate rejected", () => {
    const patch = { id: "wide-raised-ground", x: 512, z: 512, yawDegrees: 0, lengthM: 5000,
      leftWidthM: 5000, rightWidthM: 5000, heightM: 50, bendM: 0 };
    const config = defaultPoiLayout();
    config.candidates = [{ id: site.id, origin: site.origin, domainId: site.domainId }];
    const document = importPlanningDocument({ version: 2, parameters: { ...SEMANTIC_DEFAULTS, seed: 7, poiLayout: config,
      rivers: { count: 0 }, lakes: { count: 0 }, terrainSkeleton: { count: 0, directionDegrees: 0, heightM: 50, widthM: 160 }, terrainPatches: [patch] }, edits: {} });
    document.entities.world.components.layout.values = { elementProfile: "habitable", spacingMinM: 25, spacingMaxM: 25 };
    const result = generate(document);
    const ground = createPlanningGroundSampler(result.plan, { natural: true });
    const displacement = reliefField([patch]);
    const volumes = result.plan.spatialLayout!.groups.flatMap(group => group.volumes);
    expect(result.plan.buildings.length).toBeGreaterThan(0);
    expect(volumes.length).toBeGreaterThan(0);
    for (const volume of volumes) {
      expect(volumeGroundSlope(volume, ground)).toBeLessThanOrEqual(12.000001);
      for (const box of volume.boxes) expect(displacement(box.center)).toBeGreaterThan(1);
    }
  }, 60000);
});

describe("first-visit population authoring", () => {
  it("creates one to ten villages and at most twenty buildings, then reloads the same native Scene", () => {
    const document = firstVisit();
    expect(document.populationInitialization).toMatchObject({ villageMin: 1, villageMax: 10, buildingMax: 20 });
    const first = generate(document);
    expect(villages(first).size).toBeGreaterThanOrEqual(1);
    expect(villages(first).size).toBeLessThanOrEqual(10);
    expect(first.plan.buildings.length).toBeGreaterThan(0);
    expect(first.plan.buildings.length).toBeLessThanOrEqual(20);
    for (const group of first.plan.spatialLayout!.groups.filter(group => villages(first).has(group.id))) {
      expect([group.rule.spacingMinM, group.rule.spacingMaxM]).toEqual([4, 8]);
    }
    const restored = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(document))));
    const cold = generate(restored);
    expect(cold.plan.buildings).toEqual(first.plan.buildings);
    expect(cold.plan.spatialLayout!.elementProfiles).toEqual(first.plan.spatialLayout!.elementProfiles);
  }, 60000);

  it("accepts custom initialization targets without changing the source authoring", () => {
    const source = flatInputs(), before = structuredClone(source);
    const populated = initializePlanningPopulation(source, { villageTarget: 2, buildingLimit: 40 });
    expect(source).toEqual(before);
    const result = generate(populated);
    expect(villages(result).size).toBe(2);
    expect(result.plan.buildings.length).toBeGreaterThan(0);
    expect(result.plan.buildings.length).toBeLessThanOrEqual(40);
    const empty = generate(initializePlanningPopulation(source, { villageTarget: 0, buildingLimit: 0 }));
    expect(empty.plan.buildings).toHaveLength(0);
  }, 60000);

  it("caps dense initialization through member ranges without changing spacing and lets the same village grow", () => {
    const source = flatInputs();
    source.entities.world.components.layout.values = {
      elementProfile: "habitable", branchShape: "radial", roadMode: "none",
      spacingMinM: 0, spacingMaxM: 0, widthMinM: 8, widthMaxM: 8, depthMinM: 8, depthMaxM: 8
    };
    const probe = generate(source);
    expect(probe.plan.buildings.length).toBeGreaterThan(20);
    const initialized = initializePlanningPopulation(source, { villageTarget: 1, buildingLimit: 5 });
    const id = initialized.populationInitialization!.selectedPoiIds[0];
    expect(probe.plan.buildings.filter(building => building.regionId === id).length).toBeGreaterThan(5);
    const saved = initialized.entities[id].components.layout.values;
    expect(saved.spacingMinM).toBeUndefined();
    expect(saved.spacingMaxM).toBeUndefined();
    expect(saved.memberMin).toBe(0);
    expect(saved.memberMax).toBe(5);
    expect(initialized.entities.world.components.layout.values).toEqual(source.entities.world.components.layout.values);
    const bounded = generate(initialized);
    expect(villages(bounded).size).toBe(1);
    expect(bounded.plan.buildings.length).toBeGreaterThan(0);
    expect(bounded.plan.buildings.length).toBeLessThanOrEqual(5);
    const restored = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(initialized))));
    expect(restored.entities[id].components.layout.values).toEqual(saved);
    expect(generate(restored).plan.buildings).toEqual(bounded.plan.buildings);
    const edited = applySpatialCommands(restored, [{ op: "set", entity: id, component: "layout",
      values: { memberMin: 0, memberMax: 30 } }], planningRegistry);
    const expanded = generate(edited);
    expect(villages(expanded)).toEqual(new Set([id]));
    expect(expanded.plan.buildings.length).toBeGreaterThan(20);
    expect(expanded.plan.buildings.length).toBeLessThanOrEqual(30);
    const cold = generate(importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(edited)))));
    expect(cold.plan.buildings).toEqual(expanded.plan.buildings);
  }, 60000);

  it("shares a twenty-building budget across two villages and releases only its own caps on explicit replanning", () => {
    const source = flatInputs();
    source.entities.world.components.layout.values = {
      elementProfile: "habitable", branchShape: "radial", roadMode: "none",
      spacingMinM: 0, spacingMaxM: 0, widthMinM: 8, widthMaxM: 8, depthMinM: 8, depthMaxM: 8
    };
    const initialized = initializePlanningPopulation(source, { villageMin: 2, villageMax: 2, buildingMax: 20 });
    const bounded = generate(initialized);
    expect(villages(bounded).size).toBe(2);
    expect(bounded.plan.buildings.length).toBe(20);
    const selected = initialized.populationInitialization!.selectedPoiIds;
    expect(selected.map(id => Number(initialized.entities[id].components.layout.values.memberMax))
      .reduce((sum, count) => sum + count, 0)).toBe(20);
    for (const id of selected) expect(bounded.plan.buildings.some(building => building.regionId === id)).toBe(true);
    const replanned = initializePlanningPopulation(initialized, { buildingMax: 40 });
    const larger = generate(replanned);
    expect(villages(larger).size).toBe(2);
    expect(larger.plan.buildings.length).toBe(40);
    expect(generate(importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(replanned))))).plan.buildings)
      .toEqual(larger.plan.buildings);
    // A deliberately edited endpoint is not mistaken for the previous operation's cap.
    const changed = structuredClone(initialized);
    const limitedId = selected[0];
    changed.entities[limitedId].components.layout.values.memberMax = 2;
    const afterLocal = initializePlanningPopulation(changed, { buildingMax: 40 });
    const actual = generate(afterLocal);
    expect(afterLocal.entities[limitedId].components.layout.values.memberMax).toBe(2);
    expect(actual.plan.buildings.filter(building => building.regionId === limitedId).length).toBeLessThanOrEqual(2);
  }, 120000);

  it("respects a smaller inherited member range and reports unattained population minimums", () => {
    const source = flatInputs();
    source.entities.world.components.layout.values = {
      elementProfile: "habitable", branchShape: "radial", roadMode: "none",
      spacingMinM: 0, spacingMaxM: 0, widthMinM: 8, widthMaxM: 8, depthMinM: 8, depthMaxM: 8,
      memberMin: 0, memberMax: 2
    };
    const initialized = initializePlanningPopulation(source, {
      villageMin: 2, villageMax: 2, buildingMin: 10, buildingMax: 20
    });
    const result = generate(initialized);
    expect(villages(result).size).toBe(2);
    expect(result.plan.buildings.length).toBe(4);
    expect(initialized.populationInitialization!.diagnostics.some(message => message.includes("10"))).toBe(true);
    for (const id of initialized.populationInitialization!.selectedPoiIds)
      expect(initialized.entities[id].components.layout.values.memberMax).toBe(2);
    expect(initialized.entities.world.components.layout.values).toEqual(source.entities.world.components.layout.values);
  }, 60000);

  it("allows later author edits to exceed both initial targets and preserves them after cold reload", () => {
    const initial = initializePlanningPopulation(flatInputs());
    const first = generate(initial);
    const ids = first.plan.poiDistribution!.sites.filter(site => site.active).map(site => site.id);
    expect(ids.length).toBeGreaterThan(1);
    const commands = ids.map(id => ({ op: "set" as const, entity: id, component: "layout",
      values: { elementProfile: "habitable", spacingMinM: 12, spacingMaxM: 12,
        widthMinM: 8, widthMaxM: 8, depthMinM: 8, depthMaxM: 8 } }));
    const edited = applySpatialCommands(initial, commands, planningRegistry);
    const expanded = generate(edited);
    expect(villages(expanded).size).toBeGreaterThan(1);
    expect(expanded.plan.buildings.length).toBeGreaterThan(20);
    const cold = generate(importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(edited)))));
    expect(cold.plan.buildings).toEqual(expanded.plan.buildings);
    expect(cold.plan.spatialLayout!.elementProfiles).toEqual(expanded.plan.spatialLayout!.elementProfiles);
  }, 60000);

  it("does not apply first-visit targets to an existing uncapped saved world", () => {
    const document = flatInputs();
    document.entities.world.components.layout.values = { elementProfile: "habitable", spacingMinM: 12, spacingMaxM: 12 };
    const original = generate(document);
    expect(villages(original).size).toBeGreaterThan(1);
    expect(original.plan.buildings.length).toBeGreaterThan(20);
    const restored = upgradePlanningDocument(JSON.parse(JSON.stringify(exportPlanningAuthoring(document))));
    expect(generate(restored).plan.buildings).toEqual(original.plan.buildings);
  }, 60000);

  it("creates the twenty-first native House through the authoring API and retains its identity on reload", () => {
    const path = "World.scene", files = [{ virtualPath: path, path, type: "Scene" }];
    const authoring = firstVisit();
    const original: RuntimeProjectPackage = { version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: path, files },
      contents: { [path]: JSON.stringify(importRuntimeHierarchy(exportPlanningScene(authoring), path, files, () => true)) } };
    const formats = nativeAssetFormats(() => ({}));
    const draft = new RuntimeProjectEdit(original, formats), scene = new RuntimeSceneEdit(draft, path);
    const generator = scene.create({ name: "Author-created village" });
    scene.addComponent(generator.id, { type: "BuildingGeneratorComponent", props: { initialized: true } });
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      const entity = scene.create({ name: `New house ${i + 1}`, parentEntityId: generator.id, position: [i * 20, 0, 0] });
      const component = scene.addComponent(entity.id, { type: "HouseComponent", props: {
        shape: { $type: "RectangularBuildingShape", width: 8, depth: 8 }, height: 5, seed: i + 1
      } });
      ids.push(component.id);
    }
    expect(scene.queryComponents({ type: "HouseComponent" })).toHaveLength(21);
    const saved = draft.finish();
    const cold = new RuntimeSceneEdit(new RuntimeProjectEdit(JSON.parse(JSON.stringify(saved)), formats), path);
    expect(cold.queryComponents({ type: "HouseComponent" }).map(component => component.id)).toEqual(ids);
    expect(cold.readComponent(ids[20]).props).toMatchObject({ height: 5, seed: 21 });
    expect(cold.readEntity(generator.id).children).toHaveLength(21);
    // Native Source components have their own persistent lifecycle; they are not
    // procedural plan.buildings and this check does not claim GPU compilation.
    expect(JSON.parse(original.contents[path] as string).components.some((component: any) => component.type === "HouseComponent")).toBe(false);
  }, 60000);
});
