import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LandscapePlantInstance } from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import type { InstancedUnderstoryRecord } from "../src/spatial/runtime/NaturalUnderstoryInstancedPool";

type MockEffectCall = {
  kind: "enter" | "exit" | "update";
  root: { id: string; destroyed: boolean; pendingDestroy: boolean; destroy: () => void };
  signal?: AbortSignal;
  onComplete?: () => void;
  resolve: () => void;
  reject: (err: unknown) => void;
};

const effectCalls: MockEffectCall[] = [];

function makeEffectMock(kind: "enter" | "exit" | "update") {
  return vi.fn(
    (
      roots: readonly { id: string; destroyed: boolean; pendingDestroy: boolean; destroy: () => void }[],
      options?: { signal?: AbortSignal; onComplete?: () => void }
    ) =>
      new Promise<void>((resolve, reject) => {
        const call: MockEffectCall = {
          kind,
          root: roots[0]!,
          signal: options?.signal,
          onComplete: options?.onComplete,
          resolve,
          reject
        };
        effectCalls.push(call);
        options?.signal?.addEventListener(
          "abort",
          () => {
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true }
        );
      })
  );
}

const mocks = vi.hoisted(() => ({
  enter: vi.fn(),
  exit: vi.fn(),
  update: vi.fn(),
  editablePlants: [] as LandscapePlantInstance[]
}));

vi.mock("@galacean/engine-vegetation/asset-assembly/AssetEntranceEffect", () => ({
  playAssetEntranceEffect: (...args: unknown[]) => mocks.enter(...args),
  playAssetExitEffect: (...args: unknown[]) => mocks.exit(...args),
  playAssetUpdateEffect: (...args: unknown[]) => mocks.update(...args)
}));

vi.mock("../src/spatial/runtime/PlanningNaturalVegetation", async () => {
  const actual = await vi.importActual<typeof import("../src/spatial/runtime/PlanningNaturalVegetation")>(
    "../src/spatial/runtime/PlanningNaturalVegetation"
  );
  class StubPlanningNaturalVegetation {
    anchors: unknown[] = [];
    layers: unknown[] = [];
    setGroundExclusions() {}
    compileCell() {
      return {
        instances: [],
        diagnostics: { layers: {}, populations: {}, decorations: {}, rejected: {} }
      };
    }
  }
  return {
    ...actual,
    PlanningNaturalVegetation: StubPlanningNaturalVegetation,
    planningEditablePlants: () => mocks.editablePlants
  };
});

import { PlanningNaturalVegetationRuntime } from "../src/spatial/runtime/PlanningNaturalVegetationRuntime";

function makeInstance(overrides: Partial<LandscapePlantInstance> & { id: string }): LandscapePlantInstance {
  return {
    assetId: "pine-a",
    layerId: "乔木",
    clusterId: overrides.id,
    scopeId: overrides.id,
    position: [10, 0, 12],
    yaw: 0,
    scale: 1,
    radius: 2,
    height: 8,
    ...overrides
  };
}

function createRuntimeFixture(initialRecords: InstancedUnderstoryRecord[] = []) {
  const runtime = Object.create(PlanningNaturalVegetationRuntime.prototype) as any;
  const setCell = vi.fn();
  const markMembershipDirty = vi.fn();
  const updateGroundExclusions = vi.fn();
  const refreshAppearanceColors = vi.fn();
  const createdTempRoots: Array<{
    id: string;
    destroyed: boolean;
    pendingDestroy: boolean;
    isActive: boolean;
    children: never[];
    transform: {
      position: { x: number; y: number; z: number };
      setPosition(x: number, y: number, z: number): void;
    };
    destroy(): void;
  }> = [];

  const treeRecordPool = new Map<string, InstancedUnderstoryRecord>();
  for (const rec of initialRecords) treeRecordPool.set(rec.instance.id, rec);

  Object.assign(runtime, {
    disposed: false,
    time: 1.5,
    owner: {
      engine: { resourceManager: { load: vi.fn(async () => ({ data: { assets: [] } })) } },
      createChild: (name: string) => ({
        name,
        isActive: false,
        children: [],
        destroyed: false,
        pendingDestroy: false,
        createChild: (childName: string) => ({
          name: childName,
          isActive: false,
          children: [],
          destroyed: false,
          pendingDestroy: false,
          destroy() {}
        }),
        destroy() {}
      })
    },
    camera: { entity: { transform: { worldPosition: { x: 0, y: 2, z: 0 } } } },
    plan: { parameters: { width: 256, depth: 256, seed: 1 }, authoredResources: [] },
    height: { sample: () => 5 },
    groundingFields: {
      sizeMetres: 256,
      worldOrigin: [0, 0],
      heightResolution: 2,
      heightSamples: new Uint16Array(4),
      heightDecode: { offset: 5, scale: 1 }
    },
    population: {},
    plantAssets: [],
    planner: { anchors: [] },
    treeRoot: {
      createChild: (name: string) => ({ name, isActive: true, children: [], destroy() {} })
    },
    detailRoot: { addChild() {} },
    trees: [],
    treePool: new Map(),
    treeRecords: [...initialRecords],
    treeRecordPool,
    cells: new Map(),
    plantEffects: new Map(),
    instancedTreeEffects: new Map(),
    exitingPlants: new WeakSet(),
    groundExclusions: new Map(),
    sources: [
      new Map([
        [
          "pine-a",
          {
            entry: { id: "pine-a", category: "Trees" },
            bounds: { min: [-1, 0, -1], max: [1, 8, 1] },
            rendererBindings: []
          }
        ],
        [
          "oak-a",
          {
            entry: { id: "oak-a", category: "Trees" },
            bounds: { min: [-1, 0, -1], max: [1, 8, 1] },
            rendererBindings: []
          }
        ]
      ])
    ],
    metadataSources: new Map(),
    previewColors: new Map(),
    materialParameters: {},
    instancedTrees: {
      setCell,
      markMembershipDirty,
      updateGroundExclusions,
      refreshAppearanceColors
    },
    populateMetadataFromCatalog: () => false,
    ensureGpuAssetsForWorld: vi.fn(async () => {}),
    plantGroundHeight: (_fields: unknown, instance: LandscapePlantInstance) => instance.position[1] ?? 5,
    groundExcluded: vi.fn(() => false),
    createInstancedPlantRecord: vi.fn(
      (instance: LandscapePlantInstance, _isTree: boolean, _f: unknown, _r: unknown, ground: number) =>
        ({
          instance,
          groundHeight: ground,
          refYOffset: 4,
          worldCenterY: ground + 4,
          worldSize: 8,
          boundingRadius: 4,
          terminalCutoff: 0.01,
          pickId: instance.id,
          excluded: false,
          assignedLod: -1,
          lods: []
        }) as unknown as InstancedUnderstoryRecord
    ),
    plant: vi.fn((_owner: unknown, instance: LandscapePlantInstance, _isTree: boolean, _f: unknown, _r: unknown, ground?: number) => {
      const pos = { x: instance.position[0], y: ground ?? 5, z: instance.position[2] };
      const root = {
        id: instance.id,
        destroyed: false,
        pendingDestroy: false,
        isActive: true,
        children: [] as never[],
        transform: {
          position: pos,
          setPosition(x: number, y: number, z: number) {
            pos.x = x;
            pos.y = y;
            pos.z = z;
          }
        },
        destroy() {
          this.destroyed = true;
        }
      };
      createdTempRoots.push(root);
      return {
        root,
        instance,
        groundHeight: ground ?? 5,
        lod: {
          setAuthoringVisible: vi.fn(),
          snapToCurrentLod: vi.fn(() => ({
            screenRelativeHeight: 0.5,
            rendererSets: [{ lodIndex: 0, signedFade: 1, crossFading: false }]
          }))
        },
        pickBatches: [],
        grassRootPositions: [],
        foliageRenderers: [],
        barkRenderers: [],
        appearanceBindings: []
      };
    })
  });

  return { runtime, setCell, markMembershipDirty, updateGroundExclusions, createdTempRoots };
}

describe("instanced tree CRUD rainbow effects", () => {
  beforeEach(() => {
    effectCalls.length = 0;
    mocks.editablePlants = [];
    mocks.enter.mockImplementation(makeEffectMock("enter"));
    mocks.exit.mockImplementation(makeEffectMock("exit"));
    mocks.update.mockImplementation(makeEffectMock("update"));
  });

  it("plays entrance rainbow on newly created instanced tree, hides its batch record during playback, and restores it on completion", async () => {
    const { runtime, markMembershipDirty, createdTempRoots } = createRuntimeFixture();
    const newTree = makeInstance({ id: "tree-new", position: [8, 5, 6] });
    mocks.editablePlants = [newTree];

    const prepared = await runtime.prepareTrees(runtime.plan);
    prepared.commit();

    expect(effectCalls).toHaveLength(1);
    expect(effectCalls[0]!.kind).toBe("enter");
    expect(createdTempRoots).toHaveLength(1);
    expect(createdTempRoots[0]!.destroyed).toBe(false);

    const record = runtime.treeRecordPool.get("tree-new")!;
    expect(record.excluded).toBe(true);
    expect(markMembershipDirty).toHaveBeenCalledTimes(1);

    // Complete animation synchronously (same hook AssetEntrancePlaybackDriver runs before render)
    effectCalls[0]!.onComplete?.();
    effectCalls[0]!.resolve();
    await Promise.resolve();

    expect(record.excluded).toBe(false);
    expect(markMembershipDirty).toHaveBeenCalledTimes(2);
    expect(createdTempRoots[0]!.destroyed).toBe(true);
    expect(runtime.instancedTreeEffects.size).toBe(0);
  });

  it("plays update rainbow when an existing instanced tree moves and keeps another animating tree excluded", async () => {
    const treeA = makeInstance({ id: "tree-a", position: [4, 5, 4] });
    const treeB = makeInstance({ id: "tree-b", position: [12, 5, 8] });
    const { runtime, createdTempRoots } = createRuntimeFixture();

    // Create both trees first
    mocks.editablePlants = [treeA, treeB];
    (await runtime.prepareTrees(runtime.plan)).commit();
    expect(effectCalls).toHaveLength(2);
    // Finish treeB's entrance, leave treeA mid-entrance
    const callB = effectCalls.find((c) => c.root.id === "tree-b")!;
    callB.onComplete?.();
    callB.resolve();
    await Promise.resolve();

    expect(runtime.treeRecordPool.get("tree-a")!.excluded).toBe(true);
    expect(runtime.treeRecordPool.get("tree-b")!.excluded).toBe(false);

    // Move treeB while treeA is still animating
    const movedB = makeInstance({ id: "tree-b", position: [15, 5, 9], yaw: 45 });
    mocks.editablePlants = [treeA, movedB];
    (await runtime.prepareTrees(runtime.plan)).commit();

    // treeA must stay excluded and still animating; treeB plays "update"
    expect(runtime.treeRecordPool.get("tree-a")!.excluded).toBe(true);
    expect(runtime.treeRecordPool.get("tree-b")!.excluded).toBe(true);
    const updateCalls = effectCalls.filter((c) => c.kind === "update");
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.root.id).toBe("tree-b");

    // Complete treeB update
    updateCalls[0]!.onComplete?.();
    updateCalls[0]!.resolve();
    await Promise.resolve();
    expect(runtime.treeRecordPool.get("tree-b")!.excluded).toBe(false);
    expect(createdTempRoots.at(-1)!.destroyed).toBe(true);
  });

  it("plays exit rainbow on deleted instanced tree and re-plays entrance rainbow when re-revealed from pool", async () => {
    const tree = makeInstance({ id: "tree-1", position: [6, 5, 6] });
    const { runtime, createdTempRoots } = createRuntimeFixture();

    // Create and finish entrance
    mocks.editablePlants = [tree];
    (await runtime.prepareTrees(runtime.plan)).commit();
    effectCalls[0]!.onComplete?.();
    effectCalls[0]!.resolve();
    await Promise.resolve();

    // Delete tree
    mocks.editablePlants = [];
    (await runtime.prepareTrees(runtime.plan)).commit();
    expect(runtime.treeRecords).toHaveLength(0);
    expect(effectCalls).toHaveLength(2);
    expect(effectCalls[1]!.kind).toBe("exit");
    expect(createdTempRoots[1]!.destroyed).toBe(false);

    // Complete exit
    effectCalls[1]!.onComplete?.();
    effectCalls[1]!.resolve();
    await Promise.resolve();
    expect(createdTempRoots[1]!.destroyed).toBe(true);

    // Undo / re-reveal the same pooled tree id
    mocks.editablePlants = [tree];
    (await runtime.prepareTrees(runtime.plan)).commit();
    expect(effectCalls).toHaveLength(3);
    expect(effectCalls[2]!.kind).toBe("enter");
    expect(runtime.treeRecordPool.get("tree-1")!.excluded).toBe(true);
  });

  it("aborts active instanced tree effect cleanly when ground exclusions cover the tree or runtime disposes", async () => {
    const tree = makeInstance({ id: "tree-cover", position: [5, 5, 5] });
    const { runtime, createdTempRoots } = createRuntimeFixture();

    mocks.editablePlants = [tree];
    (await runtime.prepareTrees(runtime.plan)).commit();
    expect(effectCalls).toHaveLength(1);
    expect(effectCalls[0]!.signal?.aborted).toBe(false);

    // Simulate building footprint covering tree mid-animation
    runtime.groundExcluded.mockReturnValue(true);
    runtime.setGroundExclusions("building-1", [
      [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 10, z: 10 },
        { x: 0, z: 10 }
      ]
    ]);

    expect(effectCalls[0]!.signal?.aborted).toBe(true);
    expect(createdTempRoots[0]!.destroyed).toBe(true);
    expect(runtime.treeRecordPool.get("tree-cover")!.excluded).toBe(true);
    expect(runtime.instancedTreeEffects.size).toBe(0);
  });

  it("plays enter/update/exit rainbow effects in prepareWaterImpact for forest/shrubland, skips height-only shifts, caps at 32 nearest, and cleans up on rollback", async () => {
    const { runtime, createdTempRoots } = createRuntimeFixture();
    const signal = new AbortController().signal;
    const bounds = { minimumX: 0, maximumX: 0, minimumZ: 0, maximumZ: 0 };

    // 1. Create a 40-tree forest + shrubland -> should play enter on 32 nearest instances
    const forestPlants = Array.from({ length: 40 }, (_, i) =>
      makeInstance({
        id: `population:forest-1:${i}`,
        layerId: i % 2 === 0 ? "乔木" : "小灌木",
        scopeId: "forest-1",
        clusterId: "forest-1",
        position: [10 + i * 2, 5, 0]
      })
    );
    mocks.editablePlants = forestPlants;
    const createUpdate = await runtime.prepareWaterImpact(
      { ...runtime.plan },
      runtime.height,
      runtime.groundingFields,
      runtime.population,
      bounds,
      signal
    );
    createUpdate.commit();

    expect(effectCalls).toHaveLength(32);
    expect(effectCalls.every((c) => c.kind === "enter")).toBe(true);
    // Nearest 32 (indices 0..31) animate; farthest 8 (32..39) stay directly in instanced pool
    expect(effectCalls.map((c) => c.root.id)).toContain("population:forest-1:0");
    expect(effectCalls.map((c) => c.root.id)).toContain("population:forest-1:31");
    expect(effectCalls.map((c) => c.root.id)).not.toContain("population:forest-1:32");
    expect(runtime.treeRecordPool.get("population:forest-1:0")!.excluded).toBe(true);
    expect(runtime.treeRecordPool.get("population:forest-1:32")!.excluded).toBe(false);

    // Rollback must abort all 32 active effects and destroy temp plants with zero leaks
    createUpdate.rollback();
    expect(runtime.instancedTreeEffects.size).toBe(0);
    expect(createdTempRoots.every((r) => r.destroyed)).toBe(true);
    expect(runtime.treeRecords).toHaveLength(0);

    // Re-commit a 2-tree forest and complete entrance
    effectCalls.length = 0;
    const twoTrees = [
      makeInstance({ id: "population:forest-2:0", scopeId: "forest-2", position: [8, 5, 4] }),
      makeInstance({ id: "population:forest-2:1", scopeId: "forest-2", layerId: "小灌木", position: [12, 5, 4] })
    ];
    mocks.editablePlants = twoTrees;
    const commitTwo = await runtime.prepareWaterImpact(
      { ...runtime.plan },
      runtime.height,
      runtime.groundingFields,
      runtime.population,
      bounds,
      signal
    );
    commitTwo.commit();
    commitTwo.finalize();
    expect(effectCalls).toHaveLength(2);
    for (const c of effectCalls) {
      c.onComplete?.();
      c.resolve();
    }
    await Promise.resolve();
    expect(runtime.treeRecordPool.get("population:forest-2:0")!.excluded).toBe(false);
    expect(runtime.treeRecordPool.get("population:forest-2:1")!.excluded).toBe(false);

    // 2. Ground-height-only shift (e.g. terrain patch re-grounding) must NOT flash rainbow
    effectCalls.length = 0;
    mocks.editablePlants = twoTrees.map((t) => ({ ...t, position: [t.position[0], 6.2, t.position[2]] as const }));
    const heightOnlyUpdate = await runtime.prepareWaterImpact(
      { ...runtime.plan },
      runtime.height,
      runtime.groundingFields,
      runtime.population,
      bounds,
      signal
    );
    heightOnlyUpdate.commit();
    heightOnlyUpdate.finalize();
    expect(effectCalls).toHaveLength(0);

    // 3. Structural move on member 0 + delete member 1 + add member 2 -> update + exit + enter
    effectCalls.length = 0;
    mocks.editablePlants = [
      makeInstance({ id: "population:forest-2:0", scopeId: "forest-2", position: [14, 6.2, 4] }),
      makeInstance({ id: "population:forest-2:2", scopeId: "forest-2", position: [16, 6.2, 4] })
    ];
    const mixedUpdate = await runtime.prepareWaterImpact(
      { ...runtime.plan },
      runtime.height,
      runtime.groundingFields,
      runtime.population,
      bounds,
      signal
    );
    mixedUpdate.commit();
    mixedUpdate.finalize();
    expect(effectCalls).toHaveLength(3);
    const kindsById = Object.fromEntries(effectCalls.map((c) => [c.root.id, c.kind]));
    expect(kindsById).toEqual({
      "population:forest-2:0": "update",
      "population:forest-2:1": "exit",
      "population:forest-2:2": "enter"
    });
  });

  it("projects authored area/cluster forest and shrubland brushes in planningEditablePlants", async () => {
    const actual = await vi.importActual<typeof import("../src/spatial/runtime/PlanningNaturalVegetation")>(
      "../src/spatial/runtime/PlanningNaturalVegetation"
    );
    const { NATURAL_VEGETATION_PALETTES } = await import("../src/runtime/NaturalVegetationLayers");
    const assets = [...NATURAL_VEGETATION_PALETTES.trees, ...NATURAL_VEGETATION_PALETTES.shrubs].map((id) => ({
      id,
      bounds: { min: [-1, 0, -1] as [number, number, number], max: [1, 4, 1] as [number, number, number] },
      height: 4,
      radius: 1.4,
      footprintArea: 4
    }));
    const plan = {
      parameters: { width: 256, depth: 256, seed: 42 },
      landscapes: [],
      authoredResources: [
        {
          resourceType: "vegetation-brush",
          resourceId: "forest-brush-1",
          properties: {
            category: "tree",
            plantKind: "tree",
            distributionKind: "cluster",
            x: 120,
            z: 120,
            radiusMetres: 15,
            densityScale: 1,
            requestedPlantCount: 4,
            seed: 7
          }
        },
        {
          resourceType: "vegetation-brush",
          resourceId: "shrub-brush-1",
          properties: {
            category: "shrub",
            plantKind: "shrub",
            distributionKind: "area",
            x: 140,
            z: 140,
            radiusMetres: 8,
            densityScale: 0.2,
            requestedPlantCount: 3,
            seed: 9
          }
        },
        {
          resourceType: "object-removal",
          resourceId: "rm-1",
          properties: { objectKind: "tree", objectId: "population:forest-brush-1:0" }
        }
      ]
    } as any;

    const projected = actual.planningEditablePlants(plan, { sample: () => 3 }, assets);
    const forestMembers = projected.filter((p) => p.scopeId === "forest-brush-1");
    const shrubMembers = projected.filter((p) => p.scopeId === "shrub-brush-1");
    expect(forestMembers).toHaveLength(3); // 4 minus 1 removed
    expect(forestMembers.every((p) => p.layerId === "乔木")).toBe(true);
    expect(shrubMembers).toHaveLength(3);
    expect(shrubMembers.every((p) => p.layerId === "小灌木")).toBe(true);
  });
});
