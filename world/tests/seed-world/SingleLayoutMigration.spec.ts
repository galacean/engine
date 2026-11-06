import { describe, expect, it } from "vitest";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import {
  exportPlanningAuthoring,
  exportPlanningRecipe,
  importPlanningDocument,
  upgradePlanningDocument
} from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import { applySpatialCommands, resolveComponent } from "@galacean/engine-world-planning/spatial/SpatialDocument";
import { PlanningProjectStorage } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningProjectStorage";
import { importRuntimeHierarchy } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-hierarchy-source";
import { RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { layoutRandom } from "@galacean/engine-world-planning/spatial/layout/LayoutRules";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import {
  exportPlanningScene,
  importPlanningScene,
  PLANNING_ENTITY_COMPONENT
} from "../../demos/seed-world/src/planning/spatial/PlanningSceneAsset";

const ordinary = {
  pattern: "connected",
  memberMin: 1,
  memberMax: 1,
  branchShape: "radial",
  roadMode: "none",
  openRadiusM: 0,
  radialVariationM: 0,
  orientationVariation: 0
};
const legacyValues = {
  pattern: "single",
  widthMinM: 60,
  widthMaxM: 60,
  depthMinM: 40,
  depthMaxM: 40,
  heightMinM: 90,
  heightMaxM: 90,
  headingDegrees: 0,
  variationSeed: 0,
  orientationVariation: 0.7,
  branchShape: "curve",
  radialVariationM: 50,
  roadMode: "members",
  openRadiusM: 70
} as const;

describe("retired single layout authoring", () => {
  it("migrates world, explicit bases, children and archived Seeds without freezing dimensions or anchors", () => {
    const old = createSeedPlanningDocument(110814);
    old.entities.world.components.layout.values = { ...legacyValues };
    old.entities["base"] = {
      id: "base",
      name: "Base",
      components: {
        layout: {
          values: { pattern: "single", headingDegrees: 35, widthMinM: 20, widthMaxM: 80 },
          base: { entity: "world", component: "layout" }
        }
      }
    };
    old.entities["child"] = {
      id: "child",
      name: "Child",
      components: {
        layout: {
          values: { orientationVariation: 0.5, widthMaxM: 100, variationSeed: 9 },
          base: { entity: "base", component: "layout" }
        },
        anchor: { values: { x: 123, z: 456 } }
      }
    };
    old.entities["other"] = {
      id: "other",
      name: "Other",
      components: {
        layout: {
          values: { pattern: "connected", branchShape: "curve" },
          base: { entity: "base", component: "layout" }
        }
      }
    };
    old.layoutOverrides = {
      "110815": {
        entities: structuredClone(old.entities),
        edits: {},
        parameters: structuredClone(old.passthrough.parameters)
      }
    };
    const upgraded = upgradePlanningDocument(old);
    for (const scope of [upgraded, upgraded.layoutOverrides!["110815"]]) {
      expect(scope.entities.world.components.layout.values).toMatchObject(ordinary);
      expect(scope.entities.base.components.layout.values).toMatchObject({
        ...ordinary,
        headingDegrees: 35,
        widthMinM: 20,
        widthMaxM: 80
      });
      const child = resolveComponent(
        { ...upgraded, entities: scope.entities },
        "child",
        "layout",
        planningRegistry
      ).values;
      expect(child).toMatchObject({ ...ordinary, headingDegrees: 35, widthMinM: 20, widthMaxM: 100, variationSeed: 9 });
      expect(scope.entities.child.components.layout.base).toEqual({ entity: "base", component: "layout" });
      expect(scope.entities.child.components.layout.values.memberMax).toBeUndefined();
      expect(scope.entities.child.components.anchor.values).toEqual({ x: 123, z: 456 });
      expect(scope.entities.child.components.solid).toBeUndefined();
      expect(scope.entities.other.components.layout.values).toMatchObject({
        pattern: "connected",
        branchShape: "curve",
        memberMin: 0,
        memberMax: Number.MAX_SAFE_INTEGER,
        orientationVariation: 0.7,
        roadMode: "members",
        openRadiusM: 70,
        radialVariationM: 50
      });
    }
    expect(upgradePlanningDocument(upgraded)).toEqual(upgraded);
    expect(old.entities.world.components.layout.values.pattern).toBe("single");
    expect(() => applySpatialCommands(upgraded, [], planningRegistry)).not.toThrow();
    expect(planningRegistry.get("layout").fields.find((field) => field.key === "pattern")!.options).not.toContain(
      "single"
    );
  });

  it("preserves recent single-layout content when an old wrapper omits migration metadata", () => {
    const old = createSeedPlanningDocument(110814);
    delete old.poiAuthoringVersion;
    delete old.layoutVersion;
    old.entities["poi-6-4"] = { id: "poi-6-4", name: "Village", components: { layout: { values: { ...legacyValues, elementProfile: "habitable" } } } };
    expect(upgradePlanningDocument(old).entities["poi-6-4"].components.layout.values.elementProfile).toBe("habitable");
  });

  it("migrates recipe and old native Scene imports through the shared author boundary", () => {
    const document = createSeedPlanningDocument(110814);
    const recipe = exportPlanningRecipe(document);
    recipe.parameters.poiLayout!.layoutDefaults = { ...legacyValues };
    const imported = importPlanningDocument(recipe);
    expect(imported.entities.world.components.layout.values).toMatchObject(ordinary);
    expect(exportPlanningRecipe(imported).parameters.poiLayout!.layoutDefaults).toMatchObject(ordinary);
    document.entities.world.components.layout.values = { ...legacyValues };
    document.layoutOverrides = {
      "110815": {
        entities: structuredClone(document.entities),
        edits: {},
        parameters: structuredClone(recipe.parameters)
      }
    };
    const native = exportPlanningScene(document);
    for (const component of native.components)
      if (component.type === PLANNING_ENTITY_COMPONENT && component.props.planningId === "world")
        (component.props.spatialComponents as any).layout.values = { ...legacyValues };
    const restored = importPlanningScene(native);
    expect(restored.entities.world.components.layout.values).toMatchObject(ordinary);
    expect(restored.layoutOverrides!["110815"].entities.world.components.layout.values).toMatchObject(ordinary);
    expect(exportPlanningAuthoring(restored)).toEqual(restored);
    expect(importPlanningScene(document).entities.world.components.layout.values).toMatchObject(ordinary);
  });

  it("replays seed 110814 fixed 60x40x90 envelope and authored roads across DB and native Scene", async () => {
    const old = createSeedPlanningDocument(110814);
    const id = "poi-6-4";
    old.entities[id] ??= { id, name: id, components: {} };
    old.entities[id].components.layout = { values: { ...legacyValues, elementProfile: "habitable" } };
    old.entities[`${id}:volume:0`] = {
      id: `${id}:volume:0`,
      name: "Edited envelope",
      components: { solid: { values: { x: 747.5919901907849 } } }
    };
    const roadId = "world-route-land-main-poi-2-0:guide:0:port-poi-2-2:spine:0:port";
    old.entities[roadId] = {
      id: roadId,
      name: roadId,
      components: { roadPath: { values: { keypoints: [{ id: "via", x: 270, z: 177 }] } } }
    };
    const path = "World.scene", files = [{ virtualPath: path, path: "runtime-world:scene", type: "Scene" }];
    const legacyScene = exportPlanningScene(old);
    const oldOwner = legacyScene.components.find(component => component.type === PLANNING_ENTITY_COMPONENT && component.props.planningId === id)!;
    (oldOwner.props.spatialComponents as any).layout.values = { ...legacyValues, elementProfile: "habitable" };
    let pack: RuntimeProjectPackage = {
      version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: path, files },
      contents: { [path]: JSON.stringify(importRuntimeHierarchy(legacyScene, path, files, () => true)) },
      documents: { [`${path}.planning-source.json`]: JSON.stringify({ version: 2, poiAuthoringVersion: 2 }) }
    };
    const storage = new PlanningProjectStorage({ get projectPackage() { return pack; }, async publish(next) { pack = structuredClone(next); } });
    const migrated = (await storage.load(110814))!;
    await storage.migrateToSource(migrated);
    const persisted = JSON.parse(pack.contents[path] as string).components.find((component:any) => component.type === PLANNING_ENTITY_COMPONENT && component.props.planningId === id).props.spatialComponents.layout.values;
    expect(persisted).toMatchObject({ ...ordinary, elementProfile: "habitable", widthMinM:60, widthMaxM:60, depthMinM:40, depthMaxM:40, heightMinM:90, heightMaxM:90 });
    expect(JSON.parse(pack.documents![`${path}.planning-source.json`])).toEqual({ version:2, poiAuthoringVersion:2, layoutControlsVersion:1 });
    const once = structuredClone(pack);
    await storage.migrateToSource(migrated);
    expect(pack).toEqual(once);
    expect(migrated.entities[id].components.layout.values.elementProfile).toBe("habitable");
    const session = new PlanningSession(exportPlanningRecipe(migrated), undefined, migrated);
    await session.initialize();
    const group = session.result!.plan.spatialLayout!.groups.find((group) => group.id === id)!;
    expect(group.volumes).toHaveLength(1);
    expect(session.result!.plan.spatialLayout!.elementProfiles?.[id]).toBe("habitable");
    expect(session.result!.plan.buildings.filter((building)=>building.id===`${id}:volume:0`)).toHaveLength(1);
    expect(group.volumes[0].boxes[0]).toMatchObject({
      width: 60,
      depth: 40,
      height: 90,
      yaw: 0,
      center: { x: 747.5919901907849 }
    });
    const authoredRoad = session.result!.plan.routes.find((route) => route.id === roadId);
    expect(
      authoredRoad,
      JSON.stringify(session.result!.checks.filter((check) => check.owners?.includes(roadId)))
    ).toBeDefined();
    expect(authoredRoad!.points.some((point) => Math.hypot(point.x - 270, point.z - 177) < 1e-4)).toBe(true);
    await storage.save(session.export());
    const saved = JSON.parse(JSON.stringify((await storage.load(110814))!));
    for (const restored of [
      upgradePlanningDocument(saved),
      upgradePlanningDocument(importPlanningScene(exportPlanningScene(saved)))
    ]) {
      const replay = new PlanningSession(exportPlanningRecipe(restored), undefined, restored);
      await replay.initialize();
      expect(replay.result!.plan.spatialLayout!.groups).toEqual(session.result!.plan.spatialLayout!.groups);
      expect(replay.result!.plan.routes).toEqual(session.result!.plan.routes);
      expect(replay.result!.plan.roadGraph).toEqual(session.result!.plan.roadGraph);
      expect(restored.entities[roadId].components.roadPath.values.keypoints).toEqual([{ id: "via", x: 270, z: 177 }]);
    }
    const receipt = await session.dispatchParameters([
      { op: "set", entity: id, component: "layout", values: { widthMinM: 70, widthMaxM: 70 } }
    ]);
    expect(receipt.status, receipt.message).toBe("accepted");
    expect(session.result!.plan.spatialLayout!.groups.find((group) => group.id === id)!.volumes[0].boxes[0].width).toBe(
      70
    );
    expect(session.document.entities[`${id}:volume:0`].components.solid.values.width).toBeUndefined();
    const ranged = await session.dispatchParameters([
      { op: "set", entity: id, component: "layout", values: { widthMinM: 50, widthMaxM: 70, variationSeed: 9 } }
    ]);
    expect(ranged.status, ranged.message).toBe("accepted");
    const rangedWidth = session.result!.plan.spatialLayout!.groups.find((group) => group.id === id)!.volumes[0].boxes[0]
      .width;
    expect(rangedWidth).toBeCloseTo(50 + 20 * layoutRandom(110814, id, 0, 0, 9)("owner:radial:0:width"), 10);
    expect(rangedWidth).not.toBeCloseTo(50 + 20 * layoutRandom(110814, id, 0, 0, 9)("owner:single:width"), 8);
    expect(session.document.entities[id].components.layout.values).toMatchObject({
      widthMinM: 50,
      widthMaxM: 70,
      variationSeed: 9
    });
  }, 180000);
});
