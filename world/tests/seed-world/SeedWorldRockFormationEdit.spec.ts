import { expect, it, vi } from "vitest";
import type { IslandPlan } from "../../../packages/world-planning/src/semantic-study/IslandPlanModel.ts";
import {
  SEMANTIC_DEFAULTS,
  type SemanticResult
} from "../../../packages/world-planning/src/semantic-study/WorldPlanningContract.ts";
import {
  adoptPlanningHeightmap,
  planningHeightmap
} from "../../../packages/world-planning/src/semantic-study/PlanningHeightmap.ts";
import { PlanningSession } from "../../../packages/world-planning/src/spatial/PlanningSession.ts";
import {
  exportPlanningAuthoring,
  exportPlanningRecipe,
  importPlanningDocument,
  upgradePlanningDocument
} from "../../../packages/world-planning/src/spatial/PlanningDocument.ts";
import {
  exportPlanningScene,
  importPlanningScene
} from "../../demos/seed-world/src/planning/spatial/PlanningSceneAsset.ts";
import {
  applyRockObbSizes,
  rockObbId
} from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Authoring.ts";
import {
  isRockFormationOnlyEdit,
  prepareRockFormationEdit
} from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Edit.ts";
import { canPublishRockFormationEdit } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Publication.ts";
import {
  readRockFormationSettings,
  rockGeometrySettings
} from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Settings.ts";
import { rockFormationJobs } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Jobs.ts";

async function fixture() {
  const recipe = { version: 2 as const, parameters: { ...SEMANTIC_DEFAULTS }, edits: {} };
  const document = importPlanningDocument(recipe);
  const box = (id: string, x: number) => ({
    id,
    label: id,
    center: { x, z: 80 },
    elevation: 12,
    sizeX: 30,
    sizeY: 36,
    sizeZ: 20,
    yaw: 0.3,
    collision: true,
    occlusion: true
  });
  const plan = {
    parameters: { ...SEMANTIC_DEFAULTS },
    land: [],
    islands: [],
    mountains: [],
    buildings: [],
    waters: [],
    routes: [],
    regions: [],
    bridges: [],
    ridges: [],
    supports: [],
    slopes: [],
    spawn: { x: 0, z: 0 },
    rocks: [
      {
        id: "rock",
        groupId: "mountain",
        center: { x: 80, z: 80 },
        width: 70,
        height: 36,
        depth: 20,
        baseHeight: 12,
        yaw: 0.3,
        role: "wall",
        outline: [],
        obb: [],
        boxes: [box("a", 65), box("b", 95)]
      }
    ]
  } as unknown as IslandPlan;
  const height = adoptPlanningHeightmap(plan, {
    resolution: 2,
    spacingX: 1024,
    spacingZ: 1024,
    encoded: new Uint16Array(4),
    heights: new Float32Array(4),
    decodeOffset: 0,
    decodeScale: 1
  });
  const result: SemanticResult = { plan, recipe, accepted: true, checks: [], changedIds: [], notes: [] };
  const execute = vi.fn(async () => result);
  const session = new PlanningSession(recipe, execute, document);
  await session.initialize();
  return { session, execute, plan, height, id: rockObbId("rock", "a") };
}

it("resizes one OBB without running the spatial solver and retains canonical terrain and neighbors", async () => {
  const f = await fixture(),
    before = structuredClone(f.plan);
  const receipt = await f.session.dispatchParameters([
    { op: "set", entity: f.id, component: "rockObb", values: { width: 42, height: 48 } }
  ]);
  expect(receipt.status, receipt.message).toBe("accepted");
  expect(f.execute).toHaveBeenCalledOnce();
  expect(f.session.result!.plan.rocks[0].boxes![0]).toMatchObject({ sizeX: 42, sizeY: 48, elevation: 12 });
  expect(f.session.result!.plan.rocks[0].boxes![1]).toEqual(before.rocks[0].boxes![1]);
  expect(f.session.result!.plan.routes).toBe(f.plan.routes);
  expect(planningHeightmap(f.session.result!.plan).encoded).toBe(f.height.encoded);
  expect(planningHeightmap(f.session.result!.plan).heights).toBe(f.height.heights);
  expect(f.plan).toEqual(before);
  expect(f.session.export().entities[f.id].components.rockObb.values).toEqual({ width: 42, height: 48 });
});

it("does not replay a prior water or content publication when editing an OBB", async () => {
  const f = await fixture();
  const previous: SemanticResult = {
    ...f.session.result!,
    contentUpdate: "instance",
    waterUpdate: {
      bodyId: "lake",
      appearance: false,
      surface: true,
      edit: { mode: "simple", rebuildShoreVegetation: false, affectTerrain: false }
    }
  };
  const result = prepareRockFormationEdit(previous, f.session.export());
  expect(result.waterUpdate).toBeUndefined();
  expect(result.contentUpdate).toBeUndefined();
  expect(result.plan.waters).toBe(previous.plan.waters);
  expect(planningHeightmap(result.plan).heights).toBe(f.height.heights);
});

it("routes OBB edits with buildings through local publication while retaining canonical buffer identities", async () => {
  const f = await fixture();
  f.plan.buildings.push({
    id: "house",
    regionId: "village",
    center: { x: 80, z: 80 },
    width: 8,
    depth: 6,
    height: 6,
    yaw: 0,
    outline: []
  } as any);
  const published: { document: ReturnType<typeof f.session.export>; result: SemanticResult }[] = [];
  const session = new PlanningSession(f.session.recipe(), f.execute, f.session.export(), {
    preparePublication: async (document, result) => {
      if (published.length) {
        const previous = published.at(-1)!;
        expect(
          canPublishRockFormationEdit({ plan: previous.result.plan }, previous.document, document, result.plan)
        ).toBe(true);
        expect(result.plan.routes).toBe(session.result!.plan.routes);
        expect(result.plan.buildings).toBe(session.result!.plan.buildings);
        expect(planningHeightmap(result.plan).heights).toBe(planningHeightmap(previous.result.plan).heights);
        // A simultaneous building layout change must still use a full transaction.
        expect(
          canPublishRockFormationEdit({ plan: previous.result.plan }, previous.document, document, {
            ...result.plan,
            buildings: []
          })
        ).toBe(false);
      }
      return {
        commit() {
          published.push({ document, result });
        },
        discard() {}
      };
    }
  });
  await session.initialize();
  for (const values of [
    { height: 48 },
    { width: 36 }, { depth: 28 }, { height: 30 }
  ]) {
    const receipt = await session.dispatchParameters([{ op: "set", entity: f.id, component: "rockObb", values }]);
    expect(receipt.status, receipt.message).toBe("accepted");
  }
  expect((await session.undo())?.status).toBe("accepted");
  expect((await session.redo())?.status).toBe("accepted");
  expect((await session.dispatchParameters([{ op: "reset", entity: f.id, component: "rockObb" }])).status).toBe(
    "accepted"
  );
  expect(published).toHaveLength(8);
});

it("keeps reset, undo, redo and complete authoring replay consistent without a world rebuild", async () => {
  const f = await fixture();
  await f.session.dispatchParameters([{ op: "set", entity: f.id, component: "rockObb", values: { height: 48 } }]);
  const edited = structuredClone(f.session.result!.plan.rocks);
  expect((await f.session.undo())?.status).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes![0].sizeY).toBe(36);
  expect((await f.session.redo())?.status).toBe("accepted");
  expect(f.session.result!.plan.rocks).toEqual(edited);
  const replay = structuredClone(f.plan);
  applyRockObbSizes(replay, f.session.export());
  expect(replay.rocks).toEqual(edited);
  const reset = await f.session.dispatchParameters([{ op: "reset", entity: f.id, component: "rockObb" }]);
  expect(reset.status, reset.message).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes![0].sizeY).toBe(36);
  expect(f.execute).toHaveBeenCalledOnce();
});

it("accepts global shape edits locally but does not bypass unrelated world changes", async () => {
  const f = await fixture();
  const receipt = await f.session.dispatchParameters([
    { op: "set", entity: "world", component: "rockFormation", values: { wallCount: 18 } }
  ]);
  expect(receipt.status, receipt.message).toBe("accepted");
  expect(f.execute).toHaveBeenCalledOnce();
  const scene = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(f.session.document))));
  expect(readRockFormationSettings(scene).shape.wallCount).toBe(18);
  expect(scene.entities.world.components.rockFormation.values).toEqual({ wallCount: 18 });
  const next = f.session.export();
  next.entities.world.components.rockFormation.values.wallCount = 20;
  expect(isRockFormationOnlyEdit(f.session.document, next)).toBe(true);
  next.entities.world.components.terrain = { values: { mountainHeight: 90 } };
  expect(isRockFormationOnlyEdit(f.session.document, next)).toBe(false);
  delete next.entities.world.components.terrain;
  next.entities.world.name = "edited world";
  expect(isRockFormationOnlyEdit(f.session.document, next)).toBe(false);
  expect(exportPlanningRecipe(f.session.document)).toEqual(f.session.result!.recipe);
});

it("persists texture scale with undo, redo and reset without changing rock geometry or solving the scene", async () => {
  const f = await fixture(),
    before = f.session.result!.plan;
  const initial = readRockFormationSettings(f.session.document);
  expect(initial.textureScale).toBe(0);
  const receipt = await f.session.dispatchParameters([
    { op: "set", entity: "world", component: "rockFormation", values: { textureScale: 24 } }
  ]);
  expect(receipt.status, receipt.message).toBe("accepted");
  const settings = readRockFormationSettings(f.session.document);
  expect(settings.textureScale).toBe(24);
  expect(rockGeometrySettings(settings)).toEqual(rockGeometrySettings(initial));
  expect(f.session.result!.plan.rocks).toEqual(before.rocks);
  expect(f.session.result!.plan.buildings).toBe(before.buildings);
  expect(planningHeightmap(f.session.result!.plan).heights).toBe(f.height.heights);
  const replay = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(f.session.export()))));
  expect(readRockFormationSettings(replay)).toEqual(settings);
  expect((await f.session.undo())?.status).toBe("accepted");
  expect(readRockFormationSettings(f.session.document).textureScale).toBe(0);
  expect((await f.session.redo())?.status).toBe("accepted");
  expect(readRockFormationSettings(f.session.document).textureScale).toBe(24);
  expect(
    (
      await f.session.dispatchParameters([
        { op: "reset", entity: "world", component: "rockFormation", fields: ["textureScale"] }
      ])
    ).status
  ).toBe("accepted");
  expect(readRockFormationSettings(f.session.document).textureScale).toBe(0);
  expect(f.execute).toHaveBeenCalledOnce();
});

it("retires legacy rock palettes on import in active and archived Seeds while preserving Color and OBBs", async () => {
  const f = await fixture();
  await f.session.dispatchParameters([{ op: "set", entity: f.id, component: "rockObb", values: { height: 48 } }]);
  const saved = f.session.export();
  Object.assign(saved.entities.world.components.rockFormation.values, {
    "palette.summer.colorA.r": 0.3,
    "palette.winter.colorB.g": 0.4,
    colorBalance: 0.2,
    colorStrength: 0.8,
    colorSaturation: 1.2,
    "color.b": 0.5,
    textureScale: 24
  });
  saved.layoutOverrides = { "42": { entities: structuredClone(saved.entities), edits: {} } };
  const original = structuredClone(saved),
    upgraded = upgradePlanningDocument(saved);
  expect(saved).toEqual(original);
  for (const scope of [upgraded, upgraded.layoutOverrides!["42"]]) {
    expect(scope.entities.world.components.rockFormation.values).toEqual({ "color.b": 0.5, textureScale: 24 });
    expect(scope.entities[f.id]).toEqual(saved.entities[f.id]);
  }
  expect(upgradePlanningDocument(upgraded)).toEqual(upgraded);
});

it("persists Shader Color channels, including zero, through native scene replay and history without geometry work", async () => {
  const f = await fixture(),
    initial = readRockFormationSettings(f.session.document),
    before = f.session.result!.plan;
  const values = { "color.r": 0, "color.b": 0.24 };
  const receipt = await f.session.dispatchParameters([
    { op: "set", entity: "world", component: "rockFormation", values }
  ]);
  expect(receipt.status, receipt.message).toBe("accepted");
  const settings = readRockFormationSettings(f.session.document);
  expect(settings.colorBlend.color).toEqual([0, initial.colorBlend.color[1], 0.24]);
  expect(rockGeometrySettings(settings)).toEqual(rockGeometrySettings(initial));
  expect(f.session.result!.plan.rocks).toEqual(before.rocks);
  expect(f.session.result!.plan.buildings).toBe(before.buildings);
  expect(planningHeightmap(f.session.result!.plan).heights).toBe(f.height.heights);
  expect(
    readRockFormationSettings(importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(f.session.export())))))
  ).toEqual(settings);
  expect((await f.session.undo())?.status).toBe("accepted");
  expect(readRockFormationSettings(f.session.document).colorBlend).toEqual(initial.colorBlend);
  expect((await f.session.redo())?.status).toBe("accepted");
  expect(readRockFormationSettings(f.session.document).colorBlend).toEqual(settings.colorBlend);
  expect(
    (
      await f.session.dispatchParameters([
        { op: "reset", entity: "world", component: "rockFormation", fields: Object.keys(values) }
      ])
    ).status
  ).toBe("accepted");
  expect(readRockFormationSettings(f.session.document).colorBlend).toEqual(initial.colorBlend);
  // Native numeric authoring projects finite inputs to their mathematical range.
  for (const [input, expected] of [
    [-0.1, 0],
    [1.1, 1]
  ]) {
    expect(
      (
        await f.session.dispatchParameters([
          { op: "set", entity: "world", component: "rockFormation", values: { "color.r": input } }
        ])
      ).status
    ).toBe("accepted");
    expect(readRockFormationSettings(f.session.document).colorBlend.color[0]).toBe(expected);
  }
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: "world", component: "rockFormation", values: { "color.r": NaN } }
      ])
    ).status
  ).toBe("rejected");
  expect(f.execute).toHaveBeenCalledOnce();
});

it("retires the old algorithm inputs in active and archived Seeds without losing dimensions or current shape settings", async () => {
  const f = await fixture();
  await f.session.dispatchParameters([{ op: "set", entity: f.id, component: "rockObb", values: { width: 42 } }]);
  const document = f.session.export();
  Object.assign(document.entities.world.components.rockFormation.values, {
    surfaceMode: "cellular-curvature",
    cellSize: 32,
    wallCount: 18
  });
  Object.assign(document.entities[f.id].components.rockObb.values, { heightMode: "perlin-ascent", slopeRate: 10 });
  Object.assign(document.entities.world.components.rockGeneration.values, {
    platformHeightScale: 1.2,
    platformSlopeRate: 12
  });
  document.layoutOverrides = { "42": { entities: structuredClone(document.entities), edits: {} } };
  const migrated = upgradePlanningDocument(document);
  for (const scope of [migrated, migrated.layoutOverrides!["42"]]) {
    expect(scope.entities.world.components.rockFormation.values).toEqual({ wallCount: 18 });
    expect(scope.entities[f.id].components.rockObb.values).toEqual({ width: 42 });
    expect(scope.entities.world.components.rockGeneration.values).toEqual({ platformHeightScale: 1.2 });
  }
  expect(upgradePlanningDocument(migrated)).toEqual(migrated);
});
