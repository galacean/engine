import { describe, expect, it, vi } from "vitest";
import { createSeedPlanningInputs } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { readAnimalPopulationConfig, SEED_ANIMAL_TYPES, SEED_ANIMAL_SPECIES } from "@galacean/engine-world-planning/spatial/AnimalPopulationComponent";
import { AnimalAssetLibrary } from "@galacean/engine-animals/gameplay/animal/AnimalAssetLibrary";
import { PlanningAnimalProjectAuthoring } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalAuthoring.ts";
import { RUNTIME_PROJECT_SAVE_VERSION } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { PlanningAnimalRuntime } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalRuntime.ts";
import { seedAnimalCatalog, seedAnimalRegistrations } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalContent.ts";

function document(values: Record<string, unknown>) {
  const result = createSeedPlanningInputs(110513);
  result.entities.world.components.animals = { values };
  return result;
}

function project(initial = { project: { files: [] as {virtualPath: string; type: string; path: string}[] }, contents: {} as Record<string, string> }) {
  const state = {
    projectPackage: structuredClone(initial),
    durable: JSON.stringify(initial),
    ownRuntimeAsset(file: typeof initial.project.files[number], retention: string) {
      expect(retention).toBe("project");
      return {
        async update(change: (content: string | undefined) => {content: string; value: unknown}) {
          const result = change(state.projectPackage.contents[file.virtualPath]);
          if (!state.projectPackage.project.files.some(entry => entry.virtualPath === file.virtualPath)) state.projectPackage.project.files.push(file);
          state.projectPackage.contents[file.virtualPath] = result.content;
          return result.value;
        }, dispose() {}
      };
    },
    async flush() { state.durable = JSON.stringify(state.projectPackage); }
  };
  return state;
}

function runtime(store: PlanningAnimalProjectAuthoring) {
  const config = readAnimalPopulationConfig(document({ "species.min": 0, "species.max": 0, "birdCount.min": 0, "birdCount.max": 0 }));
  const host: any = Object.create(PlanningAnimalRuntime.prototype);
  Object.assign(host, {
    spawnTail: Promise.resolve(), enabled: true, disposed: false,
    interactions: { authoring: store }, observer: () => ({ x: 50, z: 50 }),
    library: new AnimalAssetLibrary({} as any, seedAnimalCatalog, seedAnimalRegistrations, "https://example.test/animals/"),
    population: {
      plan: { parameters: { seed: 110513 } }, config, spawns: new Map(), actors: [],
      layout: { animals: [], requestedCount: 0, diagnostics: [] },
      habitat: { samplePosition: (point: { x: number; z: number }) => ({ ...point, y: 7 }), spawnCandidate: (point: unknown) => point }
    },
    // Renderer creation is separate from birth admission and persisted identity.
    addActor(p: any, birth: any, scale?: number) {
      const asset = this.library.resolve(birth);
      const actor = { birth, asset, scale: scale ?? asset.config.scale, x: birth.position.x, z: birth.position.z, footprint: { radius: 0.5 } };
      p.actors.push(actor);
      return actor;
    },
    admit: vi.fn()
  });
  return host;
}

describe("animal initialization ranges", () => {
  it("allows no birds while retaining terrestrial population and unchanged defaults", () => {
    const config = readAnimalPopulationConfig(document({ "birdCount.min": 0, "birdCount.max": 0 }));
    const birds = new Set(SEED_ANIMAL_TYPES.filter(type => type.canFly).map(type => type.typeId));
    expect(config.types.filter(type => birds.has(type.typeId)).every(type => type.max === 0)).toBe(true);
    expect(config.types.filter(type => !birds.has(type.typeId)).some(type => type.max > 0)).toBe(true);
    expect(readAnimalPopulationConfig(document({})).types.filter(type => birds.has(type.typeId)).reduce((sum, type) => sum + type.max, 0)).toBeGreaterThanOrEqual(10);
  });

  it("accepts zero-to-positive ranges and resolves insufficient candidates without rejection", () => {
    const values: Record<string, number> = { "species.min": 0, "species.max": 100, "birdCount.min": 0, "birdCount.max": 3, minimumEatingAnimals: 100 };
    for (const species of SEED_ANIMAL_SPECIES.filter(species => !species.canFly)) {
      values[`species.${species.speciesId}.min`] = 0;
      values[`species.${species.speciesId}.max`] = 1;
    }
    const config = readAnimalPopulationConfig(document(values));
    expect(config.types.every(type => Number.isSafeInteger(type.max) && type.max >= 0)).toBe(true);
  });

  it("can initialize an empty enabled world despite the default eating preference", () => {
    const values: Record<string, number> = { "birdCount.min": 0, "birdCount.max": 0 };
    for (const species of SEED_ANIMAL_SPECIES.filter(species => !species.canFly)) {
      values[`species.${species.speciesId}.min`] = values[`species.${species.speciesId}.max`] = 0;
    }
    const config = readAnimalPopulationConfig(document(values));
    expect(config.enabled).toBe(true);
    expect(config.types.every(type => type.max === 0)).toBe(true);
  });
});

describe("persistent explicit animal additions", () => {
  it("saves and restores identity and pose through the project envelope without applying initialization counts", async () => {
    const state = project(), store = new PlanningAnimalProjectAuthoring(state as any), host = runtime(store);
    const typeId = SEED_ANIMAL_TYPES.find(type => !type.canFly)!.typeId;
    const request = { requestId: "one-author-animal", typeId, position: { x: 30, z: 40 } };
    const receipt = await host.spawn(request);
    expect(receipt.status).toBe("accepted");
    expect(host.population.actors).toHaveLength(1);
    expect(host.population.config.types.every((type: any) => type.max === 0)).toBe(true);
    const restoredProject = project(JSON.parse(state.durable));
    const restoredStore = new PlanningAnimalProjectAuthoring(restoredProject as any), restored = runtime(restoredStore);
    restored.restoreAdditions(restored.population);
    restored.restoreAdditions(restored.population);
    expect(restored.population.actors).toHaveLength(1);
    expect(restored.population.actors[0].birth).toEqual(host.population.actors[0].birth);
    expect(restored.population.actors[0].scale).toBe(host.population.actors[0].scale);
    expect(restoredStore.read(110513)[0].instance.position).toEqual([30, 7, 40]);
    expect(restoredStore.read(110514)).toEqual([]);
    expect(await restored.spawn(request)).toEqual(receipt);
    expect(restored.population.actors).toHaveLength(1);
    expect((await restored.spawn({ ...request, position: { x: 90, z: 90 } })).reason).toBe("request_id_conflict");
  });

  it("does not publish an animal or retain its author record when the database checkpoint fails", async () => {
    const state = project();
    state.flush = vi.fn().mockRejectedValueOnce(new Error("DB unavailable")).mockImplementation(async () => { state.durable = JSON.stringify(state.projectPackage); });
    const store = new PlanningAnimalProjectAuthoring(state as any), host = runtime(store);
    const request = { requestId: "retry-after-failure", typeId: SEED_ANIMAL_TYPES.find(type => !type.canFly)!.typeId, position: { x: 30, z: 40 } };
    expect((await host.spawn(request)).reason).toBe("persistence_failed");
    expect(host.population.actors).toHaveLength(0);
    expect(store.read(110513)).toEqual([]);
    expect((await host.spawn(request)).status).toBe("accepted");
    expect(host.population.actors).toHaveLength(1);
  });


  it("hides additions while the checkpoint is pending, including after a same-seed population rebuild", async () => {
    const state = project(), store = new PlanningAnimalProjectAuthoring(state as any), host = runtime(store);
    let fail!: (reason: Error) => void;
    const pending = new Promise<void>((_, reject) => { fail = reject; });
    state.flush = vi.fn().mockReturnValueOnce(pending).mockImplementation(async () => { state.durable = JSON.stringify(state.projectPackage); });
    const request = { requestId: "pending-failure", typeId: SEED_ANIMAL_TYPES.find(type => !type.canFly)!.typeId, position: { x: 30, z: 40 } };
    const result = host.spawn(request);
    await vi.waitFor(() => expect(state.flush).toHaveBeenCalledTimes(1));
    expect(store.read(110513)).toEqual([]);
    host.population = runtime(store).population;
    host.restoreAdditions(host.population);
    expect(host.population.actors).toHaveLength(0);
    fail(new Error("checkpoint failed"));
    expect((await result).reason).toBe("persistence_failed");
    host.restoreAdditions(host.population);
    expect(host.population.actors).toHaveLength(0);
    expect(store.read(110513)).toEqual([]);
  });

  it("restores a successful pending addition into the current same-seed population", async () => {
    const state = project(), store = new PlanningAnimalProjectAuthoring(state as any), host = runtime(store);
    let complete!: () => void;
    state.flush = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
    const result = host.spawn({ requestId: "pending-success", typeId: SEED_ANIMAL_TYPES.find(type => !type.canFly)!.typeId, position: { x: 30, z: 40 } });
    await vi.waitFor(() => expect(state.flush).toHaveBeenCalledTimes(1));
    host.population = runtime(store).population;
    complete();
    expect((await result).status).toBe("accepted");
    expect(host.population.actors).toHaveLength(1);
  });

  it("does not redirect queued requests into another seed", async () => {
    const state = project(), store = new PlanningAnimalProjectAuthoring(state as any), host = runtime(store);
    let complete!: () => void;
    state.flush = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
    const input = { requestId: "seed-one", typeId: SEED_ANIMAL_TYPES.find(type => !type.canFly)!.typeId, position: { x: 30, z: 40 } };
    const first = host.spawn(input), queued = host.spawn({ ...input, requestId: "queued" });
    await vi.waitFor(() => expect(state.flush).toHaveBeenCalledTimes(1));
    host.population = runtime(store).population;
    host.population.plan.parameters.seed = 110514;
    complete();
    expect((await first).status).toBe("accepted");
    expect((await queued).reason).toBe("world_changed");
    expect(host.population.actors).toHaveLength(0);
    expect(store.read(110513)).toHaveLength(1);
    expect(store.read(110514)).toHaveLength(0);
  });

  it("uses real runtime-owned publication without creating history or losing state to a stale editor package", async () => {
    const scene = JSON.stringify({ version: "2.0", refs: [], entities: [], components: [], scene: { name: "Animal test", rootEntities: [] } });
    const pack = { version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: "Main.scene", files: [{ virtualPath: "Main.scene", type: "Scene", path: "runtime:scene", dependencies: [] }] }, contents: { "Main.scene": scene } };
    let checkpoint: unknown;
    const storage = { save: vi.fn(async (_id: string, saved: unknown) => { checkpoint = JSON.parse(JSON.stringify(saved)); }), close() {} };
    const session: RuntimeProjectSession = new (RuntimeProjectSession as any)("animal-test", structuredClone(pack), storage);
    const stale = structuredClone(pack), store = new PlanningAnimalProjectAuthoring(session), host = runtime(store);
    let storageError: unknown;
    const save = store.save.bind(store);
    store.save = async (...args) => { try { await save(...args); } catch (error) { storageError = error; throw error; } };
    try {
      const result = await host.spawn({ requestId: "history-free", typeId: SEED_ANIMAL_TYPES.find(type => !type.canFly)!.typeId, position: { x: 30, z: 40 } });
      expect(result.status, String(storageError)).toBe("accepted");
      expect(storage.save).toHaveBeenCalled();
      expect(session.history.query().undo).toHaveLength(0);
      const cold: RuntimeProjectSession = new (RuntimeProjectSession as any)("animal-cold", checkpoint, storage);
      const coldStore = new PlanningAnimalProjectAuthoring(cold), coldRuntime = runtime(coldStore);
      try {
        coldRuntime.restoreAdditions(coldRuntime.population);
        expect(coldRuntime.population.actors.map((actor: any) => actor.birth.id)).toEqual([result.id]);
        expect(cold.history.query().undo).toHaveLength(0);
      } finally { coldStore.dispose(); cold.dispose(); }
      await session.update(() => stale as any);
      expect(store.read(110513)).toHaveLength(1);
      expect(session.history.query().undo.every(entry => entry.paths.every(path => !path.startsWith("World/Animals/")))).toBe(true);
    } finally { store.dispose(); session.dispose(); }
  });

  it("serializes simultaneous idempotent requests without duplicate identities", async () => {
    const state = project(), store = new PlanningAnimalProjectAuthoring(state as any), host = runtime(store);
    const request = { requestId: "simultaneous", typeId: SEED_ANIMAL_TYPES.find(type => !type.canFly)!.typeId, position: { x: 30, z: 40 } };
    const [first, second] = await Promise.all([host.spawn(request), host.spawn(request)]);
    expect(first.status).toBe("accepted");
    expect(second).toEqual(first);
    expect(store.read(110513)).toHaveLength(1);
    expect(host.population.actors).toHaveLength(1);
  });
});
