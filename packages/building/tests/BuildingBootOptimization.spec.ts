import { describe, expect, it, vi } from "vitest";
import { BuildingRuntime, masonryShaderFeatures } from "../src/building/parts/architecture/BuildingRuntime";
import { European } from "../src/building/application/European";

function makeTerrain(revision = 1) {
  return {
    revision,
    grid: {
      samples: new Uint16Array(4),
      resolution: 2,
      origin: [-10, -10] as [number, number],
      size: 20,
      decode: { offset: 0, scale: 1 }
    }
  } as any;
}

function makeMockFrame(scene: any, x = 0, z = 0) {
  const wm = new Float64Array(16);
  wm[0] = 1;
  wm[5] = 1;
  wm[10] = 1;
  wm[15] = 1;
  wm[12] = x;
  wm[14] = z;
  return {
    scene,
    destroyed: false,
    transform: { worldMatrix: { elements: wm } }
  } as any;
}

describe("BuildingRuntime boot optimizations", () => {
  it("cancels the pending frame callback when the detail yield falls back to its timer", async () => {
    vi.useFakeTimers();
    const cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", () => 42);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    try {
      const yieldDetailFrame = (
        BuildingRuntime.prototype as unknown as { yieldDetailFrame(): Promise<void> }
      ).yieldDetailFrame;
      const pending = yieldDetailFrame.call({ flushDepth: 0 });

      await vi.advanceTimersByTimeAsync(32);

      await pending;
      expect(cancelFrame).toHaveBeenCalledExactlyOnceWith(42);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("skips redundant flush() on initial empty prepareTerrain and sets applied on commit/rollback", async () => {
    const scene = { id: "boot-scene" };
    const frame = makeMockFrame(scene);
    const body = { id: "g0" };
    const terrain = makeTerrain(1);
    let flushCalls = 0;

    const runtime: any = {
      closed: false,
      shown: false,
      inputUpdates: 0,
      revision: 3,
      applied: -1,
      surfaceRevision: 0,
      generationSerial: 0,
      probeRevision: -1,
      frameRevision: -1,
      frameGroups: new Map(),
      frameMembers: new Map(),
      inputCacheRevision: -1,
      inputCacheTerrain: undefined,
      inputCache: new Map(),
      dirtyTransformMembers: new Set(),
      publishedTerrain: terrain,
      views: new Map(),
      entries: [],
      members: new Map([[body, { flag: false }]]),
      activeBuilds: new Set(),
      compiler: { workerLimit: 2 },
      residency: { desired: new Set(), selectionDirty: false, invalidate() {} },
      entity: { scene, destroyed: false },
      async flush() {
        flushCalls++;
      },
      readTransforms() {},
      frames: (BuildingRuntime.prototype as any).frames,
      input: (BuildingRuntime.prototype as any).input,
      acceptEntrance() {},
      refreshProbe() {},
      queriesFor: () => [],
      captureQueries: () => ({}),
      updateResidency() {},
      updateLights() {},
      prepareView: async (targetFrame: any, input: any) => ({
        kind: "profile",
        frame: targetFrame,
        signature: input.signature,
        bodies: input.bodies,
        lights: [],
        view: { root: { isActive: false, destroyed: false }, bounds: { min: [0, 0, 0], max: [1, 1, 1] }, destroy() {} },
        cpu: { valid: true, dispose() {} },
        occupancy: { hasSameGeometry: () => false }
      }),
      host: {
        validate() {},
        isBody: () => true,
        frame: () => frame,
        collect: (f: any, bodies: any[], scopedMembers: Iterable<any>) => ({
          signature: `sig-${f === frame ? "0" : "x"}`,
          bodies,
          scopedCount: [...scopedMembers].length,
          execution: "worker",
          draft: { groups: [], parts: [] },
          placement: { position: [0, 0, 0], rotationY: 0 }
        })
      }
    };

    const candidate = await BuildingRuntime.prototype.prepareTerrain.call(runtime, terrain);
    expect(flushCalls).toBe(0);
    expect(runtime.applied).toBe(-1);

    candidate.commit();
    expect(runtime.applied).toBe(3);

    candidate.rollback();
    expect(runtime.applied).toBe(-1);

    candidate.commit();
    candidate.finalize();
    expect(runtime.applied).toBe(3);
  });

  it("fans out drain() across multiple frames concurrently and passes frame-scoped members to host.collect", async () => {
    const scene = { id: "drain-scene" };
    const frames = [makeMockFrame(scene, 0, 0), makeMockFrame(scene, 20, 0), makeMockFrame(scene, 40, 0), makeMockFrame(scene, 60, 0)];
    const members = new Map<any, any>();
    const ownerByMember = new Map<any, any>();
    for (let i = 0; i < frames.length; i++) {
      const group = { kind: "group", frameIndex: i };
      const partA = { kind: "part", frameIndex: i, idx: 0 };
      const partB = { kind: "part", frameIndex: i, idx: 1 };
      for (const m of [group, partA, partB]) {
        members.set(m, { flag: false });
        ownerByMember.set(m, frames[i]);
      }
    }

    let inFlight = 0;
    let maxInFlight = 0;
    const seenScopedCounts: number[] = [];

    const runtime: any = {
      closed: false,
      shown: true,
      inputUpdates: 0,
      revision: 1,
      applied: -1,
      surfaceRevision: 0,
      generationSerial: 0,
      frameRevision: -1,
      frameGroups: new Map(),
      frameMembers: new Map(),
      inputCacheRevision: -1,
      inputCacheTerrain: undefined,
      inputCache: new Map(),
      dirtyTransformMembers: new Set(),
      views: new Map(),
      entries: [],
      members,
      activeBuilds: new Set(),
      compiler: { workerLimit: 2 },
      residency: { desired: new Set(), selectionDirty: false, invalidate() {} },
      entrance: { states: new Map(), remove() {} },
      entity: { scene, destroyed: false },
      readTransforms() {},
      validateBuild() {},
      frames: (BuildingRuntime.prototype as any).frames,
      input: (BuildingRuntime.prototype as any).input,
      acceptEntrance() {},
      refreshProbe() {},
      retire() {},
      prepareView: async (targetFrame: any, input: any) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 15));
        inFlight--;
        return {
          kind: "profile",
          frame: targetFrame,
          signature: input.signature,
          bodies: input.bodies,
          lights: [],
          view: { root: { isActive: false, destroyed: false }, bounds: { min: [0, 0, 0], max: [1, 1, 1] }, destroy() {} },
          cpu: { valid: true, dispose() {} },
          occupancy: { hasSameGeometry: () => false }
        };
      },
      host: {
        validate() {},
        isBody: (m: any) => m.kind === "group",
        groupIdentity: (m: any) => `group-${m.frameIndex}`,
        frame: (m: any) => ownerByMember.get(m),
        collect: (f: any, bodies: any[], scopedMembers: Iterable<any>) => {
          const list = [...scopedMembers];
          seenScopedCounts.push(list.length);
          expect(list.every((m) => ownerByMember.get(m) === f)).toBe(true);
          return {
            signature: `sig-${bodies[0].frameIndex}`,
            bodies,
            execution: "worker",
            draft: { groups: [], parts: [] },
            placement: { position: [0, 0, 0], rotationY: 0 }
          };
        }
      }
    };

    await (BuildingRuntime.prototype as any).drain.call(runtime);
    expect(runtime.applied).toBe(1);
    expect(runtime.views.size).toBe(4);
    expect(maxInFlight).toBeGreaterThanOrEqual(2);
    expect(maxInFlight).toBeLessThanOrEqual(3); // workerLimit (2) + 1
    // Each of the 4 frames should receive only its own 3 members (not all 12 scene members).
    expect(seenScopedCounts).toEqual([3, 3, 3, 3]);
  });

  it("fingerprints strictly by shader features and caps prepareShaderWarmupForViews to <= 3 buildings", async () => {
    const brickGableHouse = {
      draft: {
        groups: [{ id: "g1", shared: { house: { roof: { height: 0.9, ridge_length: 1 } } } }],
        parts: [
          { group: "g1", type: "wall", unit: { source: "brick" } },
          { group: "g1", type: "roof", unit: { source: "roof_tile" } },
          { group: "g1", type: "plaster" },
          { group: "g1", type: "window" },
          { group: "g1", type: "door" }
        ]
      }
    };
    const brickGableWithDormerAndFloorBand = {
      draft: {
        groups: [{ id: "g2", shared: { house: { roof: { height: 0.9, ridge_length: 1 } } } }],
        parts: [
          { group: "g2", type: "wall", unit: { source: "brick" } },
          { group: "g2", type: "roof", unit: { source: "roof_tile" } },
          { group: "g2", type: "dormer" },
          { group: "g2", type: "floorBand", unit: { source: "brick" } },
          { group: "g2", type: "foundation", unit: { source: "brick" } },
          { group: "g2", type: "plaster" },
          { group: "g2", type: "window" },
          { group: "g2", type: "lantern" }
        ]
      }
    };
    const woodHouseWithArch = {
      draft: {
        groups: [{ id: "g3", shared: { house: { roof: { height: 0.85, ridge_length: 1 } } } }],
        parts: [
          { group: "g3", type: "wall", unit: { source: "wooden_plank" } },
          { group: "g3", type: "roof", unit: { source: "roof_tile" } },
          { group: "g3", type: "woodArch" },
          { group: "g3", type: "steps", unit: { source: "brick" } }
        ]
      }
    };

    const f1 = masonryShaderFeatures(brickGableHouse as any);
    const f2 = masonryShaderFeatures(brickGableWithDormerAndFloorBand as any);
    const f3 = masonryShaderFeatures(woodHouseWithArch as any);

    // Dormer/floorBand/foundation only add unit:brick (shared brick shader), never Cartesian part.type explosion.
    expect(f1).toEqual(new Set(["wall:brick|joint=1", "roof:roof_tile", "plaster", "window", "decoration"]));
    expect([...f2].filter((k) => !f1.has(k))).toEqual(["unit:brick"]);
    expect(f3.has("wall:wooden_plank|joint=1")).toBe(true);
    expect(f3.has("wood-arch")).toBe(true);
    expect(f3.has("stone-floor")).toBe(true);

    // Verify prepareShaderWarmupForViews caps selection to <= 3 even across 8 distinct buildings.
    const scene = { id: "warmup-scene" };
    const warmedFrames: any[] = [];
    const makeEntry = (idx: number, x: number, draft: any) => {
      const frame = makeMockFrame(scene, x, 0);
      return {
        entry: {
          kind: "profile",
          frame,
          lights: [],
          lod: 2,
          view: {
            bounds: { min: [-2, 0, -2], max: [2, 4, 2] },
            root: { getComponentsIncludeChildren: () => [] },
            warmupDetailedVisual: vi.fn(async () => {
              warmedFrames.push(idx);
            }),
            releaseDetailedVisual: vi.fn()
          },
          cpu: {
            valid: true,
            compile: async () => {
              throw new Error("stop-after-selection");
            },
            dispose() {}
          }
        },
        input: {
          assets: { _addReferCount() {} },
          draft,
          bindings: new Map(),
          terrain: undefined
        }
      };
    };

    const specs = [
      makeEntry(0, 10, brickGableHouse.draft),
      makeEntry(1, 20, brickGableWithDormerAndFloorBand.draft),
      makeEntry(2, 30, woodHouseWithArch.draft),
      makeEntry(3, 40, {
        groups: [{ id: "g4", shared: { house: { circle: true, roof: { height: 2, ridge_length: 0 } } } }],
        parts: [
          { group: "g4", type: "wall", unit: { source: "brick" } },
          { group: "g4", type: "roof", unit: { source: "brick" } }
        ]
      }),
      makeEntry(4, 50, {
        groups: [{ id: "g5", shared: { house: { circle: true, roof: { height: 2, ridge_length: 0 } } } }],
        parts: [
          { group: "g5", type: "wall", unit: { source: "wooden_plank" } },
          { group: "g5", type: "roof", unit: { source: "wooden_plank" } }
        ]
      })
    ];
    const inputByFrame = new Map(specs.map((s) => [s.entry.frame, s.input]));

    const runtime: any = {
      closed: false,
      entity: {
        scene,
        createChild: () => ({ isActive: false, destroyed: false, destroy() {} })
      },
      views: new Map(),
      entries: [],
      host: {
        camera: { entity: { transform: { worldPosition: { x: 0, y: 0, z: 0 } } } }
      },
      input: (frame: any) => inputByFrame.get(frame)
    };

    await expect(
      (BuildingRuntime.prototype as any).prepareShaderWarmupForViews.call(
        runtime,
        specs.map((s) => s.entry),
        specs.map((s) => s.entry)
      )
    ).rejects.toThrow("stop-after-selection");

    // Must never select more than 3 buildings, must always include closest (0), and greedily pick highest new-feature cover (2).
    expect(warmedFrames.length).toBeLessThanOrEqual(3);
    expect(warmedFrames).toContain(0);
    expect(warmedFrames).toContain(2);
  });

  it("fingerprints stone-hat prefabs and wall-stone frames from real European.buildHouses drafts", () => {
    const gothicWindowWall = European.buildHouses({
      id: "gothicWin",
      seed: 11,
      height: 5,
      rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
      roof: { height: 0.9, ridge_length: 1, profile: 0.6 },
      attachments: [
        {
          id: "wg",
          kind: "window",
          type: "window-gothic",
          frameMaterial: "wall",
          u: 0.15,
          bottom: 1.2,
          width: 1.2,
          height: 1.8
        }
      ]
    });
    const featuresGothicWin = masonryShaderFeatures({ draft: gothicWindowWall });
    expect(featuresGothicWin.has("decoration-stone")).toBe(true);
    expect(featuresGothicWin.has("decoration-stone-frame")).toBe(true);

    const gothicDoorWood = European.buildHouses({
      id: "gothicDoor",
      seed: 12,
      height: 5,
      rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
      roof: { height: 0.9, ridge_length: 1, profile: 0.6 },
      attachments: [{ id: "dg", kind: "door", type: "door-gothic", u: 0.15, bottom: 0, width: 1.2, height: 2.2 }]
    });
    const featuresGothicDoor = masonryShaderFeatures({ draft: gothicDoorWood });
    expect(featuresGothicDoor.has("decoration-stone")).toBe(true);
    expect(featuresGothicDoor.has("decoration-stone-frame")).toBe(false);

    const dormerWallFrame = European.buildHouses({
      id: "gothicDormer",
      seed: 13,
      height: 5,
      rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
      roof: { height: 0.9, ridge_length: 1, profile: 0.6 },
      attachments: [
        { id: "dm", kind: "window", host: "roof", type: "dormer-gothic", frameMaterial: "wall", uv: [0.5, 0.35] },
        {
          id: "eh",
          kind: "window",
          type: "dormer-gothic-half",
          u: 0.15,
          bottom: 3.4,
          width: 1.2,
          height: 1.6
        }
      ]
    });
    const featuresDormer = masonryShaderFeatures({ draft: dormerWallFrame });
    expect(featuresDormer.has("decoration-stone")).toBe(true);
    expect(featuresDormer.has("decoration-stone-frame")).toBe(true);

    // Also test a roof-only dormer-gothic with frameMaterial: "wall" (without eaveDormer) produces decoration-stone-frame.
    const roofOnlyDormer = European.buildHouses({
      id: "roofOnlyDormer",
      seed: 14,
      height: 5,
      rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
      roof: { height: 0.9, ridge_length: 1, profile: 0.6 },
      attachments: [{ id: "dm", kind: "window", host: "roof", type: "dormer-gothic", frameMaterial: "wall", uv: [0.5, 0.35] }]
    });
    const featuresRoofOnly = masonryShaderFeatures({ draft: roofOnlyDormer });
    expect(featuresRoofOnly.has("decoration-stone-frame")).toBe(true);
  });

  it("destroys late-resolving prepareView outputs without leaking when aborted/destroyed mid-prepareTerrain", async () => {
    const scene = { id: "race-scene" };
    const frameA = makeMockFrame(scene, 0, 0);
    const frameB = makeMockFrame(scene, 25, 0);
    const bodyA = { id: "gA", frame: frameA };
    const bodyB = { id: "gB", frame: frameB };
    const terrain = makeTerrain(1);
    const abortController = new AbortController();

    let resolveB!: () => void;
    const gateB = new Promise<void>((resolve) => {
      resolveB = resolve;
    });
    let destroyedA = 0;
    let destroyedB = 0;
    let disposedCpuA = 0;
    let disposedCpuB = 0;

    const runtime: any = {
      closed: false,
      shown: false,
      inputUpdates: 0,
      revision: 1,
      applied: -1,
      surfaceRevision: 0,
      generationSerial: 0,
      probeRevision: -1,
      frameRevision: -1,
      frameGroups: new Map(),
      frameMembers: new Map(),
      inputCacheRevision: -1,
      inputCacheTerrain: undefined,
      inputCache: new Map(),
      dirtyTransformMembers: new Set(),
      publishedTerrain: terrain,
      views: new Map(),
      entries: [],
      members: new Map([
        [bodyA, { flag: false }],
        [bodyB, { flag: false }]
      ]),
      activeBuilds: new Set(),
      compiler: { workerLimit: 2 },
      residency: { desired: new Set(), selectionDirty: false, invalidate() {} },
      entity: { scene, destroyed: false },
      async flush() {},
      readTransforms() {},
      frames: (BuildingRuntime.prototype as any).frames,
      input: (BuildingRuntime.prototype as any).input,
      acceptEntrance() {},
      refreshProbe() {},
      queriesFor: () => [],
      captureQueries: () => ({}),
      updateResidency() {},
      updateLights() {},
      prepareView: async (targetFrame: any, input: any) => {
        if (targetFrame === frameB) {
          await gateB;
          return {
            kind: "profile",
            frame: targetFrame,
            signature: input.signature,
            bodies: input.bodies,
            lights: [],
            view: {
              root: { isActive: false, destroyed: false },
              bounds: { min: [0, 0, 0], max: [1, 1, 1] },
              destroy: () => {
                destroyedB++;
              }
            },
            cpu: {
              valid: true,
              dispose: () => {
                disposedCpuB++;
              }
            },
            occupancy: { hasSameGeometry: () => false }
          };
        }
        return {
          kind: "profile",
          frame: targetFrame,
          signature: input.signature,
          bodies: input.bodies,
          lights: [],
          view: {
            root: { isActive: false, destroyed: false },
            bounds: { min: [0, 0, 0], max: [1, 1, 1] },
            destroy: () => {
              destroyedA++;
            }
          },
          cpu: {
            valid: true,
            dispose: () => {
              disposedCpuA++;
            }
          },
          occupancy: { hasSameGeometry: () => false }
        };
      },
      host: {
        validate() {},
        isBody: () => true,
        frame: (m: any) => m.frame,
        collect: (_f: any, bodies: any[]) => ({
          signature: `sig-${bodies[0].id}`,
          bodies,
          execution: "worker",
          draft: { groups: [], parts: [] },
          placement: { position: [0, 0, 0], rotationY: 0 }
        })
      }
    };

    const pending = BuildingRuntime.prototype.prepareTerrain.call(runtime, terrain, abortController.signal);
    // Let frameA resolve and push into `prepared` while frameB is still in flight.
    await new Promise((r) => setTimeout(r, 10));
    // Abort triggers discard() synchronously -> destroys frameA and sets finished=true.
    abortController.abort(new DOMException("Aborted", "AbortError"));
    expect(destroyedA).toBe(1);
    expect(disposedCpuA).toBe(1);

    // Now frameB finishes late after discard(); must be destroyed immediately, never leaked.
    resolveB();
    await expect(pending).rejects.toThrow();
    expect(destroyedB).toBe(1);
    expect(disposedCpuB).toBe(1);
  });
});
