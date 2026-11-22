import { expect, it, vi } from "vitest";
import type { JSONAsset } from "@galacean/engine-core";
import {
  RUNTIME_PROJECT_SAVE_VERSION,
  RuntimeProjectStorage,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { FarmingService } from "@galacean/engine-farming/farming/application/FarmingService";
import { ManualFarmClock, type FarmClock } from "@galacean/engine-farming/farming/application/FarmClock";
import { FarmingWorldPresentation } from "@galacean/engine-farming/farming/presentation/FarmingWorldPresentation";
import { FarmingTargetHint } from "@galacean/engine-farming/farming/presentation/FarmingTargetHint";
import { planeSurfaceTriangles } from "@galacean/engine-farming/farming/geometry/SurfaceTriangles";
import type { FarmingGroundProvider } from "@galacean/engine-farming/farming/domain/FarmingGround";
import { Camera, MeshRenderer } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { HeadlessEngine } from "../../../packages/rhi-null/src/HeadlessEngine";
import { PlanningFarmClock } from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmClock";
import {
  PlanningFarmWaterSupply,
  subscribePlanningFarmWaterLayout
} from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmWaterSupply";
import type { PlotState } from "@galacean/engine-farming/farming/domain/FarmState";
import type { WaterSpatialFieldSnapshot } from "@galacean/engine-water/water/runtime/index";
import { TEST_FARMING_DEFINITIONS, TEST_GROUND_PROVIDER } from "../../../packages/farming/tests/fixtures/fixtures";
import {
  PlanningFarmRepository,
  PLANNING_FARMING_PROJECT_PATH as path,
  PLANNING_FARMING_PROJECT_TYPE
} from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmRepository";

async function fixture(pageClock = false, groundProvider = TEST_GROUND_PROVIDER, directRepository = false) {
  const file = { virtualPath: path, path, type: PLANNING_FARMING_PROJECT_TYPE, dependencies: [] };
  const scene = "World/Main.scene";
  let saved: RuntimeProjectPackage = {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: { scene, files: [{ virtualPath: scene, path: scene, type: "Scene", dependencies: [] }, file] },
    contents: { [scene]: "{}", [path]: '{"version":1,"farms":{}}' }
  };
  const storage = {
    load: async () => structuredClone(saved),
    save: vi.fn(async (_id: string, pack: RuntimeProjectPackage) => {
      saved = structuredClone(pack);
    }),
    close() {}
  };
  vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const open = async () => {
    const session = await RuntimeProjectSession.open("farming", saved.project, "https://example.com");
    session.registerAssetFormats(new Map([[file.type, { validate() {}, referenceTypes: [], references: () => [] }]]));
    return session;
  };

  vi.useFakeTimers({ toFake: ["clearInterval", "setInterval"] });
  vi.stubGlobal("window", { setInterval, clearInterval });
  const resource = { data: null, destroyed: false } as unknown as JSONAsset;
  let project = await open();
  let repository = new PlanningFarmRepository(project, undefined, path, () => resource);
  const time = new ManualFarmClock();
  let clock: FarmClock = pageClock ? new PlanningFarmClock(0, () => time.nowMs()) : time;
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("document", document);
  let rain = 0;
  const definitions = {
    ...TEST_FARMING_DEFINITIONS,
    soilProfile: { ...TEST_FARMING_DEFINITIONS.soilProfile, initialMoistureUnits: 0 }
  };
  const makeService = () =>
    new FarmingService({
      repository: directRepository ? repository : repository.forInitialization(),
      definitions,
      groundProvider,
      clock,
      farmId: "farm",
      layoutId: "farm",
      layoutVersion: 1,
      plots: [{ id: "plot", label: "Test plot", target: { groundId: "soil", cellX: 0, cellZ: 0 } }],
      autoAdvance: true,
      createCropInstanceId: () => "crop",
      sampleEnvironment: () => ({
        availability: "live",
        season: null,
        baseTemperatureCelsius: null,
        snowing: false,
        airTemperatureTenths: 240,
        lightUnits: 70 + Math.floor(time.nowMs() / 3000),
        dayFactor: null,
        cloudCoverage: null,
        rainRate: rain,
        rainWaterPerMinute: rain
      })
    });
  let service = makeService();
  return {
    file,
    path,
    time,
    storage,
    resource,
    document,
    definitions,
    get service() {
      return service;
    },
    get repository() {
      return repository;
    },
    get project() {
      return project;
    },
    get saved() {
      return saved;
    },
    setRain(value: number) {
      rain = value;
    },
    async reload(resumeClock = false) {
      service.dispose();
      repository.dispose();
      project.dispose();
      project = await open();
      repository = new PlanningFarmRepository(project);
      if (resumeClock) {
        const snapshot = (await repository.read("farm"))!;
        clock = new PlanningFarmClock(snapshot.simulation.lastSystemTimeMs, () => 0);
      } else clock = time;
      service = makeService();
      return service.initialize();
    },
    dispose() {
      service.dispose();
      repository.dispose();
      project.dispose();
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  };
}

it("keeps idle ticks in memory and commits gameplay and offline growth", async () => {
  const f = await fixture();
  const { project, repository, service, storage, resource, time } = f;
  try {
    const initial = await service.initialize();
    expect(initial.plots[0].soil.moistureUnits).toBe(0);
    await project.flush();
    const content = f.saved.contents[path];
    const initialResourceData = resource.data;
    const commitSeq = project.persistenceStatus.commitSeq;
    const parse = vi.spyOn(JSON, "parse");
    const stringify = vi.spyOn(JSON, "stringify");
    const read = vi.spyOn(repository, "read");
    for (let tick = 0; tick < 10; tick++) {
      time.advanceBy(3000);
      await vi.advanceTimersByTimeAsync(3000);
      await service.whenIdle();
    }
    await project.flush();
    expect(service.getSnapshot()).toMatchObject({
      revision: initial.revision,
      simulation: { lastSystemTimeMs: 30_000, simulatedTimeMs: 30_000 },
      environment: { lightUnits: 80 }
    });
    expect(project.persistenceStatus.commitSeq).toBe(commitSeq);
    expect(project.projectPackage.contents[path]).toBe(content);
    expect(resource.data).toBe(initialResourceData);
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(parse.mock.calls.filter(([value]) => value === content)).toHaveLength(0);
    expect(stringify.mock.calls.filter(([value]) => value?.farms)).toHaveLength(0);
    parse.mockRestore();
    stringify.mockRestore();
    expect((await repository.read("farm"))?.simulation.lastSystemTimeMs).toBe(30_000);
    read.mockClear();

    // A short rain interval after the idle run must be settled from the in-memory checkpoint.
    f.setRain(60);
    time.advanceBy(3000);
    const wet = await service.checkpoint();
    expect(wet.plots[0].soil.moistureUnits).toBe(3);
    expect(wet.revision).toBe(initial.revision + 1);
    await service.whenIdle();
    expect(read).not.toHaveBeenCalled();
    await project.flush();
    expect(storage.save).toHaveBeenCalledTimes(2);

    const pendingDraft = structuredClone(project.projectPackage);
    pendingDraft.contents[pendingDraft.project.scene] = '{"edited":true}';
    const baseRevision = project.publicationRevision;
    const command = service.updatePlot("plot", { preparation: "leveled" });
    await command.then((receipt) => expect(receipt.ok).toBe(true));
    await project.publish(pendingDraft, baseRevision);
    expect((await repository.read("farm"))!.plots[0].soil.preparation).toBe("leveled");

    const planted = await service.execute({
      type: "plant",
      farmId: "farm",
      plotId: "plot",
      seedId: "berry-seed",
      commandId: "plant",
      expectedRevision: service.getSnapshot().revision
    });
    expect(planted.ok).toBe(true);

    await project.flush();
    f.setRain(0);
    time.advanceBy(3000);
    const restored = await f.reload();
    expect(restored.crops.crop.growthUnits).toBeGreaterThan(0);
    expect(f.service.getLastCatchUpSummary()).toMatchObject({ elapsedSystemTimeMs: 3000, simulatedElapsedMs: 3000 });
    expect(restored.simulation.lastSystemTimeMs).toBe(time.nowMs());
  } finally {
    f.dispose();
  }
});

it.each(["explicit", "hidden"] as const)("persists settled idle time at the %s boundary", async (boundary) => {
  const f = await fixture();
  try {
    const initial = await f.service.initialize();
    await f.project.flush();
    for (let tick = 0; tick < 20; tick++) {
      f.time.advanceBy(3000);
      await vi.advanceTimersByTimeAsync(3000);
      await f.service.whenIdle();
    }
    expect(f.project.persistenceStatus.commitSeq).toBe(1);
    if (boundary === "hidden") {
      f.document.visibilityState = "hidden";
      f.document.dispatchEvent(new Event("visibilitychange"));
      await f.service.whenIdle();
    } else await f.service.checkpoint();
    await f.project.flush();
    expect(f.storage.save).toHaveBeenCalledTimes(2);
    const restored = await f.reload(true);
    expect(restored.revision).toBe(initial.revision);
    expect(restored.simulation).toMatchObject({ lastSystemTimeMs: 60_000, simulatedTimeMs: 60_000 });
    expect(f.service.getLastCatchUpSummary().elapsedSystemTimeMs).toBe(0);
    f.setRain(60);
    f.time.advanceBy(3_000);
    const wallClockRestore = await f.reload();
    expect(wallClockRestore.plots[0].soil.moistureUnits).toBe(3);
    expect(f.service.getLastCatchUpSummary().elapsedSystemTimeMs).toBe(3_000);
  } finally {
    f.dispose();
  }
});

it("advances the farm revision for an external edit before resolving a queued command", async () => {
  const f = await fixture();
  try {
    const initial = await f.service.initialize();
    f.time.advanceBy(6000);
    await vi.advanceTimersByTimeAsync(6000);
    await f.service.whenIdle();
    const external = JSON.parse(f.project.projectPackage.contents[path] as string);
    external.farms.farm.plots[0].label = "External plot";
    const publishing = f.project.publishAsset(f.file, JSON.stringify(external));
    const racing = f.service.updatePlot("plot", { label: "Stale command" }, { expectedRevision: initial.revision });
    await publishing;
    expect(await racing).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    await f.service.whenIdle();
    expect(f.service.getSnapshot()).toMatchObject({
      revision: initial.revision + 1,
      simulation: { lastSystemTimeMs: 6000 },
      plots: [{ label: "External plot" }]
    });
    expect(f.resource.data).toEqual(JSON.parse(f.project.projectPackage.contents[path] as string));
  } finally {
    f.dispose();
  }
});

it("keeps the rain settled between a queued checkpoint and a late owned replacement notification", async () => {
  const f = await fixture();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const initial = await f.service.initialize();
    const publish = vi.fn();
    f.service.subscribe(publish);
    const draft = JSON.parse(f.project.projectPackage.contents[path] as string);
    draft.farms.farm.plots[0].label = "External plot";
    let entered!: () => void;
    const preparing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const unregister = f.project.registerProjectValidator(() => {
      entered();
      return wait;
    });
    const edit = f.project.publishAsset(f.file, JSON.stringify(draft));
    await preparing;
    const checkpoint = f.service.checkpoint();
    f.setRain(60);
    f.time.advanceBy(3000);
    await vi.advanceTimersByTimeAsync(3000);
    release();
    await edit;
    unregister();
    expect(await checkpoint).toMatchObject({
      revision: initial.revision + 1,
      simulation: { lastSystemTimeMs: 0 }
    });
    await f.service.whenIdle();
    expect(publish.mock.calls.map(([event]) => event.source)).toEqual(["external", "clock"]);
    expect(f.service.getSnapshot()).toMatchObject({
      revision: initial.revision + 1,
      simulation: { lastSystemTimeMs: 3000, simulatedTimeMs: 3000 },
      plots: [{ label: "External plot", soil: { moistureUnits: 3 } }]
    });
    expect(JSON.parse(f.project.projectPackage.contents[path] as string).farms.farm.simulation.lastSystemTimeMs).toBe(
      0
    );
  } finally {
    release();
    f.dispose();
  }
});

it("refreshes an external package replacement with the same revision", async () => {
  const f = await fixture();
  try {
    const initial = await f.service.initialize();
    const publish = vi.fn();
    f.service.subscribe(publish);
    const draft = JSON.parse(f.project.projectPackage.contents[path] as string);
    draft.farms.farm.plots[0].label = "Changed in package";
    f.project.projectPackage.contents[path] = JSON.stringify(draft);
    f.repository.synchronizeResource();
    await f.service.whenIdle();
    expect(f.service.getSnapshot()).toMatchObject({
      revision: initial.revision,
      plots: [{ label: "Changed in package" }]
    });
    expect(publish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ source: "external" }));
  } finally {
    f.dispose();
  }
});

it("pauses clock ticks during replacement when the service uses the repository directly", async () => {
  const f = await fixture(false, TEST_GROUND_PROVIDER, true);
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const initial = await f.service.initialize();
    const draft = JSON.parse(f.project.projectPackage.contents[path] as string);
    draft.farms.farm.plots[0].label = "External plot";
    let entered!: () => void;
    const preparing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.project.registerProjectValidator(() => {
      entered();
      return wait;
    });
    const edit = f.project.publishAsset(f.file, JSON.stringify(draft));
    await preparing;
    f.setRain(60);
    f.time.advanceBy(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await f.service.whenIdle();
    expect(f.service.getSnapshot()).toBe(initial);
    expect(f.repository.replacementPending).toBe(true);
    release();
    await edit;
    await f.service.whenIdle();
    expect(f.repository.replacementPending).toBe(false);
    expect(f.service.getSnapshot().plots[0].label).toBe("External plot");
  } finally {
    release();
    f.dispose();
  }
});

it.each([0, 1])("ignores a stale clock when package contents change with a revision delta of %i", async (delta) => {
  const f = await fixture();
  try {
    const initial = await f.service.initialize();
    for (let tick = 0; tick < 2; tick++) {
      f.time.advanceBy(3000);
      await vi.advanceTimersByTimeAsync(3000);
      await f.service.whenIdle();
    }
    expect((await f.repository.read("farm"))?.simulation.lastSystemTimeMs).toBe(6000);
    const replacement = JSON.parse(f.project.projectPackage.contents[path] as string);
    replacement.farms.farm.revision = initial.revision + delta;
    replacement.farms.farm.plots[0].soil.moistureUnits = 27;
    f.project.projectPackage.contents[path] = JSON.stringify(replacement);
    replacement.farms.farm.plots[0].label = "Edited replacement";
    await f.project.publishAsset(f.file, JSON.stringify(replacement));
    await f.service.whenIdle();
    expect(f.service.getSnapshot()).toMatchObject({
      revision: initial.revision + delta + 1,
      simulation: { lastSystemTimeMs: 0, simulatedTimeMs: 0 },
      plots: [{ label: "Edited replacement", soil: { moistureUnits: 27 } }]
    });
  } finally {
    f.dispose();
  }
});

it.each(["missing", "incompatible"] as const)("rejects %s active snapshots before publication", async (problem) => {
  const f = await fixture();
  try {
    const initial = await f.service.initialize();
    const content = f.project.projectPackage.contents[path] as string;
    const external = JSON.parse(content);
    if (problem === "missing") delete external.farms.farm;
    else external.farms.farm.simulation.rulesSignature = "incompatible";
    const seq = f.project.persistenceStatus.commitSeq;
    const resource = f.resource.data;
    await expect(f.project.publishAsset(f.file, JSON.stringify(external))).rejects.toThrow();
    expect(f.project.projectPackage.contents[path]).toBe(content);
    expect(f.project.persistenceStatus.commitSeq).toBe(seq);
    expect(f.resource.data).toBe(resource);
    expect(f.service.getSnapshot()).toBe(initial);
    await expect(f.service.checkpoint()).resolves.toMatchObject({ revision: initial.revision });
  } finally {
    f.dispose();
  }
});

it("keeps the last settled time when a durable layout edit follows an idle minute", async () => {
  const f = await fixture(true);
  try {
    const initial = await f.service.initialize();
    for (let tick = 0; tick < 20; tick++) {
      f.time.advanceBy(3000);
      await vi.advanceTimersByTimeAsync(3000);
      await f.service.whenIdle();
    }
    expect(f.project.persistenceStatus.commitSeq).toBe(1);
    const external = JSON.parse(f.project.projectPackage.contents[path] as string);
    const saved = external.farms.farm;
    expect(saved.simulation.simulatedTimeMs).toBe(0);
    saved.plots.push({ ...saved.plots[0], plotId: "added", cellX: 4 });
    await f.project.publishAsset(f.file, JSON.stringify(external));
    await f.service.whenIdle();
    const edited = f.service.getSnapshot();
    expect(edited.revision).toBe(initial.revision + 1);
    expect(edited.plots[1]).toMatchObject({ plotId: "added", cellX: 4, soil: { moistureUnits: 0 } });
    expect(edited.simulation).toMatchObject({ lastSystemTimeMs: 60_000, simulatedTimeMs: 60_000 });
    expect((await f.repository.read("farm"))!.simulation).toEqual(edited.simulation);
    f.setRain(60);
    f.time.advanceBy(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await f.service.whenIdle();
    expect(f.service.getSnapshot().simulation).toMatchObject({ lastSystemTimeMs: 63_000, simulatedTimeMs: 63_000 });
    expect(f.service.getSnapshot().plots.map((plot) => plot.soil.moistureUnits)).toEqual([3, 3]);
  } finally {
    f.dispose();
  }
});

it.each(["label", "layout"] as const)("preserves rain and crop settlement during a queued %s edit", async (kind) => {
  const f = await fixture(true);
  let unblock!: () => void;
  try {
    await f.service.initialize();
    expect((await f.service.updatePlot("plot", { preparation: "leveled" })).ok).toBe(true);
    expect(
      (
        await f.service.execute({
          type: "plant",
          farmId: "farm",
          plotId: "plot",
          seedId: "berry-seed",
          commandId: "plant-before-label",
          expectedRevision: f.service.getSnapshot().revision
        })
      ).ok
    ).toBe(true);

    const originalContent = f.project.projectPackage.contents[path] as string;
    f.setRain(60);
    f.time.advanceBy(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await f.service.whenIdle();
    const live = f.service.getSnapshot();
    expect(live.plots[0].soil.moistureUnits).toBe(3);
    expect(live.crops.crop.growthUnits).toBeGreaterThan(0);
    expect(f.project.projectPackage.contents[path]).toBe(originalContent);

    f.setRain(kind === "layout" ? 120 : 0);
    const draft = JSON.parse(originalContent);
    const saved = draft.farms.farm;
    const plot = saved.plots[0];
    plot.label = "Edited label";
    if (kind === "layout") {
      plot.cellX = 10;
      plot.soil.phTenths = 70;
      saved.plots.push({
        ...plot,
        plotId: "added",
        cellX: 4,
        occupantId: null,
        soil: { ...plot.soil, moistureUnits: 12 }
      });
    }
    const wait = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    let entered!: () => void;
    const preparing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.project.registerProjectValidator(() => {
      entered();
      return wait;
    });
    const edit = f.project.publishAsset(f.file, JSON.stringify(draft));
    await preparing;
    const checkpoint = f.service.checkpoint();
    f.time.advanceBy(3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.service.getSnapshot()).toBe(live);
    unblock();
    await edit;
    const result = await checkpoint;
    await f.service.whenIdle();
    const acceptedTime = kind === "layout" ? 6000 : 3000;
    expect(result.simulation.lastSystemTimeMs).toBe(acceptedTime);
    expect(result.plots[0]).toMatchObject({
      label: "Edited label",
      cellX: kind === "layout" ? 10 : 0,
      soil: {
        ...live.plots[0].soil,
        moistureUnits: kind === "layout" ? 6 : live.plots[0].soil.moistureUnits,
        phTenths: kind === "layout" ? 70 : live.plots[0].soil.phTenths
      }
    });
    if (kind === "layout")
      expect(result.plots[1]).toMatchObject({ plotId: "added", cellX: 4, soil: { moistureUnits: 12 } });
    if (kind === "layout") {
      expect(result.crops.crop.growthUnits).toBeGreaterThan(live.crops.crop.growthUnits);
      expect(result.crops.crop.lastEvaluatedSimulationMs).toBe(6000);
    } else expect(result.crops.crop).toEqual(live.crops.crop);
    const persisted = JSON.parse(f.project.projectPackage.contents[path] as string).farms.farm;
    expect(persisted.simulation.lastSystemTimeMs).toBe(acceptedTime);
    expect(persisted.plots[0].soil).toEqual(result.plots[0].soil);
  } finally {
    unblock?.();
    f.dispose();
  }
});

it.each([3_600_000, 0])("rebases a queued Farming checkpoint to imported time %i", async (importedTime) => {
  const f = await fixture(true);
  try {
    await f.service.initialize();
    f.time.advanceBy(6000);
    await vi.advanceTimersByTimeAsync(6000);
    await f.service.whenIdle();
    await f.service.checkpoint();
    const external = JSON.parse(f.project.projectPackage.contents[path] as string);
    external.farms.farm.simulation.lastSystemTimeMs = importedTime;
    external.farms.farm.simulation.simulatedTimeMs = importedTime;
    if (importedTime > 0) external.farms.farm.plots[0].cellX = 10;
    f.setRain(60);
    const edit = f.project.publishAsset(f.file, JSON.stringify(external));
    const checkpoint = f.service.checkpoint();
    await edit;
    const imported = await checkpoint;
    expect(imported.simulation.lastSystemTimeMs).toBe(importedTime);
    expect(imported.plots[0].cellX).toBe(importedTime > 0 ? 10 : 0);
    expect(imported.plots[0].soil.moistureUnits).toBe(0);
    f.time.advanceBy(3000);
    const next = await f.service.checkpoint();
    expect(next.simulation.lastSystemTimeMs).toBe(importedTime + 3000);
    expect(next.plots[0].soil.moistureUnits).toBe(3);
  } finally {
    f.dispose();
  }
});

it("refreshes near-water entries only for changes to the external plot layout", async () => {
  const f = await fixture();
  const frames = new Map<number, () => void>();
  let frame = 0;
  const supply = new PlanningFarmWaterSupply({
    scheduler: {
      nowMs: () => 0,
      schedule(callback) {
        frames.set(++frame, callback);
        return frame;
      },
      cancel(handle) {
        frames.delete(handle);
      }
    }
  });
  const field: WaterSpatialFieldSnapshot = {
    metadata: {
      version: 1,
      sourceSchemaVersion: 1,
      sourceHash: "test-shore",
      compiledHash: "test-shore-compiled",
      storage: "test",
      channels: 0,
      bounds: { minX: -20, minZ: -20, maxX: 20, maxZ: 20 },
      outsidePolicy: { negativeX: "dry", positiveX: "dry", negativeZ: "dry", positiveZ: "dry" },
      maximumHorizontalError: 0,
      maximumDepthError: 0
    },
    nearShore: {
      radiusM: 20,
      sample(_x, _z, out) {
        out.distanceM = 1;
        out.surfaceHeight = 0;
        return true;
      }
    },
    sampleSpatialField: () => false
  };
  const view = { ...TEST_GROUND_PROVIDER.capture(), revision: 1, waterFields: [field] };
  const complete = () => {
    for (const [handle, callback] of [...frames]) {
      frames.delete(handle);
      callback();
    }
  };
  try {
    const initial = await f.service.initialize();
    supply.request(view, initial);
    const unsubscribe = subscribePlanningFarmWaterLayout(f.service, supply, () => view);
    complete();
    const replace = async (edit: (plots: PlotState[]) => PlotState[]) => {
      const external = JSON.parse(f.project.projectPackage.contents[path] as string);
      external.farms.farm.plots = edit(external.farms.farm.plots);
      await f.project.publishAsset(f.file, JSON.stringify(external));
      await f.service.whenIdle();
    };

    await replace(([plot]) => [{ ...plot, label: "New label" }]);
    expect(frames.size).toBe(0);
    expect(supply.diagnostics().completedTasks).toBe(1);
    await replace(([plot]) => [plot, { ...plot, plotId: "added", cellX: 4, cellZ: 4 }]);
    expect(frames.size).toBe(1);
    complete();
    expect(supply.capture("farm")!.plots.get("added")).toMatchObject({ cellX: 4, cellZ: 4 });
    expect(supply.capture("farm")!.plots.get("added")!.coefficient).toBeGreaterThan(0);
    await replace(([plot, added]) => [plot, { ...added, cellX: 6 }]);
    expect(supply.capture("farm")!.plots.has("added")).toBe(false);
    complete();
    expect(supply.capture("farm")!.plots.get("added")?.cellX).toBe(6);
    await replace(([plot, added]) => [plot, { ...added, groundId: "new-ground" }]);
    expect(supply.capture("farm")!.plots.has("added")).toBe(false);
    complete();
    expect(supply.capture("farm")!.plots.get("added")?.groundId).toBe("new-ground");
    await replace(([plot]) => [plot]);
    expect(supply.capture("farm")!.plots.has("added")).toBe(false);
    complete();
    expect(supply.capture("farm")!.plots.size).toBe(1);
    expect(supply.diagnostics()).toMatchObject({ completedTasks: 5, completedGroundRevision: 1 });
    unsubscribe();
  } finally {
    supply.dispose();
    f.dispose();
  }
});

it.each([0, 1])("refreshes only affected water connections at acceptance (old mask %i)", async (oldMask) => {
  const base = TEST_GROUND_PROVIDER.capture();
  const inspectBounds = vi.fn(base.inspectBounds);
  const view = { ...base, inspectBounds };
  const f = await fixture(true, { ...TEST_GROUND_PROVIDER, capture: () => view });
  const target = (cellX: number) => ({ groundId: "soil", cellX, cellZ: 0 });
  const snapshot = () => f.service.getSnapshot();
  try {
    await f.service.initialize();
    for (const x of [5, ...(oldMask ? [6] : []), 20, 21]) expect((await f.service.createPlot(target(x))).ok).toBe(true);
    const wet = JSON.parse(f.project.projectPackage.contents[path] as string);
    wet.farms.farm.plots[0].soil.moistureUnits = 80;
    await f.project.publishAsset(f.file, JSON.stringify(wet));
    await f.service.whenIdle();
    const edit = JSON.parse(f.project.projectPackage.contents[path] as string);
    const plots = edit.farms.farm.plots as PlotState[];
    plots[1] = { ...plots[1], cellX: 1 };
    expect(plots[1].ground.waterMask).toBe(oldMask);
    f.time.advanceBy(3000);
    const unregister = f.project.registerProjectValidator(async () => {
      f.time.advanceBy(3000);
    });
    inspectBounds.mockClear();
    await f.project.publishAsset(f.file, JSON.stringify(edit));
    unregister();
    await f.service.whenIdle();
    expect(snapshot().simulation.lastSystemTimeMs).toBe(6000);
    expect(snapshot().plots.map((plot) => plot.ground.waterMask)).toEqual([1, 2, ...(oldMask ? [0] : []), 1, 2]);
    expect(snapshot().plots[0].ground.waterSinceMs).toEqual([6000, 0, 0, 0]);
    expect(snapshot().plots[1].ground.waterSinceMs).toEqual([0, 6000, 0, 0]);
    expect(snapshot().plots.find((plot) => plot.cellX === 20)?.ground.waterSinceMs).toEqual([0, 0, 0, 0]);
    expect(inspectBounds.mock.calls.map(([, bounds]) => bounds.minimumX).sort((a, b) => a - b)).toEqual([0, 1.25]);
    const saved = JSON.parse(f.project.projectPackage.contents[path] as string).farms.farm;
    expect(saved.plots[1].ground).toEqual(snapshot().plots[1].ground);
    const first = await f.service.checkpoint();
    expect(first.plots[1].soil.moistureUnits).toBe(0);
    f.time.advanceBy(3000);
    const next = await f.service.checkpoint();
    expect(next.plots[1].soil.moistureUnits).toBeCloseTo(11.208);
    const label = JSON.parse(f.project.projectPackage.contents[path] as string);
    label.farms.farm.plots[0].label = "Label only";
    inspectBounds.mockClear();
    await f.project.publishAsset(f.file, JSON.stringify(label));
    await f.service.whenIdle();
    expect(inspectBounds).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});

it.each([
  { outcome: "accepted", remainderMs: 0 },
  { outcome: "accepted", remainderMs: 500 },
  { outcome: "validator rejected", remainderMs: 0 },
  { outcome: "late preparation failed", remainderMs: 0 }
] as const)(
  "settles the old water network during a delayed layout publication ($outcome, remainder $remainderMs ms)",
  async ({ outcome, remainderMs }) => {
    const base = TEST_GROUND_PROVIDER.capture();
    let failInspection = false;
    const view = {
      ...base,
      inspectBounds: (...args: Parameters<typeof base.inspectBounds>) => {
        if (failInspection) throw new Error("late preparation failed");
        return base.inspectBounds(...args);
      }
    };
    const f = await fixture(true, { ...TEST_GROUND_PROVIDER, capture: () => view });
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await f.service.initialize();
      const target = (cellX: number) => ({ groundId: "soil", cellX, cellZ: 0 });
      // Keep the direction when replacing the neighbor within a step, to distinguish it from the same edge.
      for (const x of [1, remainderMs ? 4 : 6, 12]) expect((await f.service.createPlot(target(x))).ok).toBe(true);
      const wet = JSON.parse(f.project.projectPackage.contents[path] as string);
      wet.farms.farm.plots[0].soil.moistureUnits = 80;
      wet.farms.farm.plots[2].soil.moistureUnits = 80;
      await f.project.publishAsset(f.file, JSON.stringify(wet));
      await f.service.whenIdle();
      const before = f.service.getSnapshot();
      const content = f.project.projectPackage.contents[path] as string;
      const commitSeq = f.project.persistenceStatus.commitSeq;
      const resource = f.resource.data;
      const draft = JSON.parse(content);
      draft.farms.farm.plots[1].cellX = 5;
      draft.farms.farm.plots[3].soil.moistureUnits = 42;
      let entered!: () => void;
      const validating = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const unregister = f.project.registerProjectValidator(async () => {
        entered();
        await wait;
        if (outcome === "validator rejected") throw new Error(outcome);
      });
      const publication = f.project.publishAsset(f.file, JSON.stringify(draft));
      const finished = outcome === "accepted" ? publication : expect(publication).rejects.toThrow(outcome);
      await validating;
      for (let i = 0; i < 2; i++) {
        f.time.advanceBy(3000);
        await vi.advanceTimersByTimeAsync(3000);
        await f.service.whenIdle();
      }
      f.time.advanceBy(remainderMs);
      expect(f.service.getSnapshot()).toBe(before);
      expect(f.project.projectPackage.contents[path]).toBe(content);
      expect(f.project.persistenceStatus.commitSeq).toBe(commitSeq);
      failInspection = outcome === "late preparation failed";
      release();
      await finished;
      failInspection = false;
      unregister();
      await f.service.whenIdle();
      if (outcome !== "accepted") {
        expect(f.service.getSnapshot()).toBe(before);
        expect(f.project.projectPackage.contents[path]).toBe(content);
        expect(f.project.persistenceStatus.commitSeq).toBe(commitSeq);
        expect(f.resource.data).toBe(resource);
        f.time.advanceBy(3000);
        await vi.advanceTimersByTimeAsync(3000);
        await f.service.whenIdle();
        const recovered = f.service.getSnapshot();
        expect(recovered.simulation.simulatedTimeMs).toBe(9000);
        expect(recovered.plots[1].cellX).toBe(1);
        expect(recovered.plots[1].soil.moistureUnits).toBeCloseTo(21.65020416);
        expect(recovered.plots[3].soil.moistureUnits).toBe(0);
        return;
      }
      const edited = f.service.getSnapshot();
      const acceptedAt = 6000 + remainderMs;
      expect(edited.simulation).toMatchObject({ lastSystemTimeMs: acceptedAt, simulatedTimeMs: 6000, remainderMs });
      expect(edited.plots[0].soil.moistureUnits).toBeCloseTo(49.17824);
      expect(edited.plots[1]).toMatchObject({
        cellX: 5,
        ground: { waterSinceMs: remainderMs ? [0, acceptedAt, 0, 0] : [acceptedAt, 0, 0, 0] }
      });
      expect(edited.plots[1].soil.moistureUnits).toBeCloseTo(18.82176);
      expect(edited.plots[2].soil.moistureUnits).toBe(74);
      expect(edited.plots[3].soil.moistureUnits).toBe(42);
      expect(JSON.parse(f.project.projectPackage.contents[path] as string).farms.farm).toEqual(edited);
      expect(f.project.persistenceStatus.commitSeq).toBe(commitSeq + 1);
      expect((await f.service.checkpoint()).plots).toEqual(edited.plots);
      expect(f.project.persistenceStatus.commitSeq).toBe(commitSeq + 1);
      f.time.advanceBy(3000 - remainderMs);
      const next = await f.service.checkpoint();
      expect(next.simulation.simulatedTimeMs).toBe(9000);
      expect(next.plots[0].soil.moistureUnits).toBeCloseTo(46.17824);
      if (remainderMs) {
        // The crossing step contains neither a complete old nor a complete new connection.
        expect(next.plots[1].soil.moistureUnits).toBeCloseTo(15.82176);
        expect(next.plots[2].soil.moistureUnits).toBe(71);
        f.time.advanceBy(3000);
        const firstFullStep = await f.service.checkpoint();
        expect(firstFullStep.plots[1].soil.moistureUnits).toBeCloseTo(23.41598208);
        expect(firstFullStep.plots[2].soil.moistureUnits).toBeCloseTo(57.40577792);
      } else {
        expect(next.plots[1].soil.moistureUnits).toBeCloseTo(26.41598208);
        expect(next.plots[2].soil.moistureUnits).toBeCloseTo(60.40577792);
      }
    } finally {
      release();
      f.dispose();
    }
  }
);

it.each([null, 6000, 6500])("keeps equivalent soil water transport with relocation at %s ms", async (moveAt) => {
  const f = await fixture(true);
  try {
    await f.service.initialize();
    expect((await f.service.createPlot({ groundId: "soil", cellX: 1, cellZ: 0 })).ok).toBe(true);
    const wet = JSON.parse(f.project.projectPackage.contents[path] as string);
    wet.farms.farm.plots[0].soil.moistureUnits = 80;
    await f.project.publishAsset(f.file, JSON.stringify(wet));
    await f.service.whenIdle();

    if (moveAt !== null) {
      f.time.advanceBy(moveAt);
      const edit = JSON.parse(f.project.projectPackage.contents[path] as string);
      const plots = edit.farms.farm.plots;
      plots[0].cellX = 10;
      plots[1].cellX = 11;
      await f.project.publishAsset(f.file, JSON.stringify(edit));
      await f.service.whenIdle();
      const moved = f.service.getSnapshot();
      expect(moved.simulation).toMatchObject({
        lastSystemTimeMs: moveAt,
        simulatedTimeMs: 6000,
        remainderMs: moveAt - 6000
      });
      expect(moved.plots.map((plot) => plot.cellX)).toEqual([10, 11]);
      expect(moved.plots.map((plot) => plot.ground.waterMask)).toEqual([1, 2]);
    }
    f.time.advanceBy(9000 - (moveAt ?? 0));
    const next = await f.service.checkpoint();
    expect(next.simulation.simulatedTimeMs).toBe(9000);
    expect(next.plots[1].soil.moistureUnits).toBeCloseTo(21.65020416);
    expect(next.plots[0].soil.moistureUnits).toBeCloseTo(40.34979584);
    expect(next.plots.map((plot) => plot.ground.waterSinceMs)).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]);
  } finally {
    f.dispose();
  }
});

it.each(["createPlot", "hoe"] as const)(
  "%s can cultivate the original cell of a relocated stable ID",
  async (method) => {
    const f = await fixture();
    try {
      await f.service.initialize();
      const target = { groundId: "soil", cellX: 2, cellZ: 0 };
      const oldId = "soil/x2z0";
      expect((await f.service.createPlot(target)).ok).toBe(true);
      expect(
        (
          await f.service.execute({
            type: "plant",
            farmId: "farm",
            plotId: oldId,
            seedId: "berry-seed",
            commandId: "plant-before-reclaim",
            expectedRevision: f.service.getSnapshot().revision
          })
        ).ok
      ).toBe(true);
      const edit = JSON.parse(f.project.projectPackage.contents[path] as string);
      edit.farms.farm.plots[1].cellX = 10;
      await f.project.publishAsset(f.file, JSON.stringify(edit));
      await f.service.whenIdle();
      const preview = f.service.inspectCultivation(target);
      expect(preview.canCultivate).toBe(true);
      expect(f.service.getAvailableActions(target)).toContainEqual(
        expect.objectContaining({ action: "hoe", enabled: true })
      );
      const result =
        method === "createPlot"
          ? await f.service.createPlot(target)
          : await f.service.execute({
              type: "hoe",
              target,
              farmId: "farm",
              commandId: "hoe-reclaimed-cell",
              expectedRevision: f.service.getSnapshot().revision,
              expectedCropInstanceId: null
            });
      expect(result).toMatchObject({
        ok: true,
        changes: expect.arrayContaining([{ kind: "plot-created", plotId: preview.plotId }])
      });
      expect(preview.plotId).not.toBe(oldId);
      expect(f.service.getPlot(preview.plotId)).toMatchObject({ cellX: 2, occupantId: null });
      expect(f.service.getPlot(oldId)).toMatchObject({ cellX: 10, occupantId: "crop" });
      expect(f.service.getSnapshot().crops.crop.anchorPlotId).toBe(oldId);
      expect(await f.service.createPlot(target)).toMatchObject({ ok: false, error: { code: "PLOT_EXISTS" } });
    } finally {
      f.dispose();
    }
  }
);

it("reconciles chunk meshes and the crop anchor when an external edit moves or removes a plot", async () => {
  const height = (groundId: string) => (groundId === "raised" ? 2 : 0);
  const ground: FarmingGroundProvider = {
    ...TEST_GROUND_PROVIDER,
    capture: () => ({
      ...TEST_GROUND_PROVIDER.capture(),
      sample: (id, x, z) => ({ position: [x, height(id), z], normal: [0, 1, 0], surface: "soil" }),
      surfaceTriangles: (id, bounds) => planeSurfaceTriangles(bounds, height(id))
    })
  };
  const f = await fixture(false, ground);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(FarmingTargetHint, "create").mockReturnValue(undefined!);
  Object.assign(f.document, {
    createElement: () => ({
      getContext: () => ({
        createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData() {}
      })
    })
  });
  const engine = await HeadlessEngine.create({
    shaderCompiler: new ShaderCompiler(),
    glTFLoader: { meshOpt: { workerCount: 0 } }
  });
  // Use the real soil batching path with the null graphics device.
  const device = engine["_hardwareRenderer"];
  Object.assign(device, { supportsRendering: true });
  // One coverage slot is enough to move a single plot without temporarily doubling its allocation.
  Object.assign(device.capability, { maxTextureSize: 65 });
  let presentation: FarmingWorldPresentation | undefined;
  try {
    await f.service.initialize();
    expect((await f.service.updatePlot("plot", { preparation: "leveled" })).ok).toBe(true);
    expect(
      (
        await f.service.execute({
          type: "plant",
          farmId: "farm",
          plotId: "plot",
          seedId: "berry-seed",
          commandId: "plant-before-move",
          expectedRevision: f.service.getSnapshot().revision
        })
      ).ok
    ).toBe(true);
    const root = engine.sceneManager.activeScene.createRootEntity();
    const camera = root.createChild("Camera").addComponent(Camera);
    camera.enabled = false;
    presentation = new FarmingWorldPresentation(root, camera, f.service, ground, f.definitions);
    const world = presentation.root;
    const plot = () => world.findByName("plot")!;
    const chunks = world.findByName("soil-render-batches")!;
    const mesh = () =>
      chunks.children.find((entity) => entity.getComponent(MeshRenderer).enabled)!.getComponent(MeshRenderer).mesh!;
    const replace = async (edit: (snapshot: { plots: PlotState[]; crops: object }) => void) => {
      const external = JSON.parse(f.project.projectPackage.contents[path] as string);
      edit(external.farms.farm);
      await f.project.publishAsset(f.file, JSON.stringify(external));
      await f.service.whenIdle();
      engine.update();
    };
    engine.update();
    const initialMesh = mesh();
    const initialPlot = plot();
    const cropAnchor = initialPlot.findByName("crop-anchor")!;
    const plant = cropAnchor.createChild("Resident crop");
    expect(initialMesh.bounds.min.x).toBe(0);
    const cellSize = f.service.getSnapshot().grid.cellSize;
    expect(plant.transform.worldPosition.x).toBeCloseTo(cellSize / 2);

    await replace((snapshot) => {
      snapshot.plots[0] = { ...snapshot.plots[0], label: "New name" };
    });
    expect(plot()).toBe(initialPlot);
    expect(mesh()).toBe(initialMesh);

    await replace((snapshot) => {
      snapshot.plots[0] = { ...snapshot.plots[0], cellX: 10 };
    });
    // The active mesh is chunk-local. At cell 10 its first vertex is two cells into chunk 2.
    expect(mesh().bounds.min.x).toBeCloseTo(2 * cellSize);
    expect(initialMesh.destroyed).toBe(true);
    expect(cropAnchor.parent).toBe(plot());
    expect(presentation.getGroundOcclusionRoot({ groundId: "soil", cellX: 10, cellZ: 0 })).toBe(cropAnchor);
    expect(presentation.getGroundOcclusionRoot({ groundId: "soil", cellX: 0, cellZ: 0 })).toBeUndefined();
    expect(plant.transform.worldPosition.x).toBeCloseTo(10.5 * cellSize);
    expect(presentation.getSowingSurface("plot")?.center).toEqual([10.5 * cellSize, cellSize / 2]);

    const movedMesh = mesh();
    const originalHeight = movedMesh.bounds.min.y;
    await replace((snapshot) => {
      snapshot.plots[0] = { ...snapshot.plots[0], groundId: "raised" };
    });
    expect(mesh().bounds.min.y).toBeCloseTo(originalHeight + 2);
    expect(movedMesh.destroyed).toBe(true);
    expect(cropAnchor.parent).toBe(plot());
    expect(presentation.getGroundOcclusionRoot({ groundId: "raised", cellX: 10, cellZ: 0 })).toBe(cropAnchor);
    expect(presentation.getGroundOcclusionRoot({ groundId: "soil", cellX: 10, cellZ: 0 })).toBeUndefined();
    expect(plant.transform.worldPosition.y).toBeCloseTo(originalHeight + 2);

    const raisedMesh = mesh();
    await replace((snapshot) => {
      snapshot.plots = [];
      snapshot.crops = {};
    });
    expect(world.findByName("plot")).toBeNull();
    expect(presentation.getSowingSurface("plot")).toBeNull();
    expect(raisedMesh.destroyed).toBe(true);
    expect(cropAnchor.destroyed).toBe(true);
  } finally {
    presentation?.dispose();
    engine.destroy();
    f.dispose();
  }
});

it("keeps elapsed page time on a same-origin replacement and releases a rejected replacement", async () => {
  const f = await fixture(true);
  try {
    await f.service.initialize();
    const editMoisture = () => {
      const external = JSON.parse(f.project.projectPackage.contents[path] as string);
      external.farms.farm.plots[0].soil.moistureUnits = 3;
      return JSON.stringify(external);
    };
    const reject = f.project.registerProjectValidator(() => {
      throw Error("Rejected during publication");
    });
    await expect(f.project.publishAsset(f.file, editMoisture())).rejects.toThrow("Rejected during publication");
    reject();
    f.time.advanceBy(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await f.service.whenIdle();
    expect(f.service.getSnapshot().simulation.simulatedTimeMs).toBe(3000);
    expect(f.service.getSnapshot().plots[0].soil.moistureUnits).toBe(0);
    await f.service.checkpoint();
    f.time.advanceBy(1000);
    await f.project.publishAsset(f.file, editMoisture());
    await f.service.whenIdle();
    expect(f.service.getSnapshot().plots[0].soil.moistureUnits).toBe(3);

    f.time.advanceBy(2000);
    await vi.advanceTimersByTimeAsync(3000);
    await f.service.whenIdle();
    expect(f.service.getSnapshot().simulation).toMatchObject({ lastSystemTimeMs: 6000, simulatedTimeMs: 6000 });
  } finally {
    f.dispose();
  }
});
