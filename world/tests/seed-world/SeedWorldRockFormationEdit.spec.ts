import { expect, it, vi } from "vitest";
import type { IslandPlan, PlanRockBox } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import {
  SEMANTIC_DEFAULTS,
  type SemanticResult
} from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import {
  adoptPlanningHeightmap,
  planningHeightmap
} from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import {
  exportPlanningAuthoring,
  exportPlanningRecipe,
  importPlanningDocument,
  upgradePlanningDocument
} from "@galacean/engine-world-planning/spatial/PlanningDocument";
import {
  exportPlanningScene,
  importPlanningScene
} from "../../demos/seed-world/src/planning/spatial/PlanningSceneAsset.ts";
import {
  applyRockObbSizes,
  rockObbId
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Authoring";
import {
  isRockFormationOnlyEdit,
  prepareRockFormationEdit
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Edit";
import { canPublishRockFormationEdit } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Publication";
import {
  ROCK_OBB_COMPONENT,
  readRockFormationSettings,
  rockGeometrySettings
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import { rockFormationJobs } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Jobs";
import type { RockSurfaceMode } from "@galacean/engine-terrain/rock-formation/types";
import { buildPlanningScene } from "@galacean/engine-world-planning/spatial/PlanningScene";
import { editableEntity } from "@galacean/engine-world-planning/spatial/PlanningRuntime";

async function fixture(
  sourceSurface?: RockSurfaceMode,
  sourceSlope: Pick<PlanRockBox, "slopeMode" | "slopeRate" | "slopeVariation"> = {}
) {
  const recipe = { version: 2 as const, parameters: { ...SEMANTIC_DEFAULTS }, edits: {} };
  const document = importPlanningDocument(recipe);
  // Keep explicit source modes and shared slope defaults for these override tests;
  // generated platform/peak defaults have their own integration suite.
  document.entities.world.components.rockGeneration.values = { platformShare: 0, peakSlopeVariation: 0.2 };
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
    occlusion: true,
    heightMode: "random-ascent" as const
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
  if (sourceSurface !== undefined) plan.rocks[0].boxes![0].surfaceMode = sourceSurface;
  Object.assign(plan.rocks[0].boxes![0], sourceSlope);
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
    { heightMode: "random-ascent" },
    { surfaceMode: "vertex-slabs" },
    { slopeMode: "manual", slopeRate: 1.55, slopeVariation: 0 }
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

it("changes only the selected OBB height mode without changing its footprint, neighbors or canonical terrain", async () => {
  const f = await fixture(),
    before = structuredClone(f.plan),
    document = f.session.export();
  const receipt = await f.session.dispatchParameters([
    { op: "set", entity: f.id, component: "rockObb", values: { heightMode: "perlin-ascent" } }
  ]);
  expect(receipt.status, receipt.message).toBe("accepted");
  const plan = f.session.result!.plan,
    rock = plan.rocks[0];
  expect(rock.boxes![0]).toEqual({ ...before.rocks[0].boxes![0], heightMode: "perlin-ascent" });
  expect(rock.boxes![1]).toEqual(before.rocks[0].boxes![1]);
  expect(rock.outline).toBe(f.plan.rocks[0].outline);
  expect(rock.obb).toBe(f.plan.rocks[0].obb);
  expect(plan.routes).toBe(f.plan.routes);
  expect(plan.mountains).toBe(f.plan.mountains);
  expect(planningHeightmap(plan).encoded).toBe(f.height.encoded);
  expect(planningHeightmap(plan).heights).toBe(f.height.heights);
  expect(f.plan).toEqual(before);
  expect(f.session.result!.execution).toBe("local");
  expect(f.session.result!.changedIds).toContain("rock");
  expect(isRockFormationOnlyEdit(document, f.session.document)).toBe(true);
  expect(f.session.export().entities[f.id].components.rockObb.values).toEqual({ heightMode: "perlin-ascent" });
  expect(f.execute).toHaveBeenCalledOnce();
});

it("preserves independent OBB height modes through history, field reset and full reset", async () => {
  const f = await fixture(),
    sibling = rockObbId("rock", "b");
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: f.id, component: "rockObb", values: { height: 48, heightMode: "random-ascent" } },
        { op: "set", entity: sibling, component: "rockObb", values: { heightMode: "random-ascent" } }
      ])
    ).status
  ).toBe("accepted");
  const edited = structuredClone(f.session.result!.plan.rocks);
  expect((await f.session.undo())?.status).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes).toEqual(f.plan.rocks[0].boxes);
  expect((await f.session.redo())?.status).toBe("accepted");
  expect(f.session.result!.plan.rocks).toEqual(edited);

  expect(
    (await f.session.dispatchParameters([{ op: "reset", entity: f.id, component: "rockObb", fields: ["heightMode"] }]))
      .status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes![0]).toEqual({ ...f.plan.rocks[0].boxes![0], sizeY: 48 });
  expect(f.session.result!.plan.rocks[0].boxes![1]).toEqual(edited[0].boxes![1]);
  expect(f.session.export().entities[f.id].components.rockObb.values).toEqual({ height: 48 });
  expect((await f.session.undo())?.status).toBe("accepted");
  expect(f.session.result!.plan.rocks).toEqual(edited);

  expect((await f.session.dispatchParameters([{ op: "reset", entity: f.id, component: "rockObb" }])).status).toBe(
    "accepted"
  );
  expect(f.session.result!.plan.rocks[0].boxes![0]).toEqual(f.plan.rocks[0].boxes![0]);
  expect(f.session.result!.plan.rocks[0].boxes![1]).toEqual(edited[0].boxes![1]);
  expect(planningHeightmap(f.session.result!.plan).heights).toBe(f.height.heights);
  expect(f.execute).toHaveBeenCalledOnce();
});

it.each(["random-ascent", "perlin-ascent"] as const)(
  "replays saved %s OBB mode from authoring and native Scene",
  async (heightMode) => {
    const f = await fixture();
    expect(
      (
        await f.session.dispatchParameters([
          { op: "set", entity: f.id, component: "rockObb", values: { height: 48, heightMode } }
        ])
      ).status
    ).toBe("accepted");
    const authoring = upgradePlanningDocument(JSON.parse(JSON.stringify(exportPlanningAuthoring(f.session.document))));
    const scene = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(f.session.document))));
    for (const saved of [authoring, scene]) {
      expect(saved.entities[f.id].components.rockObb.values).toEqual({ height: 48, heightMode });
      const replay = structuredClone(f.plan);
      applyRockObbSizes(replay, saved);
      expect(replay.rocks).toEqual(f.session.result!.plan.rocks);
      expect(replay.rocks[0].boxes![0].heightMode).toBe(heightMode);
    }
  }
);

it("rejects an unknown OBB height mode without replacing the accepted mode or terrain", async () => {
  const f = await fixture();
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: f.id, component: "rockObb", values: { heightMode: "random-ascent" } }
      ])
    ).status
  ).toBe("accepted");
  const before = f.session.export(),
    result = f.session.result;
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: f.id, component: "rockObb", values: { heightMode: "random-descent" } }
      ])
    ).status
  ).toBe("rejected");
  expect(f.session.export()).toEqual(before);
  expect(f.session.result).toBe(result);
  expect(planningHeightmap(f.session.result!.plan).heights).toBe(f.height.heights);
  expect(f.execute).toHaveBeenCalledOnce();
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
    { op: "set", entity: "world", component: "rockFormation", values: { wallCount: 20 } }
  ]);
  expect(receipt.status, receipt.message).toBe("accepted");
  expect(f.execute).toHaveBeenCalledOnce();
  const next = f.session.export();
  next.entities.world.components.rockFormation.values.wallCount = 24;
  expect(isRockFormationOnlyEdit(f.session.document, next)).toBe(true);
  next.entities.world.components.terrain = { values: { mountainHeight: 90 } };
  expect(isRockFormationOnlyEdit(f.session.document, next)).toBe(false);
  delete next.entities.world.components.terrain;
  next.entities.world.name = "edited world";
  expect(isRockFormationOnlyEdit(f.session.document, next)).toBe(false);
  expect(exportPlanningRecipe(f.session.document)).toEqual(f.session.result!.recipe);
});

it.each([
  { height: 48 },
  { heightMode: "random-ascent" },
  { surfaceMode: "vertex-slabs" },
  { slopeMode: "manual", slopeRate: 1.55, slopeVariation: 0 }
] as Record<string, string | number>[])(
  "retains accepted OBBs and authoring when preparing %j fails",
  async (values) => {
    const f = await fixture(),
      before = f.session.export(),
      published = f.session.result;
    const session = new PlanningSession(f.session.recipe(), f.execute, before, {
      preparePublication: async (_document, _result, context) => {
        if (!context.worldUnchanged && session.result) throw Error("mesh upload failed");
        return { commit() {}, discard() {} };
      }
    });
    await session.initialize();
    const receipt = await session.dispatchParameters([{ op: "set", entity: f.id, component: "rockObb", values }]);
    expect(receipt.status).toBe("rejected");
    expect(session.export()).toEqual(before);
    expect(session.result!.plan).toEqual(published!.plan);
  }
);

it("changes shape with history/reset while retaining terrain and spatial solve", async () => {
  const f = await fixture(),
    before = f.session.result!.plan;
  const initial = readRockFormationSettings(f.session.document).shape;
  const receipt = await f.session.dispatchParameters([
    { op: "set", entity: "world", component: "rockFormation", values: { wallCount: 24, wallProtrusion: 0.5 } }
  ]);
  expect(receipt.status, receipt.message).toBe("accepted");
  expect(readRockFormationSettings(f.session.document).shape).toMatchObject({ wallCount: 24, wallProtrusion: 0.5 });
  expect(f.session.result!.plan.rocks).toEqual(before.rocks);
  expect(planningHeightmap(f.session.result!.plan).heights).toBe(f.height.heights);
  expect((await f.session.undo())?.status).toBe("accepted");
  expect(readRockFormationSettings(f.session.document).shape).toEqual(initial);
  expect((await f.session.redo())?.status).toBe("accepted");
  expect(readRockFormationSettings(f.session.document).shape.wallCount).toBe(24);
  expect(
    (await f.session.dispatchParameters([{ op: "reset", entity: "world", component: "rockFormation" }])).status
  ).toBe("accepted");
  expect(readRockFormationSettings(f.session.document).shape).toEqual(initial);
  expect(f.execute).toHaveBeenCalledOnce();
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

it("clamps negative texture sizes to automatic while accepting positive world-space sizes", async () => {
  const f = await fixture();
  for (const textureScale of [-1]) {
    expect(
      (
        await f.session.dispatchParameters([
          { op: "set", entity: "world", component: "rockFormation", values: { textureScale } }
        ])
      ).status
    ).toBe("accepted");
    expect(readRockFormationSettings(f.session.document).textureScale).toBe(0);
  }
  for (const textureScale of [0, 0.5, 480]) {
    expect(
      (
        await f.session.dispatchParameters([
          { op: "set", entity: "world", component: "rockFormation", values: { textureScale } }
        ])
      ).status
    ).toBe("accepted");
    expect(readRockFormationSettings(f.session.document).textureScale).toBe(textureScale);
  }
});

it("retires legacy rock palettes on import in active and archived Seeds while preserving Color and OBBs", async () => {
  const f = await fixture();
  await f.session.dispatchParameters([{ op: "set", entity: f.id, component: "rockObb", values: { slopeRate: 8 } }]);
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

it("keeps surface-free OBB planning metadata sparse while generating with the unified surface", async () => {
  const f = await fixture();
  expect(ROCK_OBB_COMPONENT.fields.find((field) => field.key === "surfaceMode")?.default).toBeUndefined();
  expect(
    (await f.session.dispatchParameters([{ op: "set", entity: f.id, component: "rockObb", values: { height: 48 } }]))
      .status
  ).toBe("accepted");
  const plan = f.session.result!.plan;
  expect(plan.rocks[0].boxes!.every((box) => !Object.hasOwn(box, "surfaceMode"))).toBe(true);
  expect(f.session.export().entities[f.id].components.rockObb.values).toEqual({ height: 48 });
  const scene = buildPlanningScene(plan);
  expect(
    editableEntity(f.session.document, scene.entities.get(f.id)!, plan).components.rockObb.values
  ).not.toHaveProperty("surfaceMode");
  const jobs = rockFormationJobs(plan, f.height);
  expect(jobs[0].guides.every((guide) => !Object.hasOwn(guide, "surfaceMode"))).toBe(true);
  expect(f.execute).toHaveBeenCalledOnce();
});

it("pins a selected surface equal to the current default while neighboring OBBs continue to inherit", async () => {
  const f = await fixture(),
    original = structuredClone(f.plan);
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: f.id, component: "rockObb", values: { surfaceMode: "cellular-curvature" } }
      ])
    ).status
  ).toBe("accepted");
  const selected = f.session.result!.plan.rocks[0];
  expect(selected.boxes![0]).toEqual({ ...original.rocks[0].boxes![0], surfaceMode: "cellular-curvature" });
  expect(selected.boxes![1]).toBe(f.plan.rocks[0].boxes![1]);
  expect(selected.outline).toBe(f.plan.rocks[0].outline);
  expect(selected.obb).toBe(f.plan.rocks[0].obb);
  expect(f.session.result!.execution).toBe("local");
  expect(f.session.result!.plan.routes).toBe(f.plan.routes);
  expect(f.session.result!.plan.mountains).toBe(f.plan.mountains);
  expect(planningHeightmap(f.session.result!.plan).heights).toBe(f.height.heights);
  expect(f.plan).toEqual(original);
  const guides = rockFormationJobs(f.session.result!.plan, f.height).flatMap((job) => job.guides);
  expect(guides[0]).not.toHaveProperty("surfaceMode");
  expect(guides[1]).not.toHaveProperty("surfaceMode");
  expect(f.session.export().entities[f.id].components.rockObb.values).toEqual({ surfaceMode: "cellular-curvature" });
  expect(f.execute).toHaveBeenCalledOnce();
});

it("keeps individual surface choices independent through undo, redo, field reset and whole-OBB reset", async () => {
  const f = await fixture(),
    sibling = rockObbId("rock", "b");
  expect(
    (
      await f.session.dispatchParameters([
        {
          op: "set",
          entity: f.id,
          component: "rockObb",
          values: { height: 48, heightMode: "perlin-ascent", surfaceMode: "vertex-slabs" }
        },
        { op: "set", entity: sibling, component: "rockObb", values: { surfaceMode: "cellular-curvature" } }
      ])
    ).status
  ).toBe("accepted");
  const edited = structuredClone(f.session.result!.plan.rocks);
  expect((await f.session.undo())?.status).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes).toEqual(f.plan.rocks[0].boxes);
  expect((await f.session.redo())?.status).toBe("accepted");
  expect(f.session.result!.plan.rocks).toEqual(edited);
  expect(
    (await f.session.dispatchParameters([{ op: "reset", entity: f.id, component: "rockObb", fields: ["surfaceMode"] }]))
      .status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes![0]).toEqual({
    ...f.plan.rocks[0].boxes![0],
    sizeY: 48,
    heightMode: "perlin-ascent"
  });
  expect(f.session.result!.plan.rocks[0].boxes![1]).toEqual(edited[0].boxes![1]);
  expect(f.session.export().entities[f.id].components.rockObb.values).toEqual({
    height: 48,
    heightMode: "perlin-ascent"
  });
  expect((await f.session.undo())?.status).toBe("accepted");
  expect(f.session.result!.plan.rocks).toEqual(edited);
  expect((await f.session.dispatchParameters([{ op: "reset", entity: f.id, component: "rockObb" }])).status).toBe(
    "accepted"
  );
  expect(f.session.result!.plan.rocks[0].boxes![0]).toEqual(f.plan.rocks[0].boxes![0]);
  expect(f.session.result!.plan.rocks[0].boxes![1]).toEqual(edited[0].boxes![1]);
  expect(f.execute).toHaveBeenCalledOnce();
});

it.each(["vertex-slabs", "cellular-curvature"] as const)(
  "replays an explicit %s surface through authoring and native Scene",
  async (surfaceMode) => {
    const f = await fixture();
    expect(
      (
        await f.session.dispatchParameters([
          { op: "set", entity: f.id, component: "rockObb", values: { heightMode: "random-ascent", surfaceMode } }
        ])
      ).status
    ).toBe("accepted");
    const authoring = upgradePlanningDocument(JSON.parse(JSON.stringify(exportPlanningAuthoring(f.session.document))));
    const scene = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(f.session.document))));
    for (const saved of [authoring, scene]) {
      expect(saved.entities[f.id].components.rockObb.values).toEqual({ heightMode: "random-ascent", surfaceMode });
      const replay = structuredClone(f.plan);
      applyRockObbSizes(replay, saved);
      expect(replay.rocks).toEqual(f.session.result!.plan.rocks);
      expect(replay.rocks[0].boxes![0].surfaceMode).toBe(surfaceMode);
      expect(replay.rocks[0].boxes![1]).not.toHaveProperty("surfaceMode");
    }
  }
);

it("follows an explicit source surface and restores it on local reset without freezing the source value", async () => {
  const f = await fixture(),
    sibling = rockObbId("rock", "b"),
    base = { entity: sibling, component: "rockObb" };
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: sibling, component: "rockObb", values: { surfaceMode: "vertex-slabs" } },
        { op: "base", entity: f.id, component: "rockObb", base }
      ])
    ).status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes!.map((box) => box.surfaceMode)).toEqual([
    "vertex-slabs",
    "vertex-slabs"
  ]);
  expect(f.session.export().entities[f.id].components.rockObb).toEqual({ values: {}, base });
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: sibling, component: "rockObb", values: { surfaceMode: "cellular-curvature" } }
      ])
    ).status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes!.map((box) => box.surfaceMode)).toEqual([
    "cellular-curvature",
    "cellular-curvature"
  ]);
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: f.id, component: "rockObb", values: { surfaceMode: "vertex-slabs" } }
      ])
    ).status
  ).toBe("accepted");
  expect(
    (await f.session.dispatchParameters([{ op: "reset", entity: f.id, component: "rockObb", fields: ["surfaceMode"] }]))
      .status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes!.map((box) => box.surfaceMode)).toEqual([
    "cellular-curvature",
    "cellular-curvature"
  ]);
  const replay = structuredClone(f.plan),
    saved = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(f.session.document))));
  applyRockObbSizes(replay, saved);
  expect(replay.rocks).toEqual(f.session.result!.plan.rocks);
  expect(saved.entities[f.id].components.rockObb).toEqual({ values: {}, base });
  expect((await f.session.dispatchParameters([{ op: "base", entity: f.id, component: "rockObb" }])).status).toBe(
    "accepted"
  );
  expect(f.session.result!.plan.rocks[0].boxes![0]).not.toHaveProperty("surfaceMode");
  expect(f.execute).toHaveBeenCalledOnce();
});

it("does not pin the global default when a surface-free generated OBB becomes a parameter source", async () => {
  const f = await fixture(),
    sibling = rockObbId("rock", "b");
  expect(
    (
      await f.session.dispatchParameters([
        { op: "base", entity: f.id, component: "rockObb", base: { entity: sibling, component: "rockObb" } }
      ])
    ).status
  ).toBe("accepted");
  expect(f.session.export().entities[sibling].components.rockObb.values).not.toHaveProperty("surfaceMode");
  const guides = rockFormationJobs(f.session.result!.plan, f.height).flatMap((job) => job.guides);
  expect(guides.every((guide) => !Object.hasOwn(guide, "surfaceMode"))).toBe(true);
  expect(f.execute).toHaveBeenCalledOnce();
});

it("retains and restores a generated source-box surface independently of size and local overrides", async () => {
  const f = await fixture("vertex-slabs"),
    original = structuredClone(f.plan);
  expect(
    (await f.session.dispatchParameters([{ op: "set", entity: f.id, component: "rockObb", values: { height: 48 } }]))
      .status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes![0]).toMatchObject({ surfaceMode: "vertex-slabs", sizeY: 48 });
  expect(f.session.export().entities[f.id].components.rockObb.values).toEqual({ height: 48 });
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: f.id, component: "rockObb", values: { surfaceMode: "cellular-curvature" } }
      ])
    ).status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes![0].surfaceMode).toBe("cellular-curvature");
  expect(
    (await f.session.dispatchParameters([{ op: "reset", entity: f.id, component: "rockObb", fields: ["surfaceMode"] }]))
      .status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes![0]).toMatchObject({ surfaceMode: "vertex-slabs", sizeY: 48 });
  expect((await f.session.dispatchParameters([{ op: "reset", entity: f.id, component: "rockObb" }])).status).toBe(
    "accepted"
  );
  expect(f.session.result!.plan.rocks[0].boxes).toEqual(original.rocks[0].boxes);
  expect(f.plan).toEqual(original);
  expect(f.execute).toHaveBeenCalledOnce();
});

it("rejects an unknown per-OBB surface without changing the accepted authoring or publication", async () => {
  const f = await fixture();
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: f.id, component: "rockObb", values: { surfaceMode: "vertex-slabs" } }
      ])
    ).status
  ).toBe("accepted");
  const before = f.session.export(),
    published = f.session.result;
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: f.id, component: "rockObb", values: { surfaceMode: "inherit" } }
      ])
    ).status
  ).toBe("rejected");
  expect(f.session.export()).toEqual(before);
  expect(f.session.result).toBe(published);
  expect(f.execute).toHaveBeenCalledOnce();
});

it("keeps size-derived slope defaults out of unrelated edits and manual mode without a stored rate", async () => {
  const f = await fixture();
  expect(ROCK_OBB_COMPONENT.fields.find((field) => field.key === "slopeMode")?.default).toBe("auto");
  expect(ROCK_OBB_COMPONENT.fields.find((field) => field.key === "slopeRate")?.default).toBeUndefined();
  expect(ROCK_OBB_COMPONENT.fields.find((field) => field.key === "slopeRate")?.max).toBeUndefined();
  expect(ROCK_OBB_COMPONENT.fields.find((field) => field.key === "slopeVariation")?.default).toBe(0.2);
  expect(
    (await f.session.dispatchParameters([{ op: "set", entity: f.id, component: "rockObb", values: { height: 48 } }]))
      .status
  ).toBe("accepted");
  const plan = f.session.result!.plan,
    scene = buildPlanningScene(plan);
  const editable = editableEntity(f.session.document, scene.entities.get(f.id)!, plan).components.rockObb.values;
  const guide = rockFormationJobs(plan, f.height)[0].guides[0];
  for (const key of ["slopeMode", "slopeRate", "slopeVariation"]) {
    expect(editable).not.toHaveProperty(key);
    expect(guide).not.toHaveProperty(key);
    expect(f.session.export().entities[f.id].components.rockObb.values).not.toHaveProperty(key);
  }
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: f.id, component: "rockObb", values: { slopeMode: "manual" } }
      ])
    ).status
  ).toBe("accepted");
  expect(f.session.export().entities[f.id].components.rockObb.values).toEqual({ height: 48, slopeMode: "manual" });
  expect(rockFormationJobs(f.session.result!.plan, f.height)[0].guides[0]).toMatchObject({
    size: [30, 48, 20]
  });
  expect(rockFormationJobs(f.session.result!.plan, f.height)[0].guides[0]).not.toHaveProperty("slopeRate");
});

it("publishes only one OBB's slope settings including zero variation without recomputing its footprint or terrain", async () => {
  const f = await fixture(),
    original = structuredClone(f.plan),
    document = f.session.export();
  const values = { slopeMode: "manual", slopeRate: 1.55, slopeVariation: 0 };
  expect((await f.session.dispatchParameters([{ op: "set", entity: f.id, component: "rockObb", values }])).status).toBe(
    "accepted"
  );
  const plan = f.session.result!.plan,
    rock = plan.rocks[0];
  expect(rock.boxes![0]).toEqual({ ...original.rocks[0].boxes![0], ...values });
  expect(rock.boxes![1]).toBe(f.plan.rocks[0].boxes![1]);
  expect(rock.outline).toBe(f.plan.rocks[0].outline);
  expect(rock.obb).toBe(f.plan.rocks[0].obb);
  expect(plan.routes).toBe(f.plan.routes);
  expect(plan.mountains).toBe(f.plan.mountains);
  expect(planningHeightmap(plan).heights).toBe(f.height.heights);
  expect(f.plan).toEqual(original);
  expect(f.session.result!.execution).toBe("local");
  expect(f.session.result!.changedIds).toContain("rock");
  expect(isRockFormationOnlyEdit(document, f.session.document)).toBe(true);
  expect(f.session.export().entities[f.id].components.rockObb.values).toEqual(values);
  const guides = rockFormationJobs(plan, f.height).flatMap((job) => job.guides);
  expect(plan.rocks[0].boxes![0]).toMatchObject(values);
  expect(guides[0]).not.toHaveProperty("slopeMode");
  expect(guides[1]).not.toHaveProperty("slopeMode");
  expect(guides[1]).not.toHaveProperty("slopeRate");
  expect(guides[1]).not.toHaveProperty("slopeVariation");
  expect(f.execute).toHaveBeenCalledOnce();
});

it("preserves slope edits through history and resets slope fields independently of size, height mode and surface", async () => {
  const f = await fixture(),
    sibling = rockObbId("rock", "b");
  const other = { height: 48, heightMode: "perlin-ascent", surfaceMode: "vertex-slabs" };
  expect(
    (
      await f.session.dispatchParameters([
        {
          op: "set",
          entity: f.id,
          component: "rockObb",
          values: { ...other, slopeMode: "manual", slopeRate: 1.55, slopeVariation: 0 }
        },
        { op: "set", entity: sibling, component: "rockObb", values: { slopeVariation: 0.25 } }
      ])
    ).status
  ).toBe("accepted");
  const edited = structuredClone(f.session.result!.plan.rocks);
  expect((await f.session.undo())?.status).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes).toEqual(f.plan.rocks[0].boxes);
  expect((await f.session.redo())?.status).toBe("accepted");
  expect(f.session.result!.plan.rocks).toEqual(edited);
  expect(
    (
      await f.session.dispatchParameters([
        { op: "reset", entity: f.id, component: "rockObb", fields: ["slopeMode", "slopeRate", "slopeVariation"] }
      ])
    ).status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes![0]).toEqual({
    ...f.plan.rocks[0].boxes![0],
    sizeY: 48,
    heightMode: "perlin-ascent",
    surfaceMode: "vertex-slabs"
  });
  expect(f.session.export().entities[f.id].components.rockObb.values).toEqual(other);
  expect(f.session.result!.plan.rocks[0].boxes![1]).toEqual(edited[0].boxes![1]);
  expect((await f.session.undo())?.status).toBe("accepted");
  expect(f.session.result!.plan.rocks).toEqual(edited);
  expect((await f.session.dispatchParameters([{ op: "reset", entity: f.id, component: "rockObb" }])).status).toBe(
    "accepted"
  );
  expect(f.session.result!.plan.rocks[0].boxes![0]).toEqual(f.plan.rocks[0].boxes![0]);
  expect(f.session.result!.plan.rocks[0].boxes![1]).toEqual(edited[0].boxes![1]);
  expect(f.execute).toHaveBeenCalledOnce();
});

it.each(["auto", "manual"] as const)(
  "replays sparse %s slope configuration including a dormant manual value through authoring and native Scene",
  async (slopeMode) => {
    const f = await fixture(),
      values = { slopeMode, slopeRate: 1.55, slopeVariation: 0 };
    expect(
      (await f.session.dispatchParameters([{ op: "set", entity: f.id, component: "rockObb", values }])).status
    ).toBe("accepted");
    const authoring = upgradePlanningDocument(JSON.parse(JSON.stringify(exportPlanningAuthoring(f.session.document))));
    const scene = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(f.session.document))));
    for (const saved of [authoring, scene]) {
      expect(saved.entities[f.id].components.rockObb.values).toEqual(values);
      const replay = structuredClone(f.plan);
      applyRockObbSizes(replay, saved);
      expect(replay.rocks).toEqual(f.session.result!.plan.rocks);
      expect(replay.rocks[0].boxes![0]).toMatchObject(values);
      expect(replay.rocks[0].boxes![1]).not.toHaveProperty("slopeRate");
    }
  }
);

it("inherits slope fields from an explicit source while local automatic mode overrides manual mode without losing the rate", async () => {
  const f = await fixture(),
    sibling = rockObbId("rock", "b"),
    base = { entity: sibling, component: "rockObb" };
  expect(
    (
      await f.session.dispatchParameters([
        {
          op: "set",
          entity: sibling,
          component: "rockObb",
          values: { slopeMode: "manual", slopeRate: 1.55, slopeVariation: 0 }
        },
        { op: "base", entity: f.id, component: "rockObb", base }
      ])
    ).status
  ).toBe("accepted");
  expect(f.session.export().entities[f.id].components.rockObb).toEqual({ values: {}, base });
  expect(f.session.result!.plan.rocks[0].boxes![0]).toMatchObject({
    slopeMode: "manual",
    slopeRate: 1.55,
    slopeVariation: 0
  });
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: f.id, component: "rockObb", values: { slopeMode: "auto" } }
      ])
    ).status
  ).toBe("accepted");
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: sibling, component: "rockObb", values: { slopeRate: 3.2, slopeVariation: 0.3 } }
      ])
    ).status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes![0]).toMatchObject({
    slopeMode: "auto",
    slopeRate: 3.2,
    slopeVariation: 0.3
  });
  expect(f.session.export().entities[f.id].components.rockObb).toEqual({ values: { slopeMode: "auto" }, base });
  expect(
    (await f.session.dispatchParameters([{ op: "reset", entity: f.id, component: "rockObb", fields: ["slopeMode"] }]))
      .status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes![0]).toMatchObject({
    slopeMode: "manual",
    slopeRate: 3.2,
    slopeVariation: 0.3
  });
  const saved = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(f.session.document))));
  const replay = structuredClone(f.plan);
  applyRockObbSizes(replay, saved);
  expect(replay.rocks).toEqual(f.session.result!.plan.rocks);
  expect(saved.entities[f.id].components.rockObb).toEqual({ values: {}, base });
  expect((await f.session.dispatchParameters([{ op: "base", entity: f.id, component: "rockObb" }])).status).toBe(
    "accepted"
  );
  for (const key of ["slopeMode", "slopeRate", "slopeVariation"])
    expect(f.session.result!.plan.rocks[0].boxes![0]).not.toHaveProperty(key);
  expect(f.execute).toHaveBeenCalledOnce();
});

it("does not freeze an automatic derived slope when an untouched OBB becomes a parameter source", async () => {
  const f = await fixture(),
    sibling = rockObbId("rock", "b");
  expect(
    (
      await f.session.dispatchParameters([
        { op: "base", entity: f.id, component: "rockObb", base: { entity: sibling, component: "rockObb" } }
      ])
    ).status
  ).toBe("accepted");
  for (const key of ["slopeMode", "slopeRate", "slopeVariation"])
    expect(f.session.export().entities[sibling].components.rockObb.values).not.toHaveProperty(key);
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: sibling, component: "rockObb", values: { width: 50, height: 90, depth: 40 } }
      ])
    ).status
  ).toBe("accepted");
  const guides = rockFormationJobs(f.session.result!.plan, f.height).flatMap((job) => job.guides);
  for (const guide of guides) {
    expect(guide.size).toEqual([50, 90, 40]);
    for (const key of ["slopeMode", "slopeRate", "slopeVariation"]) expect(guide).not.toHaveProperty(key);
  }
  expect(f.execute).toHaveBeenCalledOnce();
});

it("restores generated source slope fields after local reset without materializing them into authoring", async () => {
  const source = { slopeMode: "manual" as const, slopeRate: 2.7, slopeVariation: 0 };
  const f = await fixture(undefined, source),
    original = structuredClone(f.plan);
  expect(
    (await f.session.dispatchParameters([{ op: "set", entity: f.id, component: "rockObb", values: { height: 48 } }]))
      .status
  ).toBe("accepted");
  expect(f.session.export().entities[f.id].components.rockObb.values).toEqual({ height: 48 });
  expect(f.session.result!.plan.rocks[0].boxes![0]).toMatchObject({ ...source, sizeY: 48 });
  expect(
    (
      await f.session.dispatchParameters([
        {
          op: "set",
          entity: f.id,
          component: "rockObb",
          values: { slopeMode: "auto", slopeRate: 9, slopeVariation: 1 }
        }
      ])
    ).status
  ).toBe("accepted");
  expect(
    (
      await f.session.dispatchParameters([
        { op: "reset", entity: f.id, component: "rockObb", fields: ["slopeMode", "slopeRate", "slopeVariation"] }
      ])
    ).status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes![0]).toMatchObject({ ...source, sizeY: 48 });
  expect((await f.session.dispatchParameters([{ op: "reset", entity: f.id, component: "rockObb" }])).status).toBe(
    "accepted"
  );
  expect(f.session.result!.plan.rocks[0].boxes).toEqual(original.rocks[0].boxes);
  expect(f.plan).toEqual(original);
  expect(f.execute).toHaveBeenCalledOnce();
});

it.each([
  { slopeMode: "inherit" },
  { slopeRate: 0 },
  { slopeRate: -1 },
  { slopeRate: NaN },
  { slopeRate: Infinity },
  { slopeVariation: NaN }
] as Record<string, string | number>[])(
  "rejects invalid slope edit %j without changing accepted authoring or publication",
  async (values) => {
    const f = await fixture();
    expect(
      (
        await f.session.dispatchParameters([
          {
            op: "set",
            entity: f.id,
            component: "rockObb",
            values: { slopeMode: "manual", slopeRate: 1.55, slopeVariation: 0 }
          }
        ])
      ).status
    ).toBe("accepted");
    const before = f.session.export(),
      published = f.session.result;
    expect(
      (await f.session.dispatchParameters([{ op: "set", entity: f.id, component: "rockObb", values }])).status
    ).toBe("rejected");
    expect(f.session.export()).toEqual(before);
    expect(f.session.result).toBe(published);
    expect(f.execute).toHaveBeenCalledOnce();
  }
);

it("accepts positive manual slopes beyond the lab slider range and projects variation to its mathematical interval", async () => {
  const f = await fixture();
  expect(
    (
      await f.session.dispatchParameters([
        {
          op: "set",
          entity: f.id,
          component: "rockObb",
          values: { slopeMode: "manual", slopeRate: 100, slopeVariation: -0.5 }
        }
      ])
    ).status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes![0]).toMatchObject({
    slopeMode: "manual",
    slopeRate: 100,
    slopeVariation: 0
  });
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: f.id, component: "rockObb", values: { slopeRate: 0.01, slopeVariation: 1.5 } }
      ])
    ).status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks[0].boxes![0]).toMatchObject({ slopeRate: 0.01, slopeVariation: 1 });
});

it.each([
  { slopeMode: "inherit" },
  { slopeRate: 0 },
  { slopeRate: -1 },
  { slopeRate: NaN },
  { slopeRate: Infinity },
  { slopeVariation: -0.1 },
  { slopeVariation: 1.1 },
  { slopeVariation: NaN }
])("rejects malformed source and authored slope projection %j", async (values) => {
  const f = await fixture();
  const source = structuredClone(f.plan);
  Object.assign(source.rocks[0].boxes![0], values);
  expect(() => applyRockObbSizes(source, f.session.export())).toThrow(/Invalid rock OBB slope/);
  const document = f.session.export();
  document.entities[f.id] = { id: f.id, name: f.id, components: { rockObb: { values } } };
  expect(() => applyRockObbSizes(structuredClone(f.plan), document)).toThrow(/Invalid rock OBB slope/);
});
