import { expect, it, vi } from "vitest";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import {
  planningSurfacePublicationGate,
  planningWaterImpactBounds,
  preparePlanningWaterImpact
} from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterPublication";
import type { PublishedPlanningSeedScene } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedScenePublication";
import { planningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";

it("admits real terrain patch addition/removal while retaining global-owner and mixed-edit guards", async () => {
  const initial = createSeedPlanningDocument(1);
  const session = new PlanningSession(exportPlanningRecipe(initial), undefined, initial);
  await session.initialize();
  const before = session.export(),
    base = session.result!;
  expect(base.accepted).toBe(true);
  const previous = {
    plan: base.plan,
    vegetation: {},
    data: { surfaceIntent: { riverBedCoverage: new Uint8Array(1) } }
  } as PublishedPlanningSeedScene;
  const after = structuredClone(before);
  const point = { x: base.plan.spawn.x - 8, z: base.plan.spawn.z + 20 };
  after.authoredResources = [
    {
      resourceId: "local",
      resourceType: "terrain-patch",
      properties: { ...point, radiusMetres: 20, heightDeltaMetres: 1 }
    }
  ];
  expect((await session.load(after)).status).toBe("accepted");
  const result = session.result!;
  expect(result.accepted).toBe(true);
  expect(planningSurfacePublicationGate(previous, before, after, result)).toBeUndefined();
  const a = planningHeightmap(base.plan),
    b = planningHeightmap(result.plan);
  expect(b.sample(point)).not.toBe(a.sample(point));
  const bounds = planningWaterImpactBounds(previous, result.plan);
  // Every changed height sample and its interpolation neighbourhood must be included.
  let changed = 0;
  for (let z = 0; z < b.resolution; z++)
    for (let x = 0; x < b.resolution; x++) {
      if (a.heights[z * a.resolution + x] === b.heights[z * b.resolution + x]) continue;
      changed++;
      expect(bounds.minimumX).toBeLessThanOrEqual(Math.max(0, (x - 1) * b.spacingX));
      expect(bounds.maximumX).toBeGreaterThanOrEqual(Math.min(result.plan.parameters.width, (x + 1) * b.spacingX));
      expect(bounds.minimumZ).toBeLessThanOrEqual(Math.max(0, (z - 1) * b.spacingZ));
      expect(bounds.maximumZ).toBeGreaterThanOrEqual(Math.min(result.plan.parameters.depth, (z + 1) * b.spacingZ));
    }
  expect(changed).toBeGreaterThan(0);
  expect(planningSurfacePublicationGate({ ...previous, plan: result.plan }, after, before, base)).toBeUndefined();
  expect(planningSurfacePublicationGate(previous, before, after, result, true)).toBe("projection-out-of-sync");
  const mixed = structuredClone(after);
  mixed.authoredResources!.push({
    resourceId: "remove",
    resourceType: "object-removal",
    properties: { objectId: "unrelated", kind: "tree" }
  } as any);
  expect(planningSurfacePublicationGate(previous, before, mixed, result)).toBe("mixed-non-surface-intent");
  for (const key of [
    "routes",
    "roadGraph",
    "roadNetwork",
    "bridges",
    "roadApproaches",
    "buildings",
    "rocks",
    "fences",
    "courtyards",
    "farming"
  ] as const) {
    const plan = { ...result.plan, [key]: ["changed"] };
    expect(planningSurfacePublicationGate(previous, before, after, { ...result, plan } as any)).toBe(
      "changed-global-owner:" + key
    );
    const capable = { ...previous, world: { exactPrefabs: { exactInstances: [] } } } as any;
    const admitted = planningSurfacePublicationGate(
      capable,
      before,
      after,
      { ...result, plan } as any,
      false,
      undefined,
      true
    );
    // When live local adaptation is enabled (dependentSolids = true), downstream owners
    // (including buildings/fences/courtyards/farming) adapt locally instead of forcing a full rebuild.
    expect(admitted).toBeUndefined();
  }
  expect(
    planningSurfacePublicationGate({ ...previous, masonry: { terrainEditPending: true } } as any, before, after, result)
  ).toBe("masonry-edit-active");
  expect(planningSurfacePublicationGate({ ...previous, template: {} } as any, before, after, result)).toBe(
    "template-terrain-owner"
  );
  expect(
    planningSurfacePublicationGate(
      { ...previous, world: { exactPrefabs: { exactInstances: [{}] } } } as any,
      before,
      after,
      result
    )
  ).toBe("exact-prefab-terrain-owner");
  expect(
    planningSurfacePublicationGate(
      {
        ...previous,
        heightTransition: { fields: { heightSamples: new Uint16Array(1) } },
        data: { fields: { heightSamples: new Uint16Array(1) } }
      } as any,
      before,
      after,
      result
    )
  ).toBe("terrain-transition-active");
  expect(
    planningSurfacePublicationGate(previous, before, after, {
      ...result,
      plan: { ...result.plan, parameters: { ...result.plan.parameters, width: result.plan.parameters.width * 2 } }
    })
  ).toBe("world-lattice-changed");
  expect(
    planningSurfacePublicationGate(previous, before, after, {
      ...result,
      plan: { ...result.plan, landscapes: [{ kind: "rock", id: "changed" }] }
    } as any)
  ).toBe("changed-global-owner:landscape-rocks");
  const empty = { ...result.plan, buildings: [], fences: [], courtyards: [] };
  expect(planningSurfacePublicationGate(previous, before, after, { ...result, plan: empty }, false, 1)).toBe(
    "terrain-transition-requested"
  );
  // When dependent local grounding is enabled (runtime editor), exactPrefabs & terrain transitions stay local.
  const localCapable = {
    ...previous,
    world: { exactPrefabs: { exactInstances: [{}] }, applyAuthoringHeightPatch: () => {} }
  } as any;
  expect(planningSurfacePublicationGate(localCapable, before, after, result, false, 1.5, true)).toBeUndefined();
  const localEmpty = { ...localCapable, plan: empty };
  expect(
    planningSurfacePublicationGate(localEmpty, before, after, { ...result, plan: empty }, false, 1.5, true)
  ).toBeUndefined();
  // Live runtime adaptation also admits template worlds, first-time rivers, and mixed terrain+content edits.
  expect(
    planningSurfacePublicationGate({ ...localCapable, template: {} } as any, before, after, result, false, 1, true)
  ).toBeUndefined();
  expect(
    planningSurfacePublicationGate(
      { ...localCapable, data: { surfaceIntent: {} } } as any,
      before,
      after,
      { ...result, plan: { ...result.plan, waters: [{ id: "r1", kind: "river", outline: [] }] } } as any,
      false,
      1,
      true
    )
  ).toBeUndefined();
  expect(planningSurfacePublicationGate(localCapable, before, mixed, result, false, 1, true)).toBeUndefined();
  // True re-genesis (seed or world size change) still takes the full rebuild path.
  expect(
    planningSurfacePublicationGate(
      localCapable,
      before,
      after,
      { ...result, plan: { ...result.plan, parameters: { ...result.plan.parameters, seed: result.plan.parameters.seed + 1 } } },
      false,
      1,
      true
    )
  ).toBe("world-lattice-changed");
  // Same-seed farming placement/ground updates caused by a local mountain/valley edit stay on the local fast path.
  if (result.plan.farming?.farmId) {
    const sameFarmUpdated = {
      ...result.plan,
      farming: {
        ...result.plan.farming,
        placementCheck: { state: "blocked" as const, issues: [] }
      }
    };
    expect(
      planningSurfacePublicationGate(localCapable, before, after, { ...result, plan: sameFarmUpdated }, false, 1, true)
    ).toBeUndefined();
  }
}, 120000);

it("keeps seed 885817723 mountain near spawn farm on the local height-tween path", async () => {
  const initial = createSeedPlanningDocument(885817723);
  const session = new PlanningSession(exportPlanningRecipe(initial), undefined, initial);
  await session.initialize();
  const before = session.export();
  const base = session.result!;
  expect(base.accepted).toBe(true);
  const previous = {
    plan: base.plan,
    vegetation: {},
    world: { exactPrefabs: { exactInstances: [] }, applyAuthoringHeightPatch: () => {} },
    data: { surfaceIntent: { riverBedCoverage: new Uint8Array(1) } }
  } as unknown as PublishedPlanningSeedScene;
  const after = structuredClone(before);
  after.authoredResources = [
    ...(after.authoredResources ?? []),
    {
      resourceId: "agent-mountain-885817723",
      resourceType: "terrain-feature",
      properties: {
        kind: "mountain",
        x: 137.25328409828182,
        z: 533.8464749728818,
        headingDegrees: 149.3849292266612,
        lengthMetres: 160,
        widthMetres: 140,
        elevationDeltaMetres: 50,
        sharpness: 0.65,
        asymmetry: 0.25,
        roughness: 0.45,
        erosion: 0.35,
        seed: 1
      }
    }
  ];
  expect((await session.load(after)).status).toBe("accepted");
  const result = session.result!;
  expect(result.accepted).toBe(true);
  expect(planningSurfacePublicationGate(previous, before, after, result, false, 1, true)).toBeUndefined();
}, 120000);

it("waits for the Raster worker before reading or baking candidate height samples", async () => {
  const failure = Error("worker cancelled");
  const raster = { run: vi.fn().mockRejectedValue(failure) };
  // No prepared heightmap exists yet. Preparation must propagate the worker failure,
  // without trying to compile either of these intentionally unavailable input maps.
  await expect(
    preparePlanningWaterImpact(
      {
        revision: 0,
        world: { getSurfaceReliefTuning: () => ({ maskCoverageStart: 0, maskSoftnessMetres: 0.5 }) }
      } as any,
      { plan: {} } as any,
      raster as any,
      new AbortController().signal,
      1
    )
  ).rejects.toBe(failure);
  expect(raster.run).toHaveBeenCalledOnce();
});

it("settles an active local height tween before prepareWaterTerrain stages a new clipmap update", async () => {
  const initial = createSeedPlanningDocument(1);
  const session = new PlanningSession(exportPlanningRecipe(initial), undefined, initial);
  await session.initialize();
  const before = session.export();
  const base = session.result!;
  expect(base.accepted).toBe(true);

  const after = structuredClone(before);
  after.authoredResources = [
    {
      resourceId: "local-settle",
      resourceType: "terrain-patch",
      properties: { x: base.plan.spawn.x - 8, z: base.plan.spawn.z + 20, radiusMetres: 18, heightDeltaMetres: 1.5 }
    }
  ];
  expect((await session.load(after)).status).toBe("accepted");
  const nextResult = session.result!;
  expect(nextResult.accepted).toBe(true);

  const makeFields = (sizeMetres: number) => ({
    sizeMetres,
    heightResolution: 2,
    surfaceResolution: 2,
    heightSamples: new Uint16Array(4),
    surfaceHeights: new Float32Array(4),
    waterMask: new Uint8Array(4),
    wetness: new Uint8Array(4),
    habitat: new Uint8Array(4),
    wetlandWeight: new Uint8Array(4),
    rockySlopeWeight: new Uint8Array(4),
    materialWeights: new Uint8Array(16)
  });
  const makeNativeData = (plan: typeof base.plan) => ({
    fields: makeFields(plan.parameters.width),
    surfaceIntent: { resolution: 2, materialWeights: new Uint8Array(16), hash: 0 },
    terrainSettings: {},
    terrainNormalSamples: new Uint8Array(8),
    population: { detailDensityFields: [] },
    plan: { roads: [], roadDistance: new Uint16Array(4) }
  });

  const order: string[] = [];
  const raster = {
    run: vi.fn().mockResolvedValue(undefined),
    takeNativeData: vi.fn().mockReturnValue(makeNativeData(nextResult.plan)),
    takeSurfaceRelief: vi.fn().mockReturnValue(undefined)
  };
  const sentinel = new Error("stop-after-prepare-water-terrain");
  await expect(
    preparePlanningWaterImpact(
      {
        revision: 0,
        plan: base.plan,
        data: makeNativeData(base.plan),
        solids: { formations: [] },
        world: {
          getSurfaceReliefTuning: () => ({ maskCoverageStart: 0, maskSoftnessMetres: 0.5 }),
          settleLocalHeightTransition: () => {
            order.push("settleLocalHeightTransition");
          },
          prepareWaterTerrain: () => {
            order.push("prepareWaterTerrain");
            throw sentinel;
          }
        }
      } as any,
      nextResult,
      raster as any,
      new AbortController().signal,
      1
    )
  ).rejects.toBe(sentinel);
  expect(order).toEqual(["settleLocalHeightTransition", "prepareWaterTerrain"]);
}, 120000);

it("uses Float32-exact decode comparison in playLocalHeightTransition so sub-1e-6 Float32 decode shifts upload a full frame", async () => {
  const { SeedWorldTerrainRuntime } = await import(
    "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime"
  );
  const { resolveTerrainHeightFrameDecode } = await import(
    "@galacean/engine-terrain/terrain/clipmap/TerrainHeightFrame"
  );
  const res = 8;
  const prevSamples = new Uint16Array(res * res).fill(10000);
  const nextSamples = prevSamples.slice();
  nextSamples[3 * res + 3] = 20000;
  const previous = {
    sizeMetres: 64,
    heightResolution: res,
    heightSamples: prevSamples,
    heightDecode: { offset: -8, scale: 20 }
  } as any;
  const next = {
    sizeMetres: 64,
    heightResolution: res,
    heightSamples: nextSamples,
    heightDecode: { offset: -8 + 5e-7, scale: 20 }
  } as any;
  const region = {
    id: "seed-world",
    x: 0,
    y: 0,
    width: res,
    height: res,
    heightDecodeOffset: next.heightDecode.offset,
    heightDecodeScale: next.heightDecode.scale
  } as any;
  let currentOffset = Math.fround(next.heightDecode.offset);
  let currentScale = Math.fround(next.heightDecode.scale);
  const frames: Array<{ origin: readonly [number, number]; size: readonly [number, number] }> = [];

  const runtime = Object.create(SeedWorldTerrainRuntime.prototype);
  Object.assign(runtime, {
    _destroyed: false,
    _heightTransition: undefined,
    root: { scene: undefined },
    clipmap: {
      renderMaterials: [],
      updateHeightRegionFrame: (patch: any) => {
        const [off, sc] = resolveTerrainHeightFrameDecode(patch, region, currentOffset, currentScale);
        currentOffset = off;
        currentScale = sc;
        frames.push({ origin: patch.sampleOrigin, size: patch.sampleSize });
      }
    },
    population: { applyAuthoringHeightFrame: vi.fn() },
    applyAuthoringHeightPatch: vi.fn()
  });

  runtime.playLocalHeightTransition(previous, next, { minimumX: 0, minimumZ: 0, maximumX: 64, maximumZ: 64 }, 1);
  // Frame 0 must upload full region because Math.fround(-8) !== Math.fround(-8 + 5e-7) despite diff <= 1e-6.
  expect(frames[0]).toEqual({ origin: [0, 0], size: [res, res] });
  // Mid-tween frame uploads dirty sub-rectangle without throwing.
  runtime._terrainEditWave(0.5);
  expect(frames[1]!.size[0]).toBeLessThan(res);
  // Final frame restores canonical next decode with a full region patch.
  runtime.settleLocalHeightTransition();
  expect(frames[2]).toEqual({ origin: [0, 0], size: [res, res] });
  expect(currentOffset).toBe(Math.fround(next.heightDecode.offset));
});

it("reuses a single sparse dirty-rect height buffer across local height tween frames without per-frame slicing", async () => {
  const { SeedWorldTerrainRuntime } = await import(
    "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime"
  );
  const res = 8;
  const prevSamples = new Uint16Array(res * res).fill(10000);
  const nextSamples = prevSamples.slice();
  nextSamples[4 * res + 4] = 30000;
  const previous = {
    sizeMetres: 64,
    heightResolution: res,
    heightSamples: prevSamples,
    heightDecode: { offset: -8, scale: 40 }
  } as any;
  const next = {
    sizeMetres: 64,
    heightResolution: res,
    heightSamples: nextSamples,
    heightDecode: { offset: -8, scale: 40 }
  } as any;

  const seenFieldRefs: unknown[] = [];
  const seenBuffers: Uint16Array[] = [];
  const seenCenterValues: number[] = [];
  const runtime = Object.create(SeedWorldTerrainRuntime.prototype);
  Object.assign(runtime, {
    _destroyed: false,
    _heightTransition: undefined,
    root: { scene: undefined },
    clipmap: { renderMaterials: [], updateHeightRegionFrame: vi.fn() },
    population: { applyAuthoringHeightFrame: vi.fn() },
    applyAuthoringHeightPatch: vi.fn()
  });

  runtime.playLocalHeightTransition(
    previous,
    next,
    { minimumX: 0, minimumZ: 0, maximumX: 64, maximumZ: 64 },
    1,
    (fields: any) => {
      seenFieldRefs.push(fields);
      seenBuffers.push(fields.heightSamples);
      seenCenterValues.push(fields.heightSamples[4 * res + 4]!);
    }
  );
  runtime._terrainEditWave(0.25);
  runtime._terrainEditWave(0.25);
  runtime.settleLocalHeightTransition();

  // Each tween frame must emit a distinct shallow wrapper reference so identity-checked consumers
  // (e.g. PlanningFarmLandLayer.refreshTerrain) do not short-circuit on `fields === this.fields`.
  expect(seenFieldRefs[0]).not.toBe(seenFieldRefs[1]);
  expect(seenFieldRefs[1]).not.toBe(seenFieldRefs[2]);
  // Frame 0, 0.25, 0.5 reuse the exact same Uint16Array buffer (0 per-frame Uint16Array allocation).
  expect(seenBuffers[0]).toBe(seenBuffers[1]);
  expect(seenBuffers[1]).toBe(seenBuffers[2]);
  // Final settled frame switches to the immutable finalHeightSamples buffer (not aliased to tween buffer).
  expect(seenBuffers[3]).not.toBe(seenBuffers[0]);
  expect(seenCenterValues[0]).toBe(10000);
  expect(seenCenterValues[2]).toBe(20000); // smoothstep(0.5) = 0.5 -> midpoint 20000
  expect(seenCenterValues[3]).toBe(30000);
  // Original input buffers remain completely untouched.
  expect(prevSamples[4 * res + 4]).toBe(10000);
  expect(nextSamples[4 * res + 4]).toBe(30000);
});

it("updates PlanningFarmLandLayer chunks on every mid-tween frame while sharing the tween height buffer", async () => {
  const { SeedWorldTerrainRuntime } = await import(
    "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime"
  );
  const { PlanningFarmLandLayer } = await import(
    "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmLandLayer"
  );
  const { captureFarmLandHeights, FARM_LAND_HEIGHT_SAMPLE_COUNT, farmLandGrid } = await import(
    "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmLandGeometry"
  );
  const res = 17;
  const prevSamples = new Uint16Array(res * res).fill(10000);
  const nextSamples = new Uint16Array(res * res).fill(30000);
  const previous = {
    sizeMetres: 64,
    heightResolution: res,
    heightSamples: prevSamples,
    heightDecode: { offset: -8, scale: 40 }
  } as any;
  const next = {
    sizeMetres: 64,
    heightResolution: res,
    heightSamples: nextSamples,
    heightDecode: { offset: -8, scale: 40 }
  } as any;

  const grid = farmLandGrid(previous);
  const initialHeights = new Float32Array(FARM_LAND_HEIGHT_SAMPLE_COUNT);
  captureFarmLandHeights(previous, grid, { x: 0, z: 0 }, initialHeights);
  const rebuiltHeights: number[] = [];
  const layer = Object.create(PlanningFarmLandLayer.prototype);
  const fakeRenderer = { mesh: { destroy: vi.fn() } };
  Object.assign(layer, {
    disposed: false,
    fields: previous,
    grid,
    bounds: [],
    grass: [],
    opaquePlots: [],
    heightScratch: new Float32Array(FARM_LAND_HEIGHT_SAMPLE_COUNT),
    chunks: new Map([
      [
        "0,0",
        {
          key: "0,0",
          entity: {
            transform: { worldPosition: { x: 0, z: 0 } },
            getComponent: () => fakeRenderer
          },
          mesh: { destroy: vi.fn() },
          heights: initialHeights.slice()
        }
      ]
    ]),
    createMesh: vi.fn((_domain: any, heights: Float32Array) => {
      rebuiltHeights.push(heights[Math.floor(heights.length / 2)]!);
      return { destroy: vi.fn() };
    })
  });

  const runtime = Object.create(SeedWorldTerrainRuntime.prototype);
  Object.assign(runtime, {
    _destroyed: false,
    _heightTransition: undefined,
    root: { scene: undefined },
    clipmap: { renderMaterials: [], updateHeightRegionFrame: vi.fn() },
    population: { applyAuthoringHeightFrame: vi.fn() },
    applyAuthoringHeightPatch: vi.fn()
  });

  const rebuildCounts: number[] = [];
  runtime.playLocalHeightTransition(
    previous,
    next,
    { minimumX: -32, minimumZ: -32, maximumX: 32, maximumZ: 32 },
    1,
    (fields: any) => layer.refreshTerrain(fields)
  );
  rebuildCounts.push(rebuiltHeights.length); // progress = 0 (unchanged from previous)
  runtime._terrainEditWave(0.25);
  rebuildCounts.push(rebuiltHeights.length);
  runtime._terrainEditWave(0.25);
  rebuildCounts.push(rebuiltHeights.length);
  runtime._terrainEditWave(0.25);
  rebuildCounts.push(rebuiltHeights.length);
  runtime.settleLocalHeightTransition();
  rebuildCounts.push(rebuiltHeights.length);

  expect(rebuildCounts).toEqual([0, 1, 2, 3, 4]);
  expect(rebuiltHeights[0]!).toBeLessThan(rebuiltHeights[1]!);
  expect(rebuiltHeights[1]!).toBeLessThan(rebuiltHeights[2]!);
  expect(rebuiltHeights[2]!).toBeLessThan(rebuiltHeights[3]!);
});
