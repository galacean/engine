import { expect, it, vi } from "vitest";
import { Engine, Entity, MeshRenderer, PBRMaterial, ResourceManager, Vector3 } from "@galacean/engine";
import { PlanningNaturalVegetationRuntime } from "../../../packages/world-planning/src/spatial/runtime/PlanningNaturalVegetationRuntime.ts";
import { SeedWorldArrayPickBatch } from "../../../packages/modify/src/rendering/SeedWorldPickBatch.ts";
import { readRockFormationSettings } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Settings.ts";
import { ROCK_GENERATION_DEFAULTS } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/GenerationProfile.ts";
import type { RockFormationJob } from "../../../packages/terrain/src/rock-formation/types.ts";

// Only texture loading and the GPU backend are substituted. Entity destruction,
// reference counts, resource registration and frame-end disposal use the real engine.
vi.mock(
  "../../../packages/world-planning/src/integrations/terrain/rock-formation/RockMaterial.ts",
  async (original) => ({
    ...(await original<
      typeof import("../../../packages/world-planning/src/integrations/terrain/rock-formation/RockMaterial.ts")
    >()),
    prepareRockTextures: async () => {},
    createRockFormationMaterial: (engine: Engine) => new PBRMaterial(engine)
  })
);

function engineWithoutGPU(): Engine {
  const engine = Object.assign(Object.create(Engine.prototype), {
    _frameInProcess: false,
    _processingPendingDestroys: false,
    _pendingDestroyObjects: [],
    _renderingStatistics: { _bufferMemory: 0 },
    _hardwareRenderer: {
      createPlatformPrimitive: () => ({ destroy() {} }),
      createPlatformBuffer: () => ({ destroy() {} })
    }
  });
  engine._resourceManager = new ResourceManager(engine);
  return engine;
}

async function fixture() {
  const engine = engineWithoutGPU(),
    resourceRoot = new Entity(engine),
    root = new Entity(engine);
  const instance = { id: "streamed-stone", assetId: "stone", position: [0, 0, 0], scale: 1, yaw: 0 };
  const renderer = root.addComponent(MeshRenderer),
    batch = new SeedWorldArrayPickBatch(renderer);
  batch.id = instance.id;
  batch.count = 1;
  const runtime = Object.assign(Object.create(PlanningNaturalVegetationRuntime.prototype), {
    disposed: false,
    resourceRoot,
    plan: { parameters: { seed: 1, width: 1024, depth: 1024 } },
    time: 0,
    trees: [],
    camera: { entity: { transform: { worldPosition: new Vector3(300, 0, 300) } } },
    detailTask: Promise.resolve(), // An in-flight load must not prevent eviction of the previous cell.
    cells: new Map([["0/0", { root, plants: [{ root, instance, pickBatches: [batch] }] }]]),
    sources: [new Map()],
    library: {
      stonePlacements: [{ id: "stone", bounds: { min: [-1, 0, -1], max: [1, 1, 1] }, cullScreenHeight: 0.01 }]
    }
  });
  const client = {
    prepareJobs: async (jobs: readonly RockFormationJob[]) =>
      jobs.map((job) => ({
        id: job.id,
        origin: job.origin,
        owners: [job.guides[0].ownerId],
        mesh: {
          positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
          indices: new Uint32Array([0, 1, 2]),
          normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
        },
        stats: { bodies: 1, vertices: 3, generationMs: 0 }
      }))
  };
  const settings = readRockFormationSettings({ entities: {} } as any);
  (await runtime.prepareRocks(client, settings, new AbortController().signal, ROCK_GENERATION_DEFAULTS)).commit();
  return { engine: engine as any, runtime, root, instance, renderer };
}

it.each([false, true])("releases streamed companion GPU resources with in-frame destruction=%s", async (inFrame) => {
  const { engine, runtime, renderer } = await fixture();
  const mesh = renderer.mesh!,
    primitive = mesh._primitive,
    buffer = primitive.vertexBufferBindings[0].buffer;
  const material = renderer.getMaterial()!;
  expect(mesh.refCount).toBe(2); // Source specimen and its visible instance.
  engine._frameInProcess = inFrame;
  runtime.update(0); // The real camera-distance eviction path destroys the cell and its specimens.
  expect(runtime.cells.size).toBe(0);
  expect(runtime.rockSources.specimenCount).toBe(0);
  engine._frameInProcess = false;
  engine._processPendingDestroyObjects();
  expect(mesh.destroyed).toBe(true);
  expect(primitive.destroyed).toBe(true);
  expect(buffer.destroyed).toBe(true);
  for (const resource of [mesh, primitive, buffer]) {
    expect(engine.resourceManager._referResourcePool[resource.instanceId]).toBeUndefined();
    expect(engine.resourceManager._graphicResourcePool[resource.instanceId]).toBeUndefined();
  }
  expect(material.destroyed).toBe(false);
  runtime.rockSources.dispose();
  resourceCleanup(engine);
});

it("keeps a neighbouring specimen alive and does not accumulate resources when a cell returns", async () => {
  const { engine, runtime, instance, renderer } = await fixture();
  const neighbour = { ...instance, id: "resident-neighbour" };
  await runtime.rockSources.prepareInstances([neighbour]);
  const retained = runtime.sourceForPlant(neighbour, 0).rendererBindings[0].renderer;
  const retainedMesh = retained.mesh;
  const material = renderer.getMaterial();
  const residentResourceCount = Object.keys(engine.resourceManager._referResourcePool).length - 3;
  for (let cycle = 0; cycle < 4; cycle++) {
    if (cycle) {
      await runtime.rockSources.prepareInstances([instance]);
      const source = runtime.sourceForPlant(instance, 0).rendererBindings[0].renderer;
      const root = new Entity(engine),
        next = root.addComponent(MeshRenderer);
      next.mesh = source.mesh;
      next.setMaterial(source.getMaterial());
      const pick = new SeedWorldArrayPickBatch(next);
      pick.id = instance.id;
      pick.count = 1;
      expect(pick.resolve(0)).toBe(instance.id);
      runtime.cells.set("0/0", { root, plants: [{ root, instance, pickBatches: [pick] }] });
    }
    engine._frameInProcess = true;
    runtime.update(0);
    engine._frameInProcess = false;
    engine._processPendingDestroyObjects();
    expect(Object.keys(engine.resourceManager._referResourcePool)).toHaveLength(residentResourceCount);
    expect(retained.mesh).toBe(retainedMesh);
    expect(retainedMesh.destroyed).toBe(false);
    expect(retainedMesh.refCount).toBe(1);
    expect(retained.getMaterial()).toBe(material);
    expect(material!.destroyed).toBe(false);
  }
  runtime.rockSources.dispose();
  resourceCleanup(engine);
});

function resourceCleanup(engine: any): void {
  for (const resource of Object.values(engine.resourceManager._referResourcePool) as any[]) resource.destroy(true);
}
