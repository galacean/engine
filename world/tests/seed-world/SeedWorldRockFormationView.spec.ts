import { afterEach, expect, it, vi } from "vitest";
import type { IslandPlan } from "../../../packages/world-planning/src/semantic-study/IslandPlanModel.ts";
import type { RockFormationJob, RockFormationMesh } from "../../../packages/terrain/src/rock-formation/types.ts";
import type { RockFormationClient } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Client.ts";
import type { PlanningDocument } from "../../../packages/world-planning/src/spatial/PlanningDocument.ts";

const gpu = vi.hoisted(() => {
  Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
  return {
    buffers: [] as any[],
    meshes: [] as any[],
    materials: [] as any[],
    colliders: [] as any[],
    fail: false,
    cookFail: false
  };
});
vi.mock(
  "../../../packages/world-planning/src/integrations/terrain/rock-formation/Collider.ts", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../../packages/world-planning/src/integrations/terrain/rock-formation/Collider.ts")
    >();
  return {
    ...original,
    createRockCollider(_engine: unknown, owner: unknown, formation: RockFormationMesh) {
      if (gpu.cookFail) throw Error("cook failed");
      const collider = {
        owner,
        formation,
        destroyed: false,
        dispose() {
          this.destroyed = true;
        }
      };
      gpu.colliders.push(collider);
      return collider;
    }
  };
});
vi.mock("../../../packages/world-planning/src/integrations/terrain/rock-formation/RockMaterial.ts", async () => {
  const { PBRMaterial } = await import("@galacean/engine");
  return {
    createRockFormationMaterial: vi.fn((engine, textureScale) => {
      const material = new PBRMaterial(engine);
    material.shaderData.setFloat("material_OriginalRockTextureScale", textureScale);
      return material;
    }),
    setRockTextureScale: vi.fn((material, textureScale) =>
    material.shaderData.setFloat("material_OriginalRockTextureScale", textureScale)
  ),
    prepareRockTextures: vi.fn()
  };
});
vi.mock("@galacean/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@galacean/engine")>();
  return {
    ...original,
    Buffer: class {
      destroyed = false;
      constructor(
        _engine: unknown,
        _flag: unknown,
        readonly data: Float32Array
      ) {
        if (gpu.fail) throw Error("upload failed");
        gpu.buffers.push(this);
      }
      destroy() {
        this.destroyed = true;
      }
    },
    BufferMesh: class {
      destroyed = false;
      subMeshes: { start: number; count: number }[] = [];
      bounds = { min: { set() {} }, max: { set() {} } };
      constructor() {
        gpu.meshes.push(this);
      }
      setVertexElements() {}
      setVertexBufferBinding() {}
      addSubMesh(start: number, count: number) {
        this.subMeshes.push({ start, count });
      }
      destroy() {
        this.destroyed = true;
      }
    },
    PBRMaterial: class {
      destroyed = false;
      shaderData = { setFloat: vi.fn(), setVector3: vi.fn() };
      constructor() {
        gpu.materials.push(this);
      }
      destroy() {
        this.destroyed = true;
      }
    },
    MeshRenderer: class {
      private materials: unknown[] = [];
      shaderData = { setVector4: vi.fn(), setFloat: vi.fn(), enableMacro: vi.fn() };
      setMaterial(material: unknown) {
        this.materials = [material];
      }
      setMaterials(materials: unknown[]) {
        this.materials = materials;
      }
      getMaterials() {
        return this.materials;
      }
      destroy() {}
    },
    Shader: { find: () => ({}) },
    ShaderFactory: { includeMap: {}, registerInclude() {} }
  };
});
import { RockFormationView } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/View.ts";
import { PlanningNaturalVegetationRuntime } from "../../../packages/world-planning/src/spatial/runtime/PlanningNaturalVegetationRuntime.ts";
import { readRockFormationSettings } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Settings.ts";
import { ROCK_GENERATION_DEFAULTS } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/GenerationProfile.ts";
import { SeedWorldArrayPickBatch } from "../../../packages/modify/src/rendering/SeedWorldPickBatch.ts";
import { BoundingBox, Matrix, MeshRenderer, PBRMaterial, Vector3 } from "@galacean/engine";

function entity(): any {
  return {
    engine: {},
    children: [] as any[],
    isActive: true,
    destroyed: false,
    transform: { setPosition: vi.fn() },
    get isActiveInHierarchy() {
      return this.isActive && !this.destroyed;
    },
    createChild() {
      const child = entity();
      this.children.push(child);
      return child;
    },
    addComponent(Type: any) {
      return Object.assign(new Type(), { entity: this });
    },
    destroy() {
      this.destroyed = true;
    }
  };
}
const formation = (id: string): RockFormationMesh => ({
  id,
  origin: [0, 0, 0],
  owners: [id + ":obb:a"],
  mesh: {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
  },
  stats: { bodies: 1, vertices: 1, generationMs: 0 }
});
const plan = { rocks: [] } as unknown as IslandPlan;
afterEach(() => {
  gpu.buffers = [];
  gpu.meshes = [];
  gpu.materials = [];
  gpu.colliders = [];
  gpu.fail = false;
  gpu.cookFail = false;
});

it("uploads only the changed formation and keeps published GPU meshes until commit", () => {
  const a = formation("a"),
    b = formation("b"),
    view = new RockFormationView({} as any, entity(), plan, [a, b]);
  const original = [...gpu.buffers],
    next = formation("a");
  const publishedGroups = view.groups;
  expect([...publishedGroups.keys()]).toEqual(["a", "b"]);
  const colliders = [...gpu.colliders];
  const frame = view.prepareFormations(plan, [next, b]);
  expect(view.groups.get("a")).toBe(publishedGroups.get("a"));
  expect(view.groups.get("b")).toBe(publishedGroups.get("b"));
  expect(frame.metrics).toMatchObject({ uploaded: 1, retained: 1 });
  expect(gpu.buffers).toHaveLength(3);
  expect(original.every((buffer) => !buffer.destroyed)).toBe(true);
  expect(colliders.every((collider) => !collider.destroyed)).toBe(true);
  expect(gpu.colliders[2].owner.isActive).toBe(false);
  const published: unknown[] = [];
  view.visitPickBatches((batch) => published.push(batch));
  expect(published).toHaveLength(2);
  frame.commit();
  expect(view.groups.get("a")).not.toBe(publishedGroups.get("a"));
  expect(view.groups.get("b")).toBe(publishedGroups.get("b"));
  expect(original[0].destroyed).toBe(true);
  expect(original[1].destroyed).toBe(false);
  expect(gpu.buffers[2].destroyed).toBe(false);
  expect(colliders[0].destroyed).toBe(true);
  expect(colliders[1].destroyed).toBe(false);
  expect(gpu.colliders[2].owner.isActive).toBe(true);
  view.dispose();
  expect(view.groups.size).toBe(0);
  expect(gpu.buffers.every((buffer) => buffer.destroyed)).toBe(true);
  expect(gpu.colliders.every((collider) => collider.destroyed)).toBe(true);
});

it("discards hidden replacements and preserves visible geometry on failure or supersession", () => {
  const a = formation("a"),
    view = new RockFormationView({} as any, entity(), plan, [a]);
  const staged = view.prepareFormations(plan, [formation("a")]);
  staged.discard();
  staged.discard();
  expect(gpu.buffers[0].destroyed).toBe(false);
  expect(gpu.buffers[1].destroyed).toBe(true);
  expect(gpu.colliders[0].destroyed).toBe(false);
  expect(gpu.colliders[1].destroyed).toBe(true);
  gpu.fail = true;
  expect(() => view.prepareFormations(plan, [formation("a")])).toThrow("upload failed");
  expect(gpu.buffers[0].destroyed).toBe(false);
  const published: unknown[] = [];
  view.visitPickBatches((batch) => published.push(batch));
  expect(published).toHaveLength(1);
  view.dispose();
});

it("keeps the published mesh and collider when replacement collision cooking fails", () => {
  const view = new RockFormationView({} as any, entity(), plan, [formation("a")]);
  gpu.cookFail = true;
  expect(() => view.prepareFormations(plan, [formation("a")])).toThrow("cook failed");
  expect(gpu.buffers.map((b) => b.destroyed)).toEqual([false, true]);
  expect(gpu.colliders[0].destroyed).toBe(false);
  view.dispose();
});

it("shares one material while retaining per-OBB scale and picking through geometry updates", () => {
  const a = formation("a");
  a.textureScale = 12;
  const view = new RockFormationView({} as any, entity(), plan, [a]);
  const originalMaterial = gpu.materials[0];
  const changed = formation("a");
  changed.textureScale = 20;
  changed.mesh.indices = new Uint32Array([0, 1, 2, 2, 1, 0]);
  changed.owners.push("a:obb:b");
  const snapshot = structuredClone(changed);
  const frame = view.prepareFormations(plan, [changed]);
  expect(gpu.materials).toHaveLength(1);
  expect(gpu.meshes[1].subMeshes).toEqual([{ start: 0, count: 6 }]);
  frame.commit();
  view.visitPickBatches((batch) => {
    expect(batch.renderer.getMaterials()).toEqual([originalMaterial]);
    expect(batch.renderer.shaderData.setFloat).toHaveBeenCalledWith("renderer_RockTextureScale", 20);
    expect([batch.resolve(0), batch.resolve(1)]).toEqual(changed.owners);
  });
  expect(gpu.buffers[1].data[8]).toBe(0);
  expect(gpu.buffers[1].data[3 * 10 + 8]).toBe(1);
  const buffers = [...gpu.buffers],
    colliders = [...gpu.colliders];
  view.setTextureScale(0);
  expect(originalMaterial.shaderData.setFloat).toHaveBeenLastCalledWith("material_OriginalRockTextureScale", 0);
  view.setTextureScale(24);
  expect(originalMaterial.shaderData.setFloat).toHaveBeenLastCalledWith("material_OriginalRockTextureScale", 24);
  const colorBlend = { color: [0.1, 0.2, 0.3] as [number, number, number] };
  view.setColorBlend(colorBlend);
  expect(originalMaterial.shaderData.setVector3).toHaveBeenLastCalledWith(
      "material_RockColor",
      new Vector3(...colorBlend.color)
    );
  view.setGrassCoveragePreview(true);
  expect(originalMaterial.shaderData.setFloat).toHaveBeenLastCalledWith("material_RockGrassCoveragePreview", 1);
  expect(gpu.buffers).toEqual(buffers);
  expect(gpu.colliders).toEqual(colliders);
  expect(changed).toEqual(snapshot);
  view.dispose();
  view.dispose();
  expect(
    [...gpu.materials, ...gpu.buffers, ...gpu.meshes, ...gpu.colliders].every((item) => item.destroyed)).toBe(true);
});

it("reanchors landscape rocks with terrain publication while retaining their generated surface and pick identity", () => {
  const rock = { id: "landscape-rock", kind: "rock", baseHeight: 12 };
  const initial = { rocks: [], landscapes: [rock] } as unknown as IslandPlan;
  const surface = { ...formation(rock.id), origin: [7, 12, 9] as [number, number, number], owners: [rock.id] };
  const view = new RockFormationView({} as any, entity(), initial, [surface]);
  const owner = gpu.colliders[0].owner,
    buffer = gpu.buffers[0];
  expect(owner.transform.setPosition).toHaveBeenLastCalledWith(7, 12, 9);
  const frame = view.prepare({ ...initial, landscapes: [{ ...initial.landscapes![0], baseHeight: 8 }] });
  expect(owner.transform.setPosition).toHaveBeenLastCalledWith(7, 12, 9);
  frame.commit();
  expect(owner.transform.setPosition).toHaveBeenLastCalledWith(7, 8, 9);
  expect(gpu.buffers).toEqual([buffer]);
  expect(buffer.destroyed).toBe(false);
  const ids: string[] = [];
  view.visitPickBatches((batch) => {
    for (let i = 0; i < batch.count; i++) ids.push(batch.resolve(i)!);
  });
  expect(ids).toEqual([rock.id]);
  view.dispose();
  expect(buffer.destroyed).toBe(true);
});

it("generates independent resident stones and replaces them atomically without changing placement or picking", async () => {
    const sourceId = "companion-rock",
    resourceRoot = entity();
  const instances = ["stone-a", "stone-b", "stone-c"].map((id) => ({
    id,
    assetId: sourceId,
    position: [23, 4, 18],
    scaleAxes: [1.2, 0.8, 1.1],
    yaw: 35
  }));
  const plants = instances.map((instance) => {
    const renderer = entity().addComponent(MeshRenderer);
    const batch = new SeedWorldArrayPickBatch(renderer);
    batch.id = instance.id;
    batch.count = 1;
    return { root: entity(), instance, pickBatches: [batch] };
  });
    const runtime = Object.assign(Object.create(PlanningNaturalVegetationRuntime.prototype), {
      disposed: false,
      resourceRoot,
      plan: { parameters: { seed: 91 } },
      cells: new Map([["resident", { plants }]]),
      sources: Array.from({ length: 3 }, () => new Map()),
    library: {
      stonePlacements: [{ id: sourceId, bounds: { min: [-2, 0, -1], max: [2, 2, 1] }, cullScreenHeight: 0.01 }]
    }
    });
    const prepareJobs = vi.fn(async (jobs: readonly RockFormationJob[]) =>
      jobs.map((job) => ({ ...formation(job.id), origin: job.origin, owners: [job.guides[0].ownerId] }))
    );
    const client = { prepareJobs } as unknown as RockFormationClient;
    const settings = readRockFormationSettings({ entities: {} } as PlanningDocument),
      signal = new AbortController().signal;
    const profile = { ...ROCK_GENERATION_DEFAULTS, platformShare: 1 };
    (await runtime.prepareRocks(client, settings, signal, profile)).commit();
  const originalMeshes = plants.map((p) => p.pickBatches[0].renderer.mesh),
    originalMaterial = gpu.materials[0];
  expect(new Set(originalMeshes).size).toBe(3);
  expect(new Set(prepareJobs.mock.calls.flatMap(([jobs]) => jobs.map((job) => job.seed))).size).toBe(3);
  expect(prepareJobs.mock.calls.flatMap(([jobs]) => jobs.map((job) => job.guides[0].size))).toEqual(
    instances.map(() => [4, 2, 2])
  );
  expect(runtime.rockSources.specimenCount).toBe(3);
  for (const p of plants) {
    expect(runtime.sourceForPlant(p.instance, 0).rendererBindings[0].renderer.mesh).toBe(
      p.pickBatches[0].renderer.mesh
    );
    expect(p.pickBatches[0].renderer.shaderData.setFloat).toHaveBeenCalledWith("renderer_RockTextureScale", 2.4);
  }
  const originalInstances = structuredClone(instances);
  const calls = prepareJobs.mock.calls.length;
  (await runtime.prepareRocks(
      client,
      { ...settings, textureScale: 24 }, signal, profile)).commit();
  expect(prepareJobs).toHaveBeenCalledTimes(calls);
    expect(originalMaterial.shaderData.setFloat).toHaveBeenCalledWith("material_OriginalRockTextureScale", 24);
  const changed = { ...settings, shape: { ...settings.shape, wallCount: settings.shape.wallCount + 1 } };
    const discarded = await runtime.prepareRocks(client, changed, signal, profile);
    expect(plants.map((p) => p.pickBatches[0].renderer.mesh)).toEqual(originalMeshes);
    discarded.discard();
    discarded.discard();
    expect(gpu.meshes.slice(3).every((mesh) => mesh.destroyed)
    ).toBe(true);
    expect(originalMeshes.every((mesh) => !mesh.destroyed)).toBe(true);

    const replacement = await runtime.prepareRocks(client, changed, signal, profile);
  replacement.commit();
  expect(originalMeshes.every((mesh) => mesh.destroyed)).toBe(true);
  for (const p of plants) {
    expect(p.pickBatches[0].resolve(0)).toBe(p.instance.id);
    expect(p.root.transform.setPosition).not.toHaveBeenCalled();
  }
  expect(instances).toEqual(originalInstances);
  const residentMeshes = plants.map((p) => p.pickBatches[0].renderer.mesh);
  runtime.rockSources.releaseInstances([instances[0]]);
  expect(residentMeshes[0].destroyed).toBe(true);
    expect(residentMeshes.slice(1).every((mesh) => !mesh.destroyed)).toBe(true);
    runtime.rockSources.dispose();
    expect(gpu.meshes.every((mesh) => mesh.destroyed)).toBe(true);
    expect(gpu.buffers.every((buffer) => buffer.destroyed)).toBe(true);
  expect(gpu.materials.every((material) => material.destroyed)).toBe(true);
});
