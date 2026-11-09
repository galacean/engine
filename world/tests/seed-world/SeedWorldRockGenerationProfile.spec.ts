import { afterEach, expect, it, vi } from "vitest";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import {
  SEMANTIC_DEFAULTS,
  type SemanticResult
} from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import {
  adoptPlanningHeightmap,
  planningHeightmap
} from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import {
  exportPlanningAuthoring,
  importPlanningDocument,
  upgradePlanningDocument
} from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import {
  applyRockObbSizes,
  rockObbId
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Authoring";
import {
  readRockGenerationProfile,
  rockGenerationKind
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/GenerationProfile";
import { RockFormationClient } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Client";
import { rockFormationJobs } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Jobs";
import { rockFormationPlacements } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Placement";
import { readRockFormationSettings } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import { canPublishRockFormationEdit } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Publication";
import { seedAscentProfile } from "@galacean/engine-terrain/rock-formation/AscentMask";
import { ascendingBoundary } from "@galacean/engine-terrain/rock-formation/AscendingBoundary";
import {
  DEFAULT_ROCK_HEIGHT_MODE,
  DEFAULT_ROCK_HEIGHT_VARIATION,
  type RockFormationJob,
  type RockFormationMesh
} from "@galacean/engine-terrain/rock-formation/types";
import { DEFAULT_ROCK_SLOPE_VARIATION } from "@galacean/engine-terrain/rock-formation/Slope";
import {
  applyLandscapeInstanceEdits,
  applySpatialInstanceEdits
} from "@galacean/engine-world-planning/spatial/layout/SpatialInstanceEdits";

function fixture(count = 12) {
  const recipe = { version: 2 as const, parameters: { ...SEMANTIC_DEFAULTS, seed: 1 }, edits: {} };
  const document = importPlanningDocument(recipe);
  const raw = {
    parameters: recipe.parameters,
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
    rocks: Array.from({ length: count }, (_, i) => ({
      id: `rock-${i}`,
      groupId: "same-poi",
      center: { x: i * 60, z: 80 },
      width: 48,
      height: 36,
      depth: 40,
      baseHeight: 12,
      yaw: 0,
      role: "wall",
      outline: [],
      obb: [],
      boxes: [
        {
          id: `box-${i}`,
          label: `Box ${i}`,
          center: { x: i * 60, z: 80 },
          elevation: 12,
          sizeX: 48,
          sizeY: 36,
          sizeZ: 40,
          yaw: 0,
          collision: true,
          occlusion: true
        }
      ]
    }))
  } as unknown as IslandPlan;
  const ground = {
    resolution: 2,
    spacingX: 2048,
    spacingZ: 2048,
    encoded: new Uint16Array(4),
    heights: new Float32Array(4),
    decodeOffset: 0,
    decodeScale: 1
  };
  const compile = (doc = document) => {
    const plan = structuredClone(raw);
    applyRockObbSizes(plan, doc);
    adoptPlanningHeightmap(plan, ground);
    return plan;
  };
  const plan = compile(),
    result: SemanticResult = { plan, recipe, accepted: true, checks: [], changedIds: [], notes: [] };
  const execute = vi.fn(async () => result);
  const session = new PlanningSession(recipe, execute, document);
  const id = (i: number) => rockObbId(`rock-${i}`, `box-${i}`);
  return { raw, document, compile, plan, result, execute, session, id };
}
afterEach(() => vi.unstubAllGlobals());

function landscapeFixture() {
  const f = fixture(0);
  f.raw.landscapes = ["rock", "rock", "tree"].map((kind, i) => ({
    id: `scenery-${i}`,
    ownerId: "world",
    sourceId: "world",
    kind: kind as "rock" | "tree",
    center: { x: 40 + i * 10, z: 40 },
    width: 2 + i,
    depth: 1.6 + i,
    height: 2 + i,
    yaw: 0.3,
    baseHeight: 0,
    outline: [],
    collisionRadius: 1 + i
  }));
  f.raw.spatialLayout = { worldSignature: "scenery", groups: [], baselineGroups: [] };
  const compile = (document = f.document) => {
    const plan = structuredClone(f.raw);
    applySpatialInstanceEdits(plan, document, () => 0);
    adoptPlanningHeightmap(plan, {
      resolution: 2,
      spacingX: 1024,
      spacingZ: 1024,
      heights: new Float32Array(4),
      encoded: new Uint16Array(4),
      decodeOffset: 0,
      decodeScale: 1
    });
    return plan;
  };
  const plan = compile(),
    result = { ...f.result, plan },
    execute = vi.fn(async () => result);
  return { ...f, compile, plan, execute, session: new PlanningSession(result.recipe, execute, f.document) };
}

it("projects the shared shape into scattered-rock volumes and worker jobs without scaling twice", () => {
  const f = landscapeFixture(),
    profile = readRockGenerationProfile(f.document);
  const jobs = rockFormationJobs(f.plan, planningHeightmap(f.plan));
  expect(jobs).toHaveLength(2);
  for (const [i, job] of jobs.entries()) {
    expect(job.surfaceGrass).toBe(false);
    const source = f.raw.landscapes![i],
      published = f.plan.landscapes![i];
    expect(published.height).toBe(source.height * profile.platformHeightScale);
    expect(published.center).toEqual(source.center);
    expect(published.outline).toEqual(source.outline);
    expect(job.origin).toEqual([source.center.x, source.baseHeight, source.center.z]);
    expect(job.guides[0]).toMatchObject({
      size: [source.width, published.height, source.depth],
      slopeMode: "manual",
      slopeRate: profile.platformSlopeRate,
      slopeVariation: profile.platformSlopeVariation,
      heightVariation: profile.platformHeightVariation
    });
    expect(job.guides[0].heightMode ?? DEFAULT_ROCK_HEIGHT_MODE).toBe("random-ascent");
  }
  const landscape = f.plan.landscapes,
    tree = landscape![2],
    snapshot = structuredClone(landscape);
  applyRockObbSizes(f.plan, f.document);
  expect(f.plan.landscapes).toBe(landscape);
  expect(f.plan.landscapes).toEqual(snapshot);
  expect(f.plan.landscapes![2]).toBe(tree);
  // Ecology/reveal reconstructs raw scenery even when no parent rock was edited.
  const revealed = { ...f.plan, landscapes: structuredClone(f.raw.landscapes) };
  applySpatialInstanceEdits(revealed, f.document, () => 0);
  expect(revealed.landscapes).toEqual(snapshot);
  const waterEdited = { ...f.plan, landscapes: structuredClone(f.raw.landscapes) };
  applyLandscapeInstanceEdits(waterEdited, f.document, () => 0);
  expect(waterEdited.landscapes).toEqual(snapshot);
});

it("publishes scattered-rock profile edits, changed identities and cold replay through the existing session", async () => {
  const f = landscapeFixture();
  await f.session.initialize();
  const initial = f.session.result!.plan;
  const receipt = await f.session.dispatchParameters([
    {
      op: "set",
      entity: "world",
      component: "rockGeneration",
      values: { platformShare: 0, peakHeightScale: 1.2, peakSlopeVariation: 0, peakHeightVariation: 0 }
    }
  ]);
  expect(receipt.status, receipt.message).toBe("accepted");
  const edited = f.session.result!.plan;
  expect(f.session.result!.changedIds).toEqual(["scenery-0", "scenery-1", "world"]);
  expect(edited.routes).toBe(initial.routes);
  expect(edited.landscapes![2]).toBe(initial.landscapes![2]);
  for (const [i, rock] of edited.landscapes!.slice(0, 2).entries()) {
    expect(rock.height).toBe(f.raw.landscapes![i].height * 1.2);
    expect(rock.rockGeneration).toMatchObject({
      heightMode: "perlin-ascent",
      slopeMode: "auto",
      slopeVariation: 0,
      heightVariation: 0
    });
  }
  const saved = upgradePlanningDocument(JSON.parse(JSON.stringify(exportPlanningAuthoring(f.session.document))));
  expect(f.compile(saved).landscapes).toEqual(edited.landscapes);
  expect(JSON.stringify(exportPlanningAuthoring(f.session.document))).not.toContain("sourceHeight");
  expect((await f.session.undo())?.status).toBe("accepted");
  expect(f.session.result!.plan.landscapes).toEqual(initial.landscapes);
  expect((await f.session.redo())?.status).toBe("accepted");
  expect(f.session.result!.plan.landscapes).toEqual(edited.landscapes);
  expect(
    (await f.session.dispatchParameters([{ op: "reset", entity: "world", component: "rockGeneration" }])).status
  ).toBe("accepted");
  expect(f.session.result!.plan.landscapes).toEqual(initial.landscapes);
  expect(f.execute).toHaveBeenCalledOnce();
});

it("preserves direct and inherited scenery heights across profile and instance edits, then resets to the source", async () => {
  const f = landscapeFixture();
  await f.session.initialize();
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: "scenery-0", component: "solid", values: { height: 4 } },
        { op: "base", entity: "scenery-1", component: "solid", base: { entity: "scenery-0", component: "solid" } }
      ])
    ).status
  ).toBe("accepted");
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: "world", component: "rockGeneration", values: { platformHeightScale: 0.5 } }
      ])
    ).status
  ).toBe("accepted");
  expect(f.session.result!.plan.landscapes!.slice(0, 2).map((rock) => rock.height)).toEqual([4, 4]);
  expect(
    (await f.session.dispatchParameters([{ op: "set", entity: "scenery-0", component: "solid", values: { x: 42 } }]))
      .status
  ).toBe("accepted");
  expect(f.session.result!.plan.landscapes![0].center.x).toBe(42);
  expect(f.session.result!.plan.landscapes![0].height).toBe(4);
  expect(
    (await f.session.dispatchParameters([{ op: "reset", entity: "scenery-0", component: "solid", fields: ["height"] }]))
      .status
  ).toBe("accepted");
  expect(f.session.result!.plan.landscapes!.slice(0, 2).map((rock) => rock.height)).toEqual(
    f.raw.landscapes!.slice(0, 2).map((rock) => rock.height * 0.5)
  );
  const saved = upgradePlanningDocument(JSON.parse(JSON.stringify(exportPlanningAuthoring(f.session.document))));
  expect(f.compile(saved).landscapes).toEqual(f.session.result!.plan.landscapes);
  expect(f.execute).toHaveBeenCalledOnce();
});

it("defaults to blunt tops at the original height and keeps an authored mixture stable under reorder, resize and population changes", () => {
  const f = fixture(1024);
  expect(readRockGenerationProfile(f.document).platformShare).toBe(1);
  expect(readRockGenerationProfile(f.document).platformHeightVariation).toBe(0);
  expect(readRockGenerationProfile(f.document).peakHeightVariation).toBe(0);
  expect(readRockGenerationProfile(f.document).platformHeightScale).toBe(1);
  expect(
    f.plan.rocks.every((rock) => (rock.boxes![0].heightMode ?? DEFAULT_ROCK_HEIGHT_MODE) === "random-ascent")
  ).toBe(true);
  f.document.entities.world.components.rockGeneration.values = { platformShare: 0.85 };
  const profile = readRockGenerationProfile(f.document);
  const plan = f.compile();
  const platforms = plan.rocks.filter(
    (rock) => (rock.boxes![0].heightMode ?? DEFAULT_ROCK_HEIGHT_MODE) === "random-ascent"
  );
  expect(platforms.length / plan.rocks.length).toBeGreaterThan(0.81);
  expect(platforms.length / plan.rocks.length).toBeLessThan(0.89);
  for (const rock of plan.rocks) {
    const box = rock.boxes![0],
      platform = (box.heightMode ?? DEFAULT_ROCK_HEIGHT_MODE) === "random-ascent";
    expect(box.sizeY).toBe(36);
    expect(box.sizeX).toBe(48);
    expect(box.sizeZ).toBe(40);
    expect(box.elevation).toBe(12);
    expect(rock.outline).toEqual(f.raw.rocks.find((source) => source.id === rock.id)!.outline);
    expect(box.heightVariation ?? DEFAULT_ROCK_HEIGHT_VARIATION).toBe(0);
    if (platform) {
      expect(box).toMatchObject({ slopeMode: "manual", slopeRate: 12 });
      expect(box.slopeVariation ?? DEFAULT_ROCK_SLOPE_VARIATION).toBe(0.2);
    } else expect(box.heightMode).toBe("perlin-ascent");
  }
  const reordered = { ...structuredClone(f.raw), rocks: [...f.raw.rocks].reverse().slice(10) };
  reordered.rocks[0] = structuredClone(reordered.rocks[0]);
  reordered.rocks[0].boxes![0].sizeX += 17;
  applyRockObbSizes(reordered, f.document);
  for (const rock of reordered.rocks)
    expect(rock.boxes![0].heightMode).toBe(plan.rocks.find((r) => r.id === rock.id)!.boxes![0].heightMode);
  expect(Array.from({ length: 32 }, (_, i) => rockGenerationKind(2, f.id(i), profile))).not.toEqual(
    Array.from({ length: 32 }, (_, i) => rockGenerationKind(1, f.id(i), profile))
  );
});

it("produces broad platform tops using the actual ascent geometry", () => {
  const f = fixture();
  f.document.entities.world.components.rockGeneration.values = { platformShare: 1 };
  const plan = f.compile(),
    jobs = rockFormationJobs(plan, planningHeightmap(plan));
  const area = (ring: number[][]) =>
    Math.abs(
      ring.reduce((sum, a, i) => {
        const b = ring[(i + 1) % ring.length];
        return sum + a[0] * b[2] - b[0] * a[2];
      }, 0)
    ) / 2;
  for (const job of jobs) {
    expect(job.surfaceGrass).toBe(true);
    const { geometry } = ascendingBoundary(seedAscentProfile(job.guides[0], job.seed));
    expect(area(geometry.upperBoundary!) / area(geometry.bottom)).toBeGreaterThan(0.6);
  }
});

it("recomputes from the original height without cumulative scaling and honors 0/1 share and zero variation", () => {
  const f = fixture();
  f.document.entities.world.components.rockGeneration.values = {
    platformShare: 1,
    platformHeightScale: 0.5,
    platformSlopeVariation: 0,
    platformHeightVariation: 0
  };
  const plan = f.compile();
  expect(plan.rocks.every((rock) => rock.boxes![0].sizeY === 18)).toBe(true);
  const before = structuredClone(plan.rocks);
  applyRockObbSizes(plan, f.document);
  expect(plan.rocks).toEqual(before);
  expect(plan.rocks[0].boxes![0].slopeVariation).toBe(0);
  expect(plan.rocks[0].boxes![0].heightVariation ?? DEFAULT_ROCK_HEIGHT_VARIATION).toBe(0);
  f.document.entities.world.components.rockGeneration.values = { platformShare: 0 };
  applyRockObbSizes(plan, f.document);
  expect(plan.rocks).toEqual(f.compile().rocks);
  expect(plan.rocks.every((rock) => rock.boxes![0].sizeY === 36 && rock.boxes![0].heightMode === "perlin-ascent")).toBe(
    true
  );
});

it("keeps explicit and inherited OBB fields plus parent-solid height authoritative over the profile", async () => {
  const f = fixture();
  await f.session.initialize();
  const fields = {
    height: 22,
    heightMode: "perlin-ascent",
    slopeMode: "manual",
    slopeRate: 5,
    slopeVariation: 0,
    heightVariation: 0,
    surfaceMode: "vertex-slabs"
  };
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: f.id(0), component: "rockObb", values: fields },
        { op: "base", entity: f.id(1), component: "rockObb", base: { entity: f.id(0), component: "rockObb" } }
      ])
    ).status
  ).toBe("accepted");
  expect(
    (
      await f.session.dispatchParameters([
        {
          op: "set",
          entity: "world",
          component: "rockGeneration",
          values: { platformShare: 1, platformHeightScale: 0.1, platformSlopeRate: 9 }
        }
      ])
    ).status
  ).toBe("accepted");
  for (const rock of f.session.result!.plan.rocks.slice(0, 2))
    expect(rock.boxes![0]).toMatchObject({
      sizeY: 22,
      slopeMode: "manual",
      slopeRate: 5,
      slopeVariation: 0,
      heightVariation: 0,
      surfaceMode: "vertex-slabs"
    });
  const saved = upgradePlanningDocument(JSON.parse(JSON.stringify(exportPlanningAuthoring(f.session.document))));
  expect(f.compile(saved).rocks).toEqual(f.session.result!.plan.rocks);
  expect(saved.entities[f.id(0)].components.rockObb.values).toEqual(fields);
  expect(f.execute).toHaveBeenCalledOnce();
  saved.entities["rock-2"] = { id: "rock-2", name: "Parent", components: { solid: { values: { height: 36 } } } };
  expect(f.compile(saved).rocks[2].boxes![0].sizeY).toBe(36);
});

it("edits, resets and replays the profile locally with undo/redo while retaining unrelated world state", async () => {
  const f = fixture();
  await f.session.initialize();
  const before = structuredClone(f.plan.rocks),
    document = f.session.export();
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: "world", component: "rockGeneration", values: { platformShare: 0, peakHeightScale: 1.2 } }
      ])
    ).status
  ).toBe("accepted");
  const changed = f.session.result!.plan;
  expect(changed.routes).toBe(f.plan.routes);
  expect(changed.buildings).toBe(f.plan.buildings);
  expect(planningHeightmap(changed).heights).toBe(planningHeightmap(f.plan).heights);
  expect(canPublishRockFormationEdit({ plan: f.plan }, document, f.session.document, changed)).toBe(true);
  expect((await f.session.undo())?.status).toBe("accepted");
  expect(f.session.result!.plan.rocks).toEqual(before);
  expect((await f.session.redo())?.status).toBe("accepted");
  expect(f.session.result!.plan.rocks).toEqual(changed.rocks);
  expect(
    (await f.session.dispatchParameters([{ op: "reset", entity: "world", component: "rockGeneration" }])).status
  ).toBe("accepted");
  expect(f.session.result!.plan.rocks).toEqual(before);
  expect(f.execute).toHaveBeenCalledOnce();
});

it("preserves saved upper-height fractions and inherited overrides, then resets to the zero default", async () => {
  const f = fixture(3);
  await f.session.initialize();
  expect(
    (
      await f.session.dispatchParameters([
        {
          op: "set",
          entity: "world",
          component: "rockGeneration",
          values: { platformHeightVariation: 0.2, peakHeightVariation: 0.2 }
        },
        { op: "set", entity: f.id(0), component: "rockObb", values: { heightVariation: 0.35 } },
        { op: "base", entity: f.id(1), component: "rockObb", base: { entity: f.id(0), component: "rockObb" } }
      ])
    ).status
  ).toBe("accepted");
  const saved = upgradePlanningDocument(JSON.parse(JSON.stringify(exportPlanningAuthoring(f.session.document))));
  expect(f.compile(saved).rocks).toEqual(f.session.result!.plan.rocks);
  expect(f.compile(saved).rocks.map((rock) => rock.boxes![0].heightVariation)).toEqual([0.35, 0.35, 0.2]);
  expect(
    (
      await f.session.dispatchParameters([
        {
          op: "reset",
          entity: "world",
          component: "rockGeneration",
          fields: ["platformHeightVariation", "peakHeightVariation"]
        },
        { op: "reset", entity: f.id(0), component: "rockObb", fields: ["heightVariation"] }
      ])
    ).status
  ).toBe("accepted");
  for (const rock of f.session.result!.plan.rocks)
    expect(rock.boxes![0].heightVariation ?? DEFAULT_ROCK_HEIGHT_VARIATION).toBe(0);
  expect(f.execute).toHaveBeenCalledOnce();
});

it("validates profile and OBB variation inputs without replacing the accepted world", async () => {
  const f = fixture();
  await f.session.initialize();
  for (const values of [
    { platformHeightScale: 0 },
    { peakHeightScale: -1 },
    { platformSlopeRate: 0 },
    { platformShare: NaN }
  ]) {
    const before = f.session.result;
    expect(
      (await f.session.dispatchParameters([{ op: "set", entity: "world", component: "rockGeneration", values }])).status
    ).toBe("rejected");
    expect(f.session.result).toBe(before);
  }
});

it("regenerates exactly one OBB job while retaining sibling meshes, domains, seeds and placements", async () => {
  const requests: RockFormationJob[] = [];
  class WorkerStub {
    onmessage?: (event: { data: { id: number; result: RockFormationMesh } }) => void;
    postMessage({ id, job }: { id: number; job: RockFormationJob }) {
      requests.push(job);
      queueMicrotask(() =>
        this.onmessage?.({
          data: {
            id,
            result: {
              id: job.id,
              origin: job.origin,
              owners: [],
              mesh: { positions: new Float32Array(0), indices: new Uint32Array(0) },
              stats: { slabs: 0, deformedVertices: 0, generationMs: 1 }
            }
          }
        })
      );
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", WorkerStub);
  const f = fixture(4),
    client = new RockFormationClient(),
    signal = new AbortController().signal;
  await f.session.initialize();
  const settings = readRockFormationSettings(f.document),
    before = await client.prepare(f.plan, settings, signal);
  const original = requests.slice();
  expect(requests).toHaveLength(4); // All four belong to the same POI.
  expect(
    (
      await f.session.dispatchParameters([
        {
          op: "set",
          entity: f.id(0),
          component: "rockObb",
          values: {
            width: 80,
            height: 11,
            heightMode: "random-ascent",
            slopeMode: "manual",
            slopeRate: 3,
            slopeVariation: 0.2,
            heightVariation: 0.05
          }
        }
      ])
    ).status
  ).toBe("accepted");
  const after = await client.prepare(f.session.result!.plan, settings, signal, before);
  expect(client.preparationMetrics).toMatchObject({ generated: 1, cached: 3 });
  expect(requests).toHaveLength(5);
  expect(after[0]).not.toBe(before[0]);
  for (let i = 1; i < 4; i++) expect(after[i]).toBe(before[i]);
  const jobs = rockFormationJobs(f.session.result!.plan, planningHeightmap(f.plan));
  expect(jobs.slice(1)).toEqual(original.slice(1));
  const presented = {
    ...f.session.result!.plan,
    rocks: f.session.result!.plan.rocks.map((rock, i) => ({
      ...rock,
      boxes: rock.boxes!.map((box) => ({ ...box, elevation: 20 + i }))
    }))
  };
  expect(rockFormationPlacements(presented, after).map((p) => p.origin[1])).toEqual([20, 21, 22, 23]);
  // A percentage-only edit takes the same local path, without rebuilding the scene.
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: f.id(0), component: "rockObb", values: { heightVariation: 0.2 } }
      ])
    ).status
  ).toBe("accepted");
  const heightEdited = await client.prepare(f.session.result!.plan, settings, signal, after);
  expect(client.preparationMetrics).toMatchObject({ generated: 1, cached: 3 });
  expect(requests).toHaveLength(6);
  expect(heightEdited[0]).not.toBe(after[0]);
  for (let i = 1; i < 4; i++) expect(heightEdited[i]).toBe(after[i]);
  expect(rockFormationJobs(f.session.result!.plan, planningHeightmap(f.plan)).slice(1)).toEqual(original.slice(1));
  expect(f.session.result!.plan.routes).toBe(f.plan.routes);
  expect(f.session.result!.plan.buildings).toBe(f.plan.buildings);
  expect(f.execute).toHaveBeenCalledOnce();
  // Changing defaults does not rebuild a rock whose authored shape is unchanged.
  expect(
    (
      await f.session.dispatchParameters([
        { op: "set", entity: "world", component: "rockGeneration", values: { platformShare: 0, peakHeightScale: 1.2 } }
      ])
    ).status
  ).toBe("accepted");
  const reprofiling = await client.prepare(f.session.result!.plan, settings, signal, heightEdited);
  expect(client.preparationMetrics).toMatchObject({ generated: 3, cached: 1 });
  expect(reprofiling[0]).toBe(heightEdited[0]);
  client.dispose();
});
