import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { BuildingManager } from "@galacean/engine-building/building/parts/architecture/BuildingManager.ts";
import { validatePartCollection } from "@galacean/engine-building/building/parts/architecture/BuildingPartCollection.ts";
import { NativeBuildingWorld } from "../src/masonry/NativeBuildingHost";

vi.hoisted(() => Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true }));

// Exercise managed snapshot reachability independently of GPU resource cleanup.
setFlagsFromString("--expose_gc");
const collect = runInNewContext("gc") as () => void;
async function collectRetired() {
  for (let i = 0; i < 6; i++) {
    await new Promise<void>(resolve => setImmediate(resolve));
    collect();
  }
}
const terrain = (size = 2) => ({ revision: size, grid: {
  samples: new Uint16Array(size * size), resolution: size, origin: [0, 0] as [number, number],
  size: 1024, decode: { offset: 0, scale: 1 }
} });

async function prepareEmptyScene() {
  const previous = terrain(1024), retiredSamples = new WeakRef(previous.grid.samples);
  const system = {
    publishedTerrain: previous, host: {validate: validatePartCollection}, entries: [], members: new Map(), views: new Map(), revision: 0,
    residency: { desired: new Set(), invalidate() {} },
    async flush() {}, readTransforms() {}, frames: () => new Map(), queriesFor: () => [],
    updateResidency() {}, updateLights() {}, visible: true
  };
  // Only rendering collaborators are replaced; the transaction/terminal methods are real.
  const candidate = await BuildingManager.prototype.prepareTerrain.call(system as any, terrain(), new AbortController().signal);
  candidate.commit(); candidate.finalize();
  return { candidate, system, retiredSamples };
}

it("releases previous terrain even while a finalized building transaction is retained", async () => {
  const result = await prepareEmptyScene();
  await collectRetired();
  expect(result.retiredSamples.deref()).toBeUndefined();
  expect(result.system.publishedTerrain.grid.samples).toHaveLength(4);
  expect(() => result.candidate.commit()).toThrow("stale");
});

const acceptWorld = () => {};
const isCurrentWorld = () => true;
const liveQuery = () => "live-query";
function publishWorld() {
  const snapshot = { samples: new Uint16Array(1024 * 1024) }, retiredQuery = new WeakRef(snapshot);
  const system = { visible: true, bounds: [], captureOccupancyQuery: liveQuery };
  const candidate = {
    assertCurrent() {}, commit() {}, finalize() {}, discard() {}, bounds: [], captureOccupancyQuery: () => snapshot
  };
  const world = new NativeBuildingWorld(system as any, candidate as any, acceptWorld, isCurrentWorld);
  world.commitPublication(); world.activate();
  return { world, retiredQuery };
}

it("accepted world reads the live system without retaining its prepared query snapshot", async () => {
  const result = publishWorld();
  await collectRetired();
  expect(result.retiredQuery.deref()).toBeUndefined();
  expect(result.world.captureOccupancyQuery()).toBe("live-query");
  expect(() => result.world.commitPublication()).toThrow("settled");
  result.world.rollbackPublication();
  expect(result.world.enabled).toBe(true);
  await result.world.destroy();
});

it("routes NativeBuildingWorld.prepareShaderWarmup to the uncommitted candidate before activation and to the live system after", async () => {
  const signal = new AbortController().signal;
  const candidateWarmup = vi.fn(async () => ({
    renderers: [],
    extraMaterials: new Map(),
    decorationPointLightBudget: 4,
    dispose() {}
  }));
  const systemWarmup = vi.fn(async () => ({
    renderers: [],
    extraMaterials: new Map(),
    decorationPointLightBudget: 0,
    dispose() {}
  }));
  const system = { visible: true, bounds: [], captureOccupancyQuery: liveQuery, prepareShaderWarmup: systemWarmup };
  const candidate = {
    assertCurrent() {},
    commit() {},
    finalize() {},
    discard() {},
    bounds: [],
    captureOccupancyQuery: () => "prepared-query",
    prepareShaderWarmup: candidateWarmup
  };
  const world = new NativeBuildingWorld(system as any, candidate as any, acceptWorld, isCurrentWorld);
  const preCommit = await world.prepareShaderWarmup(signal);
  expect(candidateWarmup).toHaveBeenCalledWith(signal);
  expect(systemWarmup).not.toHaveBeenCalled();
  expect(preCommit.decorationPointLightBudget).toBe(4);

  world.commitPublication();
  world.activate();
  const postActivate = await world.prepareShaderWarmup(signal);
  expect(systemWarmup).toHaveBeenCalledWith(signal);
  expect(postActivate.decorationPointLightBudget).toBe(0);
});

it("prepareTerrain candidate prepareShaderWarmup emits negative point-light delta when decoration lights are already active even for a building-free target", async () => {
  const system = {
    closed: false,
    publishedTerrain: terrain(2),
    host: { validate: validatePartCollection },
    entries: [],
    members: new Map(),
    views: new Map(),
    revision: 0,
    lights: { root: { isActiveInHierarchy: true }, metrics: { allocated: 4 } },
    residency: { desired: new Set(), invalidate() {} },
    async flush() {},
    readTransforms() {},
    frames: () => new Map(),
    queriesFor: () => [],
    updateResidency() {},
    updateLights() {},
    visible: true,
    prepareShaderWarmupForViews: (BuildingManager.prototype as any).prepareShaderWarmupForViews
  };
  const candidate = await BuildingManager.prototype.prepareTerrain.call(
    system as any,
    terrain(4),
    new AbortController().signal
  );
  const warmup = await candidate.prepareShaderWarmup();
  expect(warmup.decorationPointLightBudget).toBe(-4);
  warmup.dispose();

  // When decoration lights are inactive and target has no buildings, delta is 0.
  system.lights.root.isActiveInHierarchy = false;
  const inactiveWarmup = await candidate.prepareShaderWarmup();
  expect(inactiveWarmup.decorationPointLightBudget).toBe(0);
  inactiveWarmup.dispose();
  candidate.discard();
});

it("releases retired terrain samples and avoids input thrash when preparing terrain with active buildings", async () => {
  let previous: ReturnType<typeof terrain> | undefined = terrain(512);
  let next: ReturnType<typeof terrain> | undefined = terrain(256);
  const prevRef = new WeakRef(previous.grid.samples);
  const nextRef = new WeakRef(next.grid.samples);
  let collectCount = 0;

  const frame = { destroyed: false, scene: null as any } as any;
  const body = { entity: frame } as any;
  const members = new Map([[body, { flag: false, destroy() {} }]]);
  const existingView = {
    kind: "profile",
    frame,
    bodies: [body],
    signature: "sig-512",
    cpu: { valid: true, dispose() {} },
    view: { root: { isActive: true }, setVisualVisible() {}, setFarProxyActive() {}, destroy() {}, setEntrance() {} },
    lights: [],
    entranceInstanceKeys: [],
    entranceStates: new Map()
  };
  const system: any = {
    closed: false,
    shown: false,
    surfaceRevision: 0,
    generationSerial: 0,
    probeRevision: -1,
    detailDirty: false,
    lightsDirty: false,
    revision: 1,
    applied: 1,
    frameRevision: 1,
    frameGroups: new Map([[frame, [body]]]),
    inputCacheRevision: -1,
    inputCacheTerrain: undefined,
    inputCache: new Map(),
    dirtyTransformMembers: new Set(),
    identities: new Map(),
    publishedTerrain: previous,
    entries: [],
    members,
    views: new Map([[frame, existingView]]),
    residency: { desired: new Set(), invalidate() {} },
    compiler: { dispose() {} },
    async flush() {},
    readTransforms() {},
    frames: () => system.frameGroups,
    input: (BuildingManager.prototype as any).input,
    acceptEntrance() {},
    refreshProbe() {},
    queriesFor: () => [],
    captureQueries: () => ({}),
    updateResidency() {},
    updateLights() {},
    clearExitingViews() {},
    retire: (BuildingManager.prototype as any).retire,
    prepareView: async (targetFrame: any, input: any) => ({
      ...existingView,
      frame: targetFrame,
      signature: input.signature
    }),
    host: {
      validate: () => {},
      isBody: () => true,
      frame: () => frame,
      collect: (_frame: any, _bodies: any, _members: any, sourceTerrain: any) => {
        collectCount++;
        return {
          signature: `sig-${sourceTerrain?.revision ?? 0}`,
          execution: "worker",
          draft: { groups: [] },
          placement: { position: [0, 0, 0], rotationY: 0 }
        };
      }
    }
  };
  frame.scene = system.entity = { scene: { id: "scene" }, destroyed: false };

  // Warm cache on previous terrain.
  expect(system.input(frame).signature).toBe("sig-512");
  expect(collectCount).toBe(1);

  // prepareTerrain(next) should collect `next` once and hit cached `previous` without thrashing `inputCache`.
  collectCount = 0;
  let candidate: Awaited<ReturnType<typeof BuildingManager.prototype.prepareTerrain>> | undefined =
    await BuildingManager.prototype.prepareTerrain.call(system, next, new AbortController().signal);
  expect(collectCount).toBe(1);
  expect(system.inputCacheTerrain).toBe(previous);

  candidate.commit();
  candidate.finalize();
  candidate = undefined;
  previous = undefined;

  expect(system.inputCacheTerrain).toBeUndefined();
  expect(system.inputCache.size).toBe(0);
  await collectRetired();
  expect(prevRef.deref()).toBeUndefined();

  // Separate discarded transaction must not pin its candidate terrain in `inputCacheTerrain`.
  let discardedTerrain: ReturnType<typeof terrain> | undefined = terrain(128);
  const discardedRef = new WeakRef(discardedTerrain.grid.samples);
  let discardedCandidate: Awaited<ReturnType<typeof BuildingManager.prototype.prepareTerrain>> | undefined =
    await BuildingManager.prototype.prepareTerrain.call(system, discardedTerrain, new AbortController().signal);
  discardedCandidate.discard();
  discardedCandidate = undefined;
  discardedTerrain = undefined;
  expect(system.inputCacheTerrain).toBeUndefined();

  // Populate cache on live `next`, then destroy runtime and verify `inputCacheTerrain` releases it.
  expect(system.input(frame).signature).toBe("sig-256");
  BuildingManager.prototype.onDestroy.call(system);
  system.publishedTerrain = undefined;
  next = undefined;
  expect(system.inputCacheTerrain).toBeUndefined();
  expect(system.inputCache.size).toBe(0);

  await collectRetired();
  expect(nextRef.deref()).toBeUndefined();
  expect(discardedRef.deref()).toBeUndefined();
});
