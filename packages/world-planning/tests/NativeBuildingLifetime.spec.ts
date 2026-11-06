import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { BuildingManager } from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingManager.ts";
import { validatePartCollection } from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingPartCollection.ts";
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
  const system = { visible: true, bounds: [], captureSurfaceQuery: liveQuery };
  const candidate = {
    assertCurrent() {}, commit() {}, finalize() {}, discard() {}, bounds: [], captureSurfaceQuery: () => snapshot
  };
  const world = new NativeBuildingWorld(system as any, candidate as any, acceptWorld, isCurrentWorld);
  world.commitPublication(); world.activate();
  return { world, retiredQuery };
}

it("accepted world reads the live system without retaining its prepared query snapshot", async () => {
  const result = publishWorld();
  await collectRetired();
  expect(result.retiredQuery.deref()).toBeUndefined();
  expect(result.world.captureSurfaceQuery()).toBe("live-query");
  expect(() => result.world.commitPublication()).toThrow("settled");
  result.world.rollbackPublication();
  expect(result.world.enabled).toBe(true);
  await result.world.destroy();
});
