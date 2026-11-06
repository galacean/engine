import { afterEach, expect, it, vi } from "vitest";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import type { RockFormationJob, RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";
import type { RockFormationClient } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Client";
import type { PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";

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
vi.mock("@galacean/engine-world-planning/integrations/terrain/rock-formation/Collider", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@galacean/engine-world-planning/integrations/terrain/rock-formation/Collider")
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
vi.mock("@galacean/engine-world-planning/integrations/terrain/rock-formation/PaintedRockMaterial", () => ({
  registerRockSurfaceIncludes: vi.fn(),
  bindPaintedRockMaterial: vi.fn((_engine, material, textureScale, cellular) => {
    material.textured = true;
    material.painted = cellular;
    material.shaderData.setFloat("material_OriginalRockTextureScale", textureScale);
  }),
  setPaintedRockTextureScale: vi.fn((material, textureScale) =>
    material.shaderData.setFloat("material_OriginalRockTextureScale", textureScale)
  ),
  preparePaintedRockTexture: vi.fn()
}));
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
      shaderData = { setVector4: vi.fn() };
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
    ShaderFactory: { includeMap: { "shared/WorldSelection.glsl": "registered" }, registerInclude() {} }
  };
});
import { RockFormationView } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/View";
import { PlanningNaturalVegetationRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetationRuntime";
import { readRockFormationSettings } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import { ROCK_GENERATION_DEFAULTS } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/GenerationProfile";
import { SeedWorldArrayPickBatch } from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import { BoundingBox, Matrix, MeshRenderer, Vector3 } from "@galacean/engine";

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
  stats: { slabs: 1, deformedVertices: 1, generationMs: 0 }
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

it("shares live texture and color settings across slab and cellular draws without recreating resources", () => {
  const a = formation("a"),
    view = new RockFormationView({} as any, entity(), plan, [a]);
  const originalMaterial = gpu.materials[0];
  view.setTextureScale(24); // Also applies to painted materials created by a later surface change.
  const changed = formation("a");
  changed.painted = {
    coverage: new Float32Array(3).fill(1),
    cavity: new Float32Array(3),
    guideNormals: changed.mesh.normals!,
    faceNormals: new Float32Array([0, 0, 1]),
    neighborNormals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    smoothNormals: new Float32Array(9),
    edgeAltitudes: new Float32Array([1, 2, 1]),
    cells: new Float32Array([72, 0.4]),
    cellScale: 1
  };
  const staged = view.prepareFormations(plan, [changed]);
  expect(gpu.materials).toHaveLength(2);
  view.visitPickBatches((batch) => expect(batch.renderer.getMaterials()[0]).toBe(originalMaterial));
  staged.commit();
  view.visitPickBatches((batch) => expect(batch.renderer.getMaterials()[0]).toBe(gpu.materials[1]));
  const painted = gpu.materials[1],
    buffers = [...gpu.buffers],
    colliders = [...gpu.colliders];
  expect(painted.shaderData.setFloat).toHaveBeenLastCalledWith("material_OriginalRockTextureScale", 24);
  view.setTextureScale(12);
  expect(painted.shaderData.setFloat).toHaveBeenLastCalledWith("material_OriginalRockTextureScale", 12);
  expect(originalMaterial.shaderData.setFloat).toHaveBeenLastCalledWith("material_OriginalRockTextureScale", 12);
  const colorBlend = { color: [0.1, 0.2, 0.3] as [number, number, number] };
  view.setColorBlend(colorBlend);
  for (const material of gpu.materials) {
    expect(material.textured).toBe(true);
    expect(material.shaderData.setVector3).toHaveBeenLastCalledWith(
      "material_RockColor",
      new Vector3(...colorBlend.color)
    );
  }
  expect(gpu.materials).toHaveLength(2);
  expect(gpu.buffers).toEqual(buffers);
  expect(gpu.colliders).toEqual(colliders);
  view.setGrassCoveragePreview(true);
  expect(painted.shaderData.setFloat).toHaveBeenLastCalledWith("material_RockGrassCoveragePreview", 1);
  expect(gpu.buffers).toEqual(buffers);
  expect(gpu.colliders).toEqual(colliders);
  view.visitPickBatches((batch) => expect(batch.renderer.getMaterials()[0]).toBe(painted));
  view.dispose();
  expect(gpu.materials.every((material) => material.destroyed)).toBe(true);
});

it("publishes mixed submeshes with shared picking and canonical collision while owning both materials", () => {
  const original = formation("a"),
    view = new RockFormationView({} as any, entity(), plan, [original]);
  const changed = formation("a");
  changed.mesh.indices = new Uint32Array([0, 1, 2, 2, 1, 0]);
  changed.owners.push("a:obb:b");
  changed.triangleSurfaces = new Uint8Array([1, 0]);
  changed.painted = {
    coverage: new Float32Array(3).fill(1),
    cavity: new Float32Array(3),
    guideNormals: changed.mesh.normals!,
    faceNormals: new Float32Array([0, 1, 0, 0, 0, 1]),
    neighborNormals: new Float32Array(18),
    smoothNormals: new Float32Array(18),
    edgeAltitudes: new Float32Array(6).fill(1),
    cells: new Float32Array([72, 0.5, 73, 0.5]),
    cellScale: 1
  };
  const snapshot = structuredClone(changed),
    staged = view.prepareFormations(plan, [changed]);
  expect(gpu.meshes[1].subMeshes).toEqual([
    { start: 0, count: 3 },
    { start: 3, count: 3 }
  ]);
  expect(gpu.buffers).toHaveLength(2);
  expect(gpu.colliders).toHaveLength(2);
  expect(gpu.colliders[1].formation).toBe(changed);
  expect(gpu.colliders[1].owner.isActive).toBe(false);
  expect(gpu.materials).toHaveLength(2);
  expect(gpu.materials.map((material) => !!material.painted)).toEqual([false, true]);
  expect(gpu.materials.every((material) => material.textured)).toBe(true);
  view.visitPickBatches((batch) => {
    expect(batch.count).toBe(1);
    expect(batch.renderer.getMaterials()).toEqual([gpu.materials[0]]);
  });
  staged.discard();
  expect([gpu.buffers[1], gpu.meshes[1], gpu.colliders[1]].every((resource) => resource.destroyed)).toBe(true);
  expect(gpu.materials.every((material) => !material.destroyed)).toBe(true);
  const replacement = view.prepareFormations(plan, [changed]);
  replacement.commit();
  expect(gpu.materials).toHaveLength(2);
  const batches: SeedWorldArrayPickBatch[] = [];
  view.visitPickBatches((batch) => batches.push(batch as SeedWorldArrayPickBatch));
  expect(batches).toHaveLength(1);
  expect(batches[0].renderer.getMaterials()).toEqual(gpu.materials);
  expect([batches[0].resolve(0), batches[0].resolve(1)]).toEqual(changed.owners);
  // The plain range is first in the draw stream, but retains canonical owner index 1.
  expect(gpu.buffers[2].data[8]).toBe(1);
  expect(gpu.buffers[2].data[3 * 31 + 8]).toBe(0);
  expect(gpu.colliders[2].formation).toBe(changed);
  expect(gpu.colliders[2].owner.isActive).toBe(true);
  expect(changed).toEqual(snapshot);
  view.dispose();
  view.dispose();
  expect(
    [...gpu.materials, ...gpu.meshes, ...gpu.buffers, ...gpu.colliders].every((resource) => resource.destroyed)
  ).toBe(true);
});

it("keeps scattered small stones white when the cliff using the same surface mode is recolored", () => {
  const cliff = formation("first"),
    stone = formation("second");
  const plan = { rocks: [], landscapes: [{ id: stone.id, kind: "rock", baseHeight: 0 }] } as unknown as IslandPlan;
  const view = new RockFormationView({} as any, entity(), plan, [cliff, stone]);
  const materials = new Map<string, any>();
  view.visitPickBatches((batch) => materials.set(batch.resolve(0)!, batch.renderer.getMaterials()[0]));
  view.setColorBlend({ color: [0.1, 0.2, 0.3] });
  expect(materials.get(cliff.owners[0]).shaderData.setVector3).toHaveBeenLastCalledWith(
    "material_RockColor",
    new Vector3(0.1, 0.2, 0.3)
  );
  expect(materials.get(stone.owners[0]).shaderData.setVector3).toHaveBeenLastCalledWith(
    "material_RockColor",
    new Vector3(1, 1, 1)
  );
  view.dispose();
  expect(gpu.materials.every((material) => material.destroyed)).toBe(true);
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

it.each(["vertex-slabs", "cellular-curvature"] as const)(
  "publishes %s companion rocks atomically across resident LODs without replanting or changing picking",
  async (surfaceMode) => {
    const sourceId = "companion-rock",
      part = {
        localMatrix: new Matrix(),
        mesh: { bounds: new BoundingBox(new Vector3(-2, 0, -1), new Vector3(2, 2, 1)) }
      };
    const resourceRoot = entity(),
      unrelated = { entry: { id: "flower" } };
    const runtime = Object.assign(Object.create(PlanningNaturalVegetationRuntime.prototype), {
      disposed: false,
      resourceRoot,
      plan: { parameters: { seed: 91 } },
      cells: new Map(),
      sources: Array.from({ length: 3 }, () => new Map([["flower", unrelated]])),
      library: {
        stoneFamily: {
          variants: [
            {
              id: sourceId,
              lodGroup: { screenRelativeTransitionHeights: [0.1, 0.01] },
              lods: [{ renderers: [part] }, { renderers: [part] }]
            }
          ]
        }
      }
    });
    const prepareJobs = vi.fn(async (jobs: readonly RockFormationJob[]) =>
      jobs.map((job) => ({ ...formation(job.id), origin: job.origin, owners: [job.guides[0].ownerId] }))
    );
    const client = { prepareJobs } as unknown as RockFormationClient;
    const settings = { ...readRockFormationSettings({ entities: {} } as PlanningDocument), surfaceMode },
      signal = new AbortController().signal;
    const profile = { ...ROCK_GENERATION_DEFAULTS, platformShare: 1 };
    (await runtime.prepareRocks(client, settings, signal, profile)).commit();
    expect(prepareJobs.mock.calls[0][0].map((job) => job.guides[0])).toMatchObject([
      { size: [4, 2, 2], heightMode: "random-ascent", slopeMode: "manual", slopeRate: 12, heightVariation: 0 },
      { size: [4, 2, 2], heightMode: "perlin-ascent", slopeMode: "auto", heightVariation: 0 }
    ]);
    const originalMesh = gpu.meshes[0],
      originalMaterial = gpu.materials[0],
      originalBuffer = gpu.buffers[0];
    expect(originalMaterial.textured).toBe(true);
    expect(originalMaterial.painted).toBe(surfaceMode === "cellular-curvature");
    const instanceRoot = entity(),
      instance = {
        id: "tree-a:companion-rock",
        assetId: sourceId,
        position: [23, 4, 18],
        scaleAxes: [1.2, 0.8, 1.1],
        yaw: 35
      };
    Object.assign(instanceRoot.transform, {
      position: [...instance.position],
      rotation: [0, instance.yaw, 0],
      scale: [...instance.scaleAxes],
      setRotation: vi.fn(),
      setScale: vi.fn()
    });
    const pickBatches = Array.from({ length: 3 }, (_, level) => {
      const renderer = entity().addComponent(MeshRenderer);
      const original = runtime.sources[level].get(sourceId).rendererBindings[0].renderer;
      renderer.mesh = original.mesh;
      renderer.setMaterials([...original.getMaterials()]);
      const batch = new SeedWorldArrayPickBatch(renderer);
      batch.id = instance.id;
      batch.count = 1;
      return batch;
    });
    const untouchedRenderer = entity().addComponent(MeshRenderer),
      untouchedMesh = {},
      untouchedMaterial = {};
    untouchedRenderer.mesh = untouchedMesh;
    untouchedRenderer.setMaterials([untouchedMaterial]);
    runtime.cells.set("resident", {
      plants: [
        { root: instanceRoot, instance, pickBatches },
        { instance: { assetId: "flower" }, pickBatches: [new SeedWorldArrayPickBatch(untouchedRenderer)] }
      ]
    });
    const originalInstance = structuredClone(instance),
      originalSources = runtime.sources;
    const colorBlend = structuredClone(settings.colorBlend);
    colorBlend.color = [0.1, 0.2, 0.3];
    const materialFrame = await runtime.prepareRocks(
      client,
      { ...settings, textureScale: 24, colorBlend },
      signal,
      profile
    );
    expect(originalMaterial.shaderData.setFloat).toHaveBeenLastCalledWith("material_OriginalRockTextureScale", 60);
    materialFrame.commit();
    expect(originalMaterial.shaderData.setFloat).toHaveBeenCalledWith("material_OriginalRockTextureScale", 24);
    expect(originalMaterial.shaderData.setVector3).toHaveBeenLastCalledWith("material_RockColor", new Vector3(1, 1, 1));
    runtime.setRockTextureScale(12);
    expect(originalMaterial.shaderData.setFloat).toHaveBeenLastCalledWith("material_OriginalRockTextureScale", 12);
    expect(prepareJobs).toHaveBeenCalledOnce();
    expect(gpu.meshes).toHaveLength(2);
    expect(runtime.sources).toBe(originalSources);
    expect(
      pickBatches.every(
        (batch) => batch.renderer.mesh === originalMesh && batch.renderer.getMaterials()[0] === originalMaterial
      )
    ).toBe(true);
    // Reweighting is per instance and reuses the two resident prototypes, even at LOD changes.
    const allPeaks = { ...profile, platformShare: 0 };
    const rejectedShare = await runtime.prepareRocks(client, settings, signal, allPeaks);
    rejectedShare.discard();
    expect(runtime.sourceForPlant(instance, 0).rendererBindings[0].renderer.mesh).toBe(originalMesh);
    const shareFrame = await runtime.prepareRocks(client, settings, signal, allPeaks);
    expect(pickBatches.every((batch) => batch.renderer.mesh === originalMesh)).toBe(true);
    shareFrame.commit();
    expect(pickBatches.every((batch) => batch.renderer.mesh === gpu.meshes[1])).toBe(true);
    expect(
      [0, 1, 2].every(
        (level) => runtime.sourceForPlant(instance, level).rendererBindings[0].renderer.mesh === gpu.meshes[1]
      )
    ).toBe(true);
    expect(prepareJobs).toHaveBeenCalledOnce();
    expect(gpu.meshes).toHaveLength(2);
    (
      await runtime.prepareRocks(client, settings, signal, { ...ROCK_GENERATION_DEFAULTS, platformShare: 0.85 })
    ).commit();
    const instances = Array.from({ length: 1024 }, (_, i) => ({ ...instance, id: `scenic-rock-${i}` }));
    const selected = new Map(
      instances.map((plant) => [plant.id, runtime.sourceForPlant(plant, 0).rendererBindings[0].renderer.mesh])
    );
    const platforms = [...selected.values()].filter((mesh) => mesh === originalMesh).length;
    expect(platforms).toBeGreaterThan(1024 * 0.81);
    expect(platforms).toBeLessThan(1024 * 0.89);
    for (const plant of instances.reverse().slice(7))
      expect(
        runtime.sourceForPlant({ ...plant, position: [99, 2, 30], scale: 4 }, 2).rendererBindings[0].renderer.mesh
      ).toBe(selected.get(plant.id));
    expect(new Set(selected.values()).size).toBe(2);
    expect(gpu.meshes).toHaveLength(2);
    (await runtime.prepareRocks(client, settings, signal, profile)).commit();
    const changed = { ...settings, slabs: { ...settings.slabs, seed: settings.slabs.seed + 1 } };
    const discarded = await runtime.prepareRocks(client, changed, signal, profile);
    expect(runtime.sources).toBe(originalSources);
    expect(
      pickBatches.every(
        (batch) => batch.renderer.mesh === originalMesh && batch.renderer.getMaterials()[0] === originalMaterial
      )
    ).toBe(true);
    expect([originalMesh, originalMaterial, originalBuffer].every((resource) => !resource.destroyed)).toBe(true);
    expect(resourceRoot.children[1].isActive).toBe(false);
    discarded.discard();
    discarded.discard();
    expect(
      [...gpu.meshes.slice(2), gpu.materials[1], ...gpu.buffers.slice(2)].every((resource) => resource.destroyed)
    ).toBe(true);
    expect([originalMesh, originalMaterial, originalBuffer].every((resource) => !resource.destroyed)).toBe(true);

    const staged = await runtime.prepareRocks(client, changed, signal, profile);
    const replacementMesh = gpu.meshes[4],
      replacementMaterial = gpu.materials[2];
    expect(pickBatches.every((batch) => batch.renderer.mesh === originalMesh)).toBe(true);
    staged.commit();
    expect(
      pickBatches.every(
        (batch) =>
          batch.renderer.mesh === replacementMesh &&
          batch.renderer.getMaterials()[0] === replacementMaterial &&
          batch.resolve(0) === instance.id
      )
    ).toBe(true);
    expect(
      runtime.sources.every(
        (sources: Map<string, any>) =>
          sources.get("flower") === unrelated &&
          sources.get(sourceId).rendererBindings[0].renderer.mesh === replacementMesh
      )
    ).toBe(true);
    expect([originalMesh, originalMaterial, originalBuffer].every((resource) => resource.destroyed)).toBe(true);
    expect(untouchedRenderer.mesh).toBe(untouchedMesh);
    expect(untouchedRenderer.getMaterials()).toEqual([untouchedMaterial]);
    expect(instance).toEqual(originalInstance);
    expect(instanceRoot.transform.position).toEqual(instance.position);
    expect(instanceRoot.transform.rotation).toEqual([0, instance.yaw, 0]);
    expect(instanceRoot.transform.scale).toEqual(instance.scaleAxes);
    expect(instanceRoot.transform.setPosition).not.toHaveBeenCalled();
    expect(instanceRoot.transform.setRotation).not.toHaveBeenCalled();
    expect(instanceRoot.transform.setScale).not.toHaveBeenCalled();
    expect(runtime.cells.get("resident").plants[0].pickBatches).toBe(pickBatches);
    const calls = prepareJobs.mock.calls.length;
    const rebind = vi.spyOn(pickBatches[0].renderer, "setMaterials");
    (await runtime.prepareRocks(client, structuredClone(changed), signal, profile)).commit();
    expect(prepareJobs).toHaveBeenCalledTimes(calls);
    expect(rebind).not.toHaveBeenCalled();
    expect(gpu.meshes).toHaveLength(6);
    const reshaped = { ...profile, platformHeightScale: 0.5, platformSlopeRate: 4, platformHeightVariation: 0 };
    const profileFrame = await runtime.prepareRocks(client, changed, signal, reshaped);
    expect(prepareJobs.mock.calls.at(-1)![0][0].guides[0]).toMatchObject({
      size: [4, 1, 2],
      slopeMode: "manual",
      slopeRate: 4,
      heightVariation: 0
    });
    expect(pickBatches.every((batch) => batch.renderer.mesh === replacementMesh)).toBe(true);
    profileFrame.commit();
    expect(pickBatches.every((batch) => batch.renderer.mesh === gpu.meshes[6])).toBe(true);
    expect(runtime.sourceForPlant(instance, 2).rendererBindings[0].renderer.mesh).toBe(gpu.meshes[6]);
    expect(instance).toEqual(originalInstance);
    runtime.rockSources.dispose();
    expect(gpu.meshes.every((mesh) => mesh.destroyed)).toBe(true);
    expect(gpu.materials.every((material) => material.destroyed)).toBe(true);
    expect(gpu.buffers.every((buffer) => buffer.destroyed)).toBe(true);
  }
);
