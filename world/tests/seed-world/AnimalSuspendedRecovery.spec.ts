import { it, expect, vi } from "vitest";
import { Entity, type Engine } from "@galacean/engine";
import { PlanningAnimalRuntime } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalRuntime";
import { PlanningAnimalHost } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalHost";
import {
  animalWaterChange,
  emptyAnimalWorldChange
} from "@galacean/engine-world-planning/spatial/runtime/PlanningAnimalWorldChange";
import {
  adoptPlanningHeightmap,
  planningGroundSurface,
  inheritPlanningHeightmap
} from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { preparePlanningWaterEdit } from "@galacean/engine-world-planning/spatial/hydrology/PlanningWaterEdits";
import { planningLakeBoundary } from "@galacean/engine-world-planning/semantic-study/PlanningLakeBoundary";
import { PlanningNavigationSurface } from "@galacean/engine-world-planning/spatial/runtime/PlanningNavigationSurface";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";

import {
  createLake,
  WaterQualityTier,
  WaterWaveModel,
  WaterWaveSchemaVersion
} from "@galacean/engine-water/water/index";
import { HeightfieldWaterCompiler } from "@galacean/engine-water/water/compiler/heightfield/HeightfieldWaterCompiler";
import {
  HeightfieldWaterBaseQueryService,
  createHeightfieldWaterBaseQueryResult
} from "@galacean/engine-water/water/runtime/heightfield/index";
import { PlanningAnimalHabitat } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalHabitat";

const config: any = {
  version: 2,
  enabled: true,
  spawnRadius: 100,
  roamRadius: 100,
  activationDistance: 1,
  distribution: { minX: 0, minZ: 0, maxX: 100, maxZ: 100, noiseScale: 20, noiseStrength: 0 },
  types: [{ typeId: "swan-01", min: 1, max: 1 }]
};
function fixture() {
  const plan: any = {
    parameters: { width: 100, depth: 100, seed: 1 },
    spawn: { x: 50, z: 50 },
    rocks: [],
    buildings: [],
    bridges: [],
    roadApproaches: [],
    waters: [25, 75].map((x, i) => ({
      id: "lake-" + i,
      label: "Lake " + i,
      kind: "lake",
      outline: [
        { x: x - 20, z: 30 },
        { x: x + 20, z: 30 },
        { x: x + 20, z: 70 },
        { x: x - 20, z: 70 }
      ],
      lake: { referenceLevel: 0, waterLevel: i === 0 ? -2 : -4.99 }
    }))
  };
  const heights = Float32Array.from({ length: 101 * 101 }, (_, i) =>
    Math.min(
      2,
      -5 +
        Math.min(
          Math.hypot((i % 101) - 25, Math.floor(i / 101) - 50),
          Math.hypot((i % 101) - 75, Math.floor(i / 101) - 50)
        ) *
          0.4
    )
  );
  adoptPlanningHeightmap(plan, {
    resolution: 101,
    spacingX: 1,
    spacingZ: 1,
    heights,
    encoded: new Uint16Array(heights.length),
    decodeOffset: -5,
    decodeScale: 7
  });
  const document: any = {
    revision: 0,
    entities: Object.fromEntries(
      plan.waters.map((w: any) => [
        w.id,
        { id: w.id, name: w.label, components: { lakes: { values: { levelOffsetM: w.lake.waterLevel } } } }
      ])
    )
  };
  for (const w of plan.waters) expect(planningLakeBoundary(plan, w).boundary.rings.length).toBeGreaterThan(0);
  return { document, result: { plan, recipe: { parameters: { lakes: { levelOffsetM: 0 } } } } as any };
}
// Real CPU Water compiler and base query; rendering/publication GPU resources are excluded.
function navigation(plan: any) {
  const ground = planningGroundSurface(plan).sample;
  const queries = plan.waters.map((w: any) => {
    const { grid, heights, bedTerrain, boundary } = planningLakeBoundary(plan, w);
    const descriptor = createLake({
      id: w.id,
      grid,
      bedHeights: heights,
      bedTerrain,
      boundary,
      quality: WaterQualityTier.High,
      waveAsset: { schemaVersion: WaterWaveSchemaVersion.V1, model: WaterWaveModel.None },
      surfaceMotion: { waveStrength: 0, shoreDampingWidth: 1 },
      spatialField: { signedDistanceRange: 8 }
    });
    const compiled = HeightfieldWaterCompiler.compile(descriptor);
    expect(compiled.valid, JSON.stringify(compiled.diagnostics)).toBe(true);
    return new HeightfieldWaterBaseQueryService(compiled.data!);
  });
  const sample = createHeightfieldWaterBaseQueryResult();
  return new PlanningNavigationSurface(
    plan,
    (x, z) => ground({ x, z }),
    {
      sampleSurface(x, z, out) {
        for (const query of queries) {
          query.sampleBaseSurfaceLocal(x, z, sample);
          if (sample.inside && sample.depth > 0) {
            out.surfacePosition.set(x, sample.surfaceHeight, z);
            out.waterDepth = sample.depth;
            return true;
          }
        }
        return false;
      }
    },
    undefined,
    true
  );
}
function edit(state: any, id: string, level: number) {
  planningRegistry.validate("lakes", { levelOffsetM: level });
  const document = structuredClone(state.document);
  document.revision++;
  document.entities[id].components.lakes.values.levelOffsetM = level;
  const prepared = preparePlanningWaterEdit(state.document, document, state.result);
  expect(prepared.reason).toBeUndefined();
  expect(prepared.result?.execution).toBe("water");
  const result = prepared.result!;
  const change = animalWaterChange(state.result.plan, result.plan, result.waterUpdate!)!;
  expect(change.water.length).toBe(2);
  return { document, result, change };
}
async function run(local: boolean, sameLake = false, unrelated = false) {
  const root = new Entity({ resourceManager: { _deleteAsset() {}, _deleteContentRestorer() {} } } as unknown as Engine);
  const observer = { x: 10000, z: 10000 };
  const host = new PlanningAnimalHost(
    root,
    () => observer,
    async () => ({ PlanningAnimalRuntime })
  );
  try {
    let state: any = fixture();
    host.synchronize(state.result.plan, config, navigation(state.result.plan));
    await host.preparePresentation();
    const runtime = (host as any).runtime;
    expect(runtime.population.system.maxPlanningMilliseconds).toBe(2);
    expect(runtime.population.system.maxPlanningSteps).toBe(512);
    const actor = runtime.population?.actors[0];
    expect(actor, JSON.stringify(host.inspect())).toBeDefined();

    expect(actor.animal.medium).toBe("water");
    expect(actor.x).toBeLessThan(50);
    const observe = vi.spyOn(runtime, "revalidateSupport");
    const candidates = vi.spyOn(PlanningAnimalHabitat.prototype, "spawnCandidate");
    state = edit(state, "lake-0", -4.99);
    host.synchronize(state.result.plan, config, navigation(state.result.plan), {
      preservePopulation: true,
      change: state.change
    });
    host.advance!(0);
    expect(observe.mock.calls.at(-1)?.[1]).toEqual(state.change.water);
    expect(actor.supportValid).toBe(false);
    expect(actor.animal.hasDistantActivity).toBe(false);
    const old = { x: actor.x, z: actor.z };
    const failedRecoveryCandidates = candidates.mock.calls.length;
    candidates.mockClear();
    if (unrelated) {
      const support = vi.spyOn(PlanningAnimalHabitat.prototype, "canTraverse");
      for (const kind of ["appearance", "surface", "outside-terrain", "outside-water", "outside-obstacle"]) {
        const before = state.result.plan;
        const next = { ...before };
        inheritPlanningHeightmap(next, before);
        const change = {
          ...emptyAnimalWorldChange(before),
          terrain: [] as any[],
          water: [] as any[],
          obstacles: [] as any[],
          surface: [] as any[]
        };
        const outside = { minX: 120, maxX: 130, minZ: 120, maxZ: 130 };
        if (kind === "surface") change.surface.push({ minX: 0, maxX: 100, minZ: 0, maxZ: 100 });
        if (kind === "outside-terrain") change.terrain.push(outside);
        if (kind === "outside-water") change.water.push(outside);
        if (kind === "outside-obstacle") change.obstacles.push(outside);
        host.synchronize(next, config, navigation(next), { preservePopulation: true, change });
        host.advance!(0);
        expect(candidates, kind).not.toHaveBeenCalled();
        expect(support, kind).not.toHaveBeenCalled();
        expect(actor.supportValid).toBe(false);
        expect(actor.animal.hasDistantActivity).toBe(false);
        state = { ...state, result: { ...state.result, plan: next } };
      }
      for (let i = 0; i < 60; i++) host.advance!(1 / 60);
      expect(candidates).not.toHaveBeenCalled();
    }
    state = edit(state, sameLake ? "lake-0" : "lake-1", -2);
    if (!sameLake) expect(state.change.water.every((b: any) => old.x + actor.footprint.radius < b.minX)).toBe(true);
    host.synchronize(state.result.plan, config, navigation(state.result.plan), {
      preservePopulation: true,
      ...(local ? { change: state.change } : {})
    });
    host.advance!(0);
    if (local) expect(observe.mock.calls.at(-1)?.[1]).toEqual(state.change.water);
    observer.x = 9000;
    observer.z = 9000;
    for (let i = 0; i < 60; i++) host.advance!(1 / 60);
    const result = {
      local,
      sameLake,
      failedRecoveryCandidates,
      recoveryCandidates: candidates.mock.calls.length,
      old,
      x: actor.x,
      z: actor.z,
      valid: actor.supportValid,
      coarse: actor.animal.hasDistantActivity,
      error: actor.error,
      waterLevels: state.result.plan.waters.map((w: any) => w.lake.waterLevel)
    };
    return result;
  } finally {
    vi.restoreAllMocks();
    await host.dispose();
    root.destroy();
  }
}
it("full refresh recovers after two accepted simple lake edits", async () => {
  const r = await run(false);
  expect(r.valid).toBe(true);
  expect(r.coarse).toBe(true);
  expect(r.x).toBeGreaterThan(50);
});
it("local refresh must also recover after the same accepted edits", async () => {
  const r = await run(true);
  expect(r.valid).toBe(true);
  expect(r.coarse).toBe(true);
  expect(r.x).toBeGreaterThan(50);
});

it("overlapping local edit restores the same suspended animal", async () => {
  const r = await run(true, true);
  expect(r.valid).toBe(true);
  expect(r.coarse).toBe(true);
  expect(r.x).toBeLessThan(50);
});

it("local and full recovery retain the same deterministic position and candidate work", async () => {
  const full = await run(false),
    local = await run(true);
  expect(local).toEqual({ ...full, local: true });
  expect(local.failedRecoveryCandidates).toBe(256);
  expect(local.recoveryCandidates).toBeGreaterThan(0);
  expect(local.recoveryCandidates).toBeLessThanOrEqual(256);
});
it("unrelated publications do not retry a suspended animal or prevent later remote recovery", async () => {
  const r = await run(true, false, true);
  expect(r.valid).toBe(true);
  expect(r.coarse).toBe(true);
  expect(r.x).toBeGreaterThan(50);
});
it("legacy circular placement uses its actual range, including boundary intersections", () => {
  const state = fixture();
  const habitat = new PlanningAnimalHabitat(state.result.plan, navigation(state.result.plan), {
    spawnRadius: 10,
    roamRadius: 20
  });
  expect(habitat.placementIntersects({ minX: 59, maxX: 61, minZ: 49, maxZ: 51 })).toBe(true);
  expect(habitat.placementIntersects({ minX: 58, maxX: 60, minZ: 58, maxZ: 60 })).toBe(false);
  expect(habitat.placementIntersects({ minX: 60, maxX: 61, minZ: 50, maxZ: 51 })).toBe(true);
  expect(habitat.placementIntersects({ minX: 61, maxX: 62, minZ: 50, maxZ: 51 })).toBe(false);
});

it("still rechecks a suspended animal's old footprint outside its birth range", () => {
  const actor = {
    x: 65,
    z: 50,
    supportValid: false,
    footprint: { radius: 1, height: 2 },
    birth: { medium: "ground" },
    asset: { profile: {} }
  };
  const state = fixture();
  const habitat = new PlanningAnimalHabitat(state.result.plan, navigation(state.result.plan), {
    spawnRadius: 10,
    roamRadius: 20
  });
  const bounds = { minX: 64, maxX: 66, minZ: 49, maxZ: 51 };
  expect(habitat.placementIntersects(bounds)).toBe(false);
  (PlanningAnimalRuntime.prototype as any).revalidateSupport({ actors: [actor], habitat }, [bounds]);
  expect(actor.supportValid).toBe(true);
});

it("PlanningAnimalHost.preloadModule caches module without constructing runtime and recovers cleanly on preload failure", async () => {
  const constructed = vi.fn();
  const prepared = vi.fn(async () => {});
  const synced = vi.fn();
  const updated = vi.fn();
  class FakeRuntime {
    constructor() {
      constructed();
    }
    synchronize = synced;
    update = updated;
    preparePresentation = prepared;
    dispose = vi.fn(async () => {});
    spawn = vi.fn();
    query = vi.fn();
    describe = vi.fn();
    command = vi.fn();
    receipt = vi.fn();
    commandFromPanel = vi.fn();
    notify = vi.fn();
    position = vi.fn();
    observationPosition = vi.fn();
    inspect = vi.fn();
    shoo = vi.fn();
  }

  // 1) Happy path: preloadModule loads once without constructing runtime; preparePresentation reuses it.
  const loader = vi.fn(async () => ({ PlanningAnimalRuntime: FakeRuntime as any }));
  const state = fixture();
  const host = new PlanningAnimalHost({} as any, () => ({ x: 50, z: 50 }), loader);
  host.preloadModule();
  host.preloadModule(); // idempotent
  expect(loader).toHaveBeenCalledTimes(1);
  expect(constructed).not.toHaveBeenCalled();
  host.synchronize(state.result.plan, config, navigation(state.result.plan));
  await host.preparePresentation();
  expect(loader).toHaveBeenCalledTimes(1);
  expect(constructed).toHaveBeenCalledTimes(1);
  expect(prepared).toHaveBeenCalledTimes(1);
  await host.dispose();

  // 2) Failure recovery: preload fails silently while in flight; preparePresentation retries and awaits the retry.
  let attempt = 0;
  const retryLoader = vi.fn(async () => {
    attempt++;
    if (attempt === 1) throw new Error("transient preload network error");
    return { PlanningAnimalRuntime: FakeRuntime as any };
  });
  const host2 = new PlanningAnimalHost({} as any, () => ({ x: 50, z: 50 }), retryLoader);
  host2.preloadModule();
  host2.synchronize(state.result.plan, config, navigation(state.result.plan));
  await host2.preparePresentation();
  expect(retryLoader).toHaveBeenCalledTimes(2);
  expect(constructed).toHaveBeenCalledTimes(2);
  expect(prepared).toHaveBeenCalledTimes(2);
  await host2.dispose();
});
