import { pendingTestInventory } from "../fixtures/fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { nativeFixture } from "./native-fixtures";
import { FarmingAreaComponent, nativeFarmingOwners } from "../../src/farming/native/FarmingAreaComponent";
import { FarmingSystem } from "../../src/farming/native/FarmingSystem";
import { FarmingAPI } from "../../src/farming/native/FarmingAPI";
import { farmingAreaComponentData } from "../../src/farming/native/FarmingSceneData";
import { createFarmingResources, parseFarmingResource, serializeFarmingResource } from "../../src/farming/native/FarmingResources";
import { FARMING_API_DECLARATION } from "../../src/farming/native/FarmingAPIDeclarations";
import { FARMING_METHOD_DOCS } from "../../src/farming/native/FarmingMethodDocs";
import { FARMING_API_CONTRACT } from "../../src/farming/native/FarmingAPIContract";
import { createFarmingAgentPackage } from "../../src/farming/native/FarmingAgent";
import { MemoryFarmRepository } from "../../src/farming/persistence/MemoryFarmRepository";
import { TEST_FARMING_DEFINITIONS, TEST_GROUND_PROVIDER } from "../fixtures/fixtures";
import { FARMING_INSTRUCTION_CASES, replayFarmingInstruction } from "./FarmingInstructionSuite";
import type { FarmingRequest } from "../../src/farming/native/FarmingAPIContract";
import { cancellable } from "../../src/farming/application/FarmingActionCoordinator";

const fixtures: ReturnType<typeof nativeFixture>[] = [];
async function create(...args: Parameters<typeof nativeFixture>) {
  const f = nativeFixture(...args);
  fixtures.push(f);
  await f.ready;
  return f;
}
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.system.dispose();
});
const plant = {
  operation: "plant",
  input: { farmId: "native-farm", plotId: "native/a", seedId: "berry-seed" }
} as const;

describe("native farming contracts and state", () => {
  it.each(["weeds", "weedGrowthMultiplier"])("rejects removed rule field %s at the resource boundary", async (key) => {
    const f = await create();
    const rules = JSON.parse(serializeFarmingResource(f.resources.rules));
    rules.data.simulationConfig = { [key]: key === "weeds" ? { waterPerMinute: 0.6 } : 1 };
    expect(() => parseFarmingResource(f.engine, JSON.stringify(rules))).toThrow(/Unknown farming simulation parameter/);
  });

  it("rejects the removed clearing operation without advancing time or changing the farm", async () => {
    const f = await create();
    const before = f.area.service.getSnapshot();
    f.clock.advanceBy(600000);
    const result = await f.api.execute({
      // @ts-expect-error Removed operation must also fail for untyped callers.
      operation: "weed",
      input: { farmId: "native-farm", plotId: "native/a" }
    });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_SUPPORTED" } });
    expect(f.area.service.getSnapshot()).toEqual(before);
  });

  it("loads legacy v1 fertility resources without replacing authored catalog or water rules", async () => {
    const f = await create();
    const catalog = JSON.parse(serializeFarmingResource(f.resources.catalog));
    catalog.data.crops[0].name = "Saved custom crop";
    catalog.data.crops[0].growthFactors.fertility = {
      minimum: 5, optimalMinimum: 55, optimalMaximum: 100, maximum: 100
    };
    const expected = structuredClone(catalog.data);
    delete expected.crops[0].growthFactors.fertility;
    const loaded = parseFarmingResource(f.engine, JSON.stringify(catalog));
    expect(loaded.data).toEqual(expected);
    expect(parseFarmingResource(f.engine, serializeFarmingResource(loaded)).data).toEqual(expected);
    catalog.data.crops[0].growthFactors.unrecognizedFactor = {};
    expect(() => parseFarmingResource(f.engine, JSON.stringify(catalog))).toThrow(/unrecognizedFactor/);

    const rules = JSON.parse(serializeFarmingResource(f.resources.rules));
    rules.data.soilProfile.initialFertilityUnits = 75;
    rules.data.simulationConfig = { cropGrowthMultiplier: 2 };
    const parsed = parseFarmingResource(f.engine, JSON.stringify(rules));
    expect(parsed.data).toEqual({ ...f.resources.rules.data, simulationConfig: { cropGrowthMultiplier: 2 } });
  });

  it("rejects the removed fertilizer operation without changing farm state", async () => {
    const f = await create();
    const before = f.area.service.getSnapshot();
    const result = await f.api.execute({
      // @ts-expect-error The removed operation is intentionally outside the current contract.
      operation: "fertilize",
      input: { farmId: "native-farm", plotId: "native/a" }
    });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_SUPPORTED" } });
    expect(f.area.service.getSnapshot()).toEqual(before);
  });
  it("generates standalone typed declarations, with input/output associated with the operation", () => {
    const name = "/farming-contract-check.ts";
    const source =
      FARMING_API_DECLARATION +
      `\nasync function example(){const [farm]=await editor.component.query({type:'FarmingAreaComponent',farmId:'f'});const r=await farm.getPlot({plotId:'p'});if(r.ok)r.value?.crop?.instanceId;\n// @ts-expect-error cropInstanceId is required\nawait farm.harvest({plotId:'p'});\n// @ts-expect-error reads cannot mutate revisions\nawait farm.read({}, {expectedRevision:1});}`;
    const options = { noEmit: true, strict: true, target: ts.ScriptTarget.ESNext, skipLibCheck: true, types: [] };
    const host = ts.createCompilerHost(options),
      original = host.getSourceFile.bind(host);
    host.getSourceFile = (file, lang, ...rest) =>
      file === name ? ts.createSourceFile(name, source, lang, true) : original(file, lang, ...rest);
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([name], options, host));
    expect(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
  });

  it("publishes knowledge and component bindings without application Prompt changes", async () => {
    const f = await create();
    const pkg = createFarmingAgentPackage(f.api);
    expect(pkg.definition.toolNames).toEqual(pkg.tools.map(tool => tool.name));
    expect(pkg.definition.editorComponents?.[0].type).toBe("FarmingAreaComponent");
    expect(pkg.definition.scriptApi.documents?.map((d) => d.path)).toEqual([
      "skills/farming/references/overview.md",
      "skills/farming/references/operations.md",
      "skills/farming/references/state-and-units.md",
      "skills/farming/references/verification.md",
      "skills/farming/references/saves-and-assets.md",
      ...FARMING_METHOD_DOCS.map(doc => doc.path)
    ]);
    for (const operation of Object.keys(FARMING_API_CONTRACT))
      expect(pkg.definition.scriptApi.documents![0].content).toContain(`- ${operation}:`);
    await expect(
      pkg.tools.find(tool=>tool.name==="farming.component.harvest")!.execute(
        { identity:{farmId:"native-farm"}, input:{plotId:"native/a",cropInstanceId:"missing"} },
        { signal: new AbortController().signal }
      )
    ).rejects.toMatchObject({ code: "CROP_NOT_FOUND", executed: false });
  });

  it("rejects unknown fields and IDs, and distinguishes unsupported host capabilities", async () => {
    const f = await create();
    for (const request of [
      { operation: "plant", input: { ...plant.input, growthUnits: 100 } },
      { operation: "get", input: { farmId: "native-farm" }, options: { expectedRevision: 0 } },
      {
        operation: "irrigate",
        input: { farmId: "native-farm", plotId: "native/a" },
        options: { expectedGroundRevision: -1 }
      }
    ])
      expect(await f.api.execute(request as any)).toMatchObject({ ok: false, error: { code: "INVALID_ARGUMENT" } });
    expect(await f.api.execute({ operation: "get", input: { farmId: "unknown" } })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" }
    });
    expect(await f.api.execute({ operation: "getTarget", input: { farmId: "native-farm" } })).toMatchObject({
      ok: false,
      error: { code: "NOT_SUPPORTED" }
    });
  });

  it("saves current state and restores identical crop identity, soil, inventory and receipts", async () => {
    const f = await create();
    await f.api.execute(plant);
    await f.api.execute({ operation: "irrigate", input: { farmId: "native-farm", plotId: "native/a" } });
    f.clock.advanceBy(6000);
    const saved = await farmingAreaComponentData(f.area, (r) => (r === f.resources.catalog ? 0 : 1));
    const snapshot = saved.props.configuration.snapshot!;
    const restored = await create("native-farm", {}, { snapshot });
    expect(restored.area.service.getSnapshot()).toEqual(snapshot);
    expect(saved.props.configuration.catalog).toEqual({ $ref: 0 });
    for (const resource of Object.values(f.resources))
      expect(parseFarmingResource(f.engine, serializeFarmingResource(resource)).data).toEqual(resource.data);
    expect(restored.area.service).not.toBe(f.area.service);
    expect(
      await restored.api.execute({
        operation: "verify",
        input: { farmId: "native-farm", commandId: snapshot.recentReceipts[0].commandId }
      })
    ).toMatchObject({ ok: true });
  });

  it("prefers an explicitly injected existing repository over embedded Scene state", async () => {
    const original = await create();
    const initial = original.area.service.getSnapshot();
    await original.api.execute(plant);
    const repository = new MemoryFarmRepository();
    repository.seed(original.area.service.getSnapshot());
    const restored = await create("native-farm", { repository }, { snapshot: initial });
    expect(Object.keys(restored.area.service.getSnapshot().crops)).toHaveLength(1);
  });

  it("rejects incompatible snapshots without replacing repository records", async () => {
    const original = await create();
    const repository = new MemoryFarmRepository();
    const snapshot = { ...original.area.service.getSnapshot(), definitionSetVersion: 999 };
    repository.seed(snapshot);
    const restored = nativeFixture("native-farm", { repository });
    fixtures.push(restored);
    await expect(restored.ready).rejects.toThrow(/definition version/);
    expect(await repository.read("native-farm")).toEqual(snapshot);
  });

  it("isolates shared resources and rejects duplicate Scene IDs without breaking the first area", async () => {
    const f = await create();
    const other = f.root("other").addComponent(FarmingAreaComponent);
    await other.configure({ ...f.config, farmId: "other" });
    await f.api.execute(plant);
    expect(Object.keys(other.service.getSnapshot().crops)).toHaveLength(0);
    const duplicate = f.root("duplicate").addComponent(FarmingAreaComponent);
    await expect(duplicate.configure(f.config)).rejects.toThrow(/重复/);
    expect((await f.api.execute({ operation: "list", input: {} })).ok).toBe(true);
    await other.dispose();
    expect(f.system.areas).toHaveLength(1);
    expect(f.area.service.getSnapshot().crops).not.toEqual({});
  });

  it("retains exact write requests on storage retry and protects against changed payload reuse", async () => {
    const repository = new MemoryFarmRepository(),
      f = await create("native-farm", { repository });
    const request = { ...plant, options: { commandId: "storage-retry" } };
    repository.failNextTransaction = true;
    expect(await f.api.execute(request)).toMatchObject({
      ok: false,
      error: { code: "STORAGE_FAILURE", retryable: true }
    });
    const result = await f.api.execute(request);
    expect(result.ok).toBe(true);
    expect(await f.api.execute(request)).toMatchObject({ ok: true, value: { receipt: { replayed: true } } });
    expect(await f.api.execute({ ...request, input: { ...plant.input, seedId: "herb-seed" } })).toMatchObject({
      ok: false,
      error: { code: "INVALID_COMMAND" }
    });
    expect(Object.keys(f.area.service.getSnapshot().crops)).toHaveLength(1);
  });

  it("keeps captured management revisions for retries and rejects resource version mismatch", async () => {
    const f = await create();
    const request = {
      operation: "updatePlot",
      input: { farmId: "native-farm", plotId: "native/a", patch: { label: "Updated" } },
      options: { commandId: "rename" }
    } as const;
    const result = await f.api.execute(request);
    expect(result.ok).toBe(true);
    expect(await f.api.execute(request)).toMatchObject({ ok: true, value: { receipt: { replayed: true } } });
    expect(await f.api.execute({ ...request, input: { ...request.input, patch: { label: "Changed" } } })).toMatchObject(
      { ok: false, error: { code: "INVALID_COMMAND" } }
    );
    const { FarmingRulesResource, farmingDefinitions } = await import("../../src/farming/native/FarmingResources");
    const rules = new FarmingRulesResource(f.engine, { ...f.resources.rules.data, version: 2 });
    expect(() => farmingDefinitions(f.resources.catalog, rules)).toThrow(/版本/);
  });

  it("preserves explicit revisions during animation preparation", async () => {
    const f = await create();
    f.area.coordinator.presentation = {
      prepare: async () => {
        f.clock.advanceBy(3000);
        await f.area.service.checkpoint();
        return true;
      }
    };
    const result = await f.api.execute({ ...plant, options: { commandId: "explicit-revision", expectedRevision: 0 } });
    expect(result).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(f.area.service.getPlot("native/a")?.crop).toBeNull();
  });

  it("replays original and resolved requests after API and snapshot restoration without poisoned bindings", async () => {
    const f = await create();
    const request = { ...plant, options: { commandId: "durable-plant" } };
    const planted = await f.api.execute(request);
    if (!planted.ok) throw new Error(planted.error.message);
    const renamed = {
      operation: "updatePlot",
      input: { farmId: f.area.farmId, plotId: "native/a", patch: { label: "Durable" } },
      options: { commandId: "durable-label" }
    } as const;
    await f.api.execute(renamed);
    const restored = await create("native-farm", {}, { snapshot: f.area.service.getSnapshot() });
    for (const api of [new FarmingAPI(f.system), restored.api]) {
      expect(await api.execute({ ...request, input: { ...plant.input, seedId: "herb-seed" } })).toMatchObject({
        ok: false,
        error: { code: "INVALID_COMMAND" }
      });
      expect(await api.execute({ ...request, options: { ...request.options, expectedRevision: 999 } })).toMatchObject({
        ok: false,
        error: { code: "INVALID_COMMAND" }
      });
      for (const retry of [request, planted.value.request, renamed])
        expect(await api.execute(retry)).toMatchObject({ ok: true, value: { receipt: { replayed: true } } });
    }
    expect(Object.keys(restored.area.service.getSnapshot().crops)).toHaveLength(1);
    expect(restored.area.service.getSnapshot().recentReceipts.map((receipt) => receipt.commandId)).toEqual([
      "durable-plant/tool",
      "durable-plant/pickup",
      "durable-plant",
      "durable-label"
    ]);
  });

  it("restores the captured hoe instance rather than binding a retry to the newly planted crop", async () => {
    const f = await create();
    await f.api.execute(plant);
    const plot = f.area.service.getPlot("native/a")!;
    const request = {
      operation: "hoe",
      input: { farmId: f.area.farmId, target: { groundId: plot.groundId, cellX: plot.cellX, cellZ: plot.cellZ } },
      options: { commandId: "durable-hoe" }
    } as const;
    const hoed = await f.api.execute(request);
    if (!hoed.ok) throw new Error(hoed.error.message);
    await f.api.execute(plant);
    const restored = await create("native-farm", {}, { snapshot: f.area.service.getSnapshot() });
    const nextId = restored.area.service.getPlot("native/a")!.crop!.instanceId;
    expect(await restored.api.execute(request)).toMatchObject({ ok: true, value: { receipt: { replayed: true } } });
    expect(await restored.api.execute(hoed.value.request)).toMatchObject({
      ok: true,
      value: { receipt: { replayed: true } }
    });
    expect(restored.area.service.getPlot("native/a")!.crop!.instanceId).toBe(nextId);
    expect(restored.area.service.getSnapshot().inventory).toEqual({});
  });

  it("restores harvest deduplication without repeating inventory or basket effects", async () => {
    const f = await create();
    await f.api.execute(plant);
    await f.api.execute({ operation: "irrigate", input: { farmId: f.area.farmId, plotId: "native/a" } });
    f.clock.advanceBy(15000);
    await f.area.service.checkpoint();
    const request = {
      operation: "harvest",
      input: {
        farmId: f.area.farmId,
        plotId: "native/a",
        cropInstanceId: f.area.service.getPlot("native/a")!.crop!.instanceId
      },
      options: { commandId: "durable-harvest" }
    } as const;
    const harvested = await f.api.execute(request);
    expect(harvested.ok).toBe(true);
    const restored = await create("native-farm", {}, { snapshot: f.area.service.getSnapshot() });
    const prepare = vi.fn(async () => true),
      committed = vi.fn();
    restored.area.coordinator.presentation = { prepare, committed };
    expect(await restored.api.execute(request)).toMatchObject({ ok: true, value: { receipt: { replayed: true } } });
    expect(restored.area.service.getSnapshot().inventory).toEqual(f.area.service.getSnapshot().inventory);
    expect(prepare).not.toHaveBeenCalled();
    expect(committed).not.toHaveBeenCalled();
  });

  it("shares uncommitted bindings across API instances and keeps the storage retry's original revision", async () => {
    const repository = new MemoryFarmRepository(),
      f = await create("native-farm", { repository });
    const request = {
      operation: "updatePlot",
      input: { farmId: f.area.farmId, plotId: "native/a", patch: { label: "Retry" } },
      options: { commandId: "retry-management" }
    } as const;
    repository.failNextTransaction = true;
    expect(await f.api.execute(request)).toMatchObject({ ok: false, error: { code: "STORAGE_FAILURE" } });
    f.clock.advanceBy(3000);
    await f.area.service.checkpoint();
    const api = new FarmingAPI(f.system);
    expect(await api.execute(request)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(f.area.service.getPlot("native/a")!.label).toBe("A");
    expect(
      await api.execute({
        ...request,
        options: { ...request.options, expectedRevision: f.area.service.getSnapshot().revision }
      })
    ).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
  });

  for (const operation of ["plant", "updatePlot"] as const)
    it(`uses the authoritative committed ${operation} binding when another runtime has not received notifications`, async () => {
      const repository = new MemoryFarmRepository();
      const f = await create("native-farm", { repository });
      const silentRepository = {
        read: repository.read.bind(repository),
        transact: repository.transact.bind(repository),
        subscribe: () => () => {},
        dispose: () => {}
      };
      const stale = await create("native-farm", { repository: silentRepository });
      f.clock.advanceBy(3000);
      await f.area.service.checkpoint();
      expect(stale.area.service.getSnapshot().revision).toBe(0);
      const request =
        operation === "plant"
          ? { ...plant, options: { commandId: "multi-runtime" } }
          : {
              operation: "updatePlot" as const,
              input: { farmId: "native-farm", plotId: "native/a", patch: { label: "Committed" } },
              options: { commandId: "multi-runtime" }
            };
      const committed = await f.api.execute(request);
      if (!committed.ok) throw new Error(committed.error.message);
      expect(f.area.service.getCommandBinding("multi-runtime")?.command.expectedRevision).toBe(
        committed.value.receipt.revision - 1
      );
      const replay = await stale.api.execute(request);
      if (!replay.ok) throw new Error(replay.error.message);
      expect(replay.value.receipt.replayed).toBe(true);
      expect(replay.value.request).toEqual(committed.value.request);
      const restored = await create("native-farm", {}, { snapshot: stale.area.service.getSnapshot() });
      expect(await restored.api.execute(replay.value.request)).toMatchObject({
        ok: true,
        value: { receipt: { replayed: true } }
      });
      expect(restored.area.service.getSnapshot().recentReceipts).toHaveLength(operation === "plant" ? 3 : 1);
    });

  it("validates saved bindings against their command receipts", async () => {
    const f = await create();
    await f.api.execute({ ...plant, options: { commandId: "saved-binding" } });
    const snapshot = structuredClone(f.area.service.getSnapshot());
    (snapshot.recentReceipts[0].binding!.command as any).expectedRevision = 999;
    const repository = new MemoryFarmRepository();
    repository.seed(snapshot);
    const restored = nativeFixture("native-farm", { repository });
    fixtures.push(restored);
    await expect(restored.ready).rejects.toThrow(/INVALID_SNAPSHOT.*binding/);
    expect(restored.area.canRetryInitialization).toBe(false);
    expect(await repository.read("native-farm")).toEqual(snapshot);
  });

  it("rejects registered area transfers, cancels waits and never uses the previous Scene's dependencies", async () => {
    const f = await create(),
      target = await create("other");
    const previous = f.area.service;
    f.area.coordinator.presentation = { prepare: () => new Promise(() => {}) };
    const pending = f.api.execute(plant);
    await vi.waitFor(() => expect((f.area.coordinator as any).active).toBeDefined());
    (f.scene.rootEntities as any[]).splice((f.scene.rootEntities as any[]).indexOf(f.area.entity), 1);
    (f.area.entity as any).scene = target.scene;
    (target.scene.rootEntities as any[]).push(f.area.entity);
    expect(
      await target.api.execute({ operation: "getPlot", input: { farmId: f.area.farmId, plotId: "native/a" } })
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await pending).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
    expect(() => f.area.service).toThrow(/CONFLICT/);
    expect(() => previous.getGroundRevision()).toThrow(/CONFLICT/);
    expect(previous.getSnapshot().crops).toEqual({});
    expect(f.system.areas).toHaveLength(0);
    const replacement = f.root("replacement").addComponent(FarmingAreaComponent);
    await replacement.configure(f.config);
    expect(replacement.initialized).toBe(true);
    await f.area.dispose();
  });

  it("releases the original Scene registry when a FarmingSystem is transferred", async () => {
    const f = await create(),
      target = await create("other");
    (f.system.entity as any).scene = target.scene;
    expect(await f.api.execute({ operation: "list", input: {} })).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" }
    });
    await f.system.dispose();
    expect(nativeFarmingOwners.has(f.scene)).toBe(false);
    expect(nativeFarmingOwners.get(target.scene)).toBe(target.system);
    const replacement = f.root("new system").addComponent(FarmingSystem);
    replacement.configureRuntime(() => ({ groundProvider: TEST_GROUND_PROVIDER, clock: f.clock }));
    expect(replacement.isDisposed).toBe(false);
    await replacement.dispose();
  });

  it("recovers a transient initialization storage failure once and shares retries between callers", async () => {
    const repository = new MemoryFarmRepository();
    repository.failNextTransaction = true;
    const subscribe = vi.spyOn(repository, "subscribe"),
      transact = vi.spyOn(repository, "transact");
    const f = nativeFixture("native-farm", { repository });
    fixtures.push(f);
    const first = await f.api.execute({ operation: "queryPlots", input: { farmId: f.area.farmId } });
    expect(first).toMatchObject({ ok: false, error: { code: "STORAGE_FAILURE", retryable: true } });
    expect(subscribe).not.toHaveBeenCalled();
    const retries = await Promise.all([
      f.api.execute(plant),
      f.api.execute({ operation: "queryPlots", input: { farmId: f.area.farmId } })
    ]);
    expect(retries.every((r) => r.ok)).toBe(true);
    expect(transact).toHaveBeenCalledTimes(5); // failed load, shared successful load, tool generation, pickup, plant
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(f.area.lastError).toBeUndefined();
    expect(Object.keys(f.area.service.getSnapshot().crops)).toHaveLength(1);
    expect((f.resources.catalog as any).refs).toBe(1);
  });

  it("starts configured areas when the host subsequently injects missing dependencies", async () => {
    const f = await create();
    await f.system.dispose();
    const system = f.root("late configured system").addComponent(FarmingSystem);
    try {
      const area = f.root("late configured area").addComponent(FarmingAreaComponent);
      await expect(area.configure(f.config)).rejects.toThrow(/MISSING_DEPENDENCY/);
      system.configureRuntime(() => ({
        storagePresentation: false,
        groundProvider: TEST_GROUND_PROVIDER,
        clock: f.clock
      }));
      await area.ready;
      expect(area.initialized).toBe(true);
      expect(
        await new FarmingAPI(system).execute({ operation: "queryPlots", input: { farmId: area.farmId } })
      ).toMatchObject({ ok: true });
    } finally {
      await system.dispose();
    }
  });

  it("keeps permanent invalid saves non-retryable and never overwrites them", async () => {
    const original = await create();
    const snapshot = { ...original.area.service.getSnapshot(), definitionSetVersion: 999 };
    const repository = new MemoryFarmRepository();
    repository.seed(snapshot);
    const transact = vi.spyOn(repository, "transact"),
      f = nativeFixture("native-farm", { repository });
    fixtures.push(f);
    for (let i = 0; i < 2; i++)
      expect(await f.api.execute({ operation: "queryPlots", input: { farmId: f.area.farmId } })).toMatchObject({
        ok: false,
        error: { code: "INVALID_SNAPSHOT", retryable: false }
      });
    await expect(f.area.retryInitialization()).rejects.toThrow(/INVALID_SNAPSHOT/);
    expect(transact).toHaveBeenCalledTimes(1);
    expect(await repository.read(f.area.farmId)).toEqual(snapshot);
  });

  it("performs only one initialization attempt per API request when storage remains unavailable", async () => {
    const repository = new MemoryFarmRepository();
    const transact = vi.spyOn(repository, "transact").mockRejectedValue(new Error("storage unavailable"));
    const f = nativeFixture("native-farm", { repository });
    fixtures.push(f);
    for (let i = 0; i < 3; i++) {
      expect(await f.api.execute({ operation: "queryPlots", input: { farmId: f.area.farmId } })).toMatchObject({
        ok: false,
        error: { code: "STORAGE_FAILURE", retryable: true }
      });
      expect(transact).toHaveBeenCalledTimes(i + 1);
    }
    expect(f.area.initialized).toBe(false);
  });

  it("cancels initialization retries on disposal without late subscriptions or retained references", async () => {
    const repository = new MemoryFarmRepository();
    repository.failNextTransaction = true;
    const f = nativeFixture("native-farm", { repository });
    fixtures.push(f);
    await expect(f.ready).rejects.toThrow(/STORAGE_FAILURE/);
    const subscribe = vi.spyOn(repository, "subscribe"),
      original = repository.transact.bind(repository);
    vi.spyOn(repository, "transact").mockImplementation(async (id, initial, operation, signal) => {
      await cancellable(new Promise(() => {}), signal!);
      return original(id, initial, operation, signal);
    });
    const retry = f.api.execute({ operation: "queryPlots", input: { farmId: f.area.farmId } });
    await f.area.dispose();
    expect(await retry).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
    expect(subscribe).not.toHaveBeenCalled();
    expect((f.resources.catalog as any).refs).toBe(0);
    expect(await repository.read(f.area.farmId)).toBeUndefined();
  });

  for (const cancellation of ["cancel", "abort", "dispose"] as const)
    it(`cancels pending first-load preparation immediately via ${cancellation}`, async () => {
      const f = await create();
      await f.api.execute(plant);
      await f.api.execute({ operation: "irrigate", input: { farmId: "native-farm", plotId: "native/a" } });
      f.clock.advanceBy(15000);
      await f.area.service.checkpoint();
      let loaded!: (value: boolean) => void;
      const pending = new Promise<boolean>((resolve) => {
        loaded = resolve;
      });
      const cancel = vi.fn();
      f.area.coordinator.presentation = { prepare: () => pending, cancel };
      const controller = new AbortController();
      const input = {
        farmId: "native-farm",
        plotId: "native/a",
        cropInstanceId: f.area.service.getPlot("native/a")!.crop!.instanceId
      };
      const harvest = f.api.execute({ operation: "harvest", input }, controller.signal);
      await vi.waitFor(() => expect((f.area.coordinator as any).active).toBeDefined());
      if (cancellation === "cancel") f.area.coordinator.cancel();
      else if (cancellation === "abort") controller.abort();
      else await f.area.dispose();
      expect(await harvest).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
      expect(f.area.service.getPlot("native/a")!.crop).not.toBeNull();
      expect(f.area.service.getSnapshot().inventory).toEqual({});
      loaded(true);
      await Promise.resolve();
      expect(f.area.service.getSnapshot().inventory).toEqual({});
    });

  it("keeps committed success when presentation fails", async () => {
    const f = await create();
    f.area.coordinator.presentation = {
      prepare: async () => true,
      committed: () => {
        throw new Error("visual failed");
      }
    };
    expect(await f.api.execute(plant)).toMatchObject({
      ok: true,
      value: { receipt: { ok: true }, presentation: { status: "failed" } }
    });
    expect(f.area.service.getPlot("native/a")?.crop?.cropId).toBe("berry");
  });

  it("aborting also cancels a harvest waiting for an uncommitted storage transaction", async () => {
    const repository = new MemoryFarmRepository(),
      f = await create("native-farm", { repository });
    await f.api.execute(plant);
    await f.api.execute({ operation: "irrigate", input: { farmId: f.area.farmId, plotId: "native/a" } });
    f.clock.advanceBy(15000);
    await f.area.service.checkpoint();
    const original = repository.transact.bind(repository);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transaction = vi
      .spyOn(repository, "transact")
      .mockImplementation(async (farmId, initial, operation, signal) => {
        await cancellable(blocked, signal!);
        return original(farmId, initial, operation, signal);
      });
    f.area.coordinator.presentation = { prepare: async () => true };
    const controller = new AbortController();
    const request = {
      operation: "harvest",
      input: {
        farmId: f.area.farmId,
        plotId: "native/a",
        cropInstanceId: f.area.service.getPlot("native/a")!.crop!.instanceId
      }
    } as const;
    const pending = f.api.execute(request, controller.signal);
    await vi.waitFor(() => expect(transaction).toHaveBeenCalled());
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
    release();
    await f.area.service.whenIdle();
    expect(f.area.service.getPlot("native/a")!.crop!.instanceId).toBe(request.input.cropInstanceId);
    expect(f.area.service.getSnapshot().inventory).toEqual({});
  });

  it("cancellation after the durable receipt never reports a committed mutation as failed", async () => {
    const f = await create(),
      controller = new AbortController();
    f.area.coordinator.presentation = { prepare: async () => true, committed: () => controller.abort() };
    expect(await f.api.execute(plant, controller.signal)).toMatchObject({
      ok: true,
      value: { receipt: { ok: true }, presentation: { status: "cancelled" } }
    });
    expect(f.area.service.getPlot("native/a")!.crop!.cropId).toBe("berry");
  });

  it.each(["showBasket", "hideBasket", "getBasket"])(
    "rejects the removed %s API without mutating persistent state",
    async (operation) => {
      const f = await create();
      const before = f.area.service.getSnapshot();
      const result = await f.api.execute({ operation, input: { farmId: f.area.farmId } } as unknown as FarmingRequest);
      expect(result).toMatchObject({ ok: false, error: { code: "NOT_SUPPORTED" } });
      expect(f.area.service.getSnapshot()).toEqual(before);
      expect(Object.keys(FARMING_API_CONTRACT)).not.toContain(operation);
    }
  );

  it("disposal during initialization never installs subscriptions after cancellation", async () => {
    const repository = new MemoryFarmRepository(),
      subscribe = vi.spyOn(repository, "subscribe");
    const f = nativeFixture("native-farm", { repository });
    fixtures.push(f);
    await f.area.dispose();
    await expect(f.ready).rejects.toBeDefined();
    expect(subscribe).not.toHaveBeenCalled();
    expect(await repository.read("native-farm")).toBeUndefined();
  });
});

describe("deterministic instruction replay through the generic Agent Script runtime", () => {



  for (const test of FARMING_INSTRUCTION_CASES)
    it(test.id, async () => {
      const definitions =
        test.id === "diagnose"
          ? {
              ...TEST_FARMING_DEFINITIONS,
              soilProfile: { ...TEST_FARMING_DEFINITIONS.soilProfile, initialMoistureUnits: 0 }
            }
          : TEST_FARMING_DEFINITIONS;
      const repository = new MemoryFarmRepository();
      const f = await create("native-farm", { repository }, {}, definitions);
      if (
        !["discover", "plant", "conflict", "conflict-requery", "storage-retry", "basket-not-carried"].includes(test.id)
      )
        await f.api.execute(plant);
      if (["harvest", "basket-place"].includes(test.id)) {
        await f.api.execute({ operation: "irrigate", input: { farmId: "native-farm", plotId: "native/a" } });
        f.clock.advanceBy(15000);
        await f.area.service.checkpoint();
      }
      if (["conflict", "conflict-requery"].includes(test.id)) {
        f.clock.advanceBy(3000);
        await f.area.service.checkpoint();
      }
      if (test.id === "storage-retry") repository.failNextTransaction = true;
      if (test.id === "target")
        f.area.coordinator.presentation = {
          prepare: async () => true,
          getTarget: () => ({ plotId: "native/a", ground: null })
        };
      if (test.id === "basket-place") {
        await f.api.execute({
          operation: "harvest",
          input: {
            farmId: "native-farm",
            plotId: "native/a",
            cropInstanceId: f.area.service.getPlot("native/a")!.crop!.instanceId
          }
        });
        expect(f.area.service.getSnapshot().items.instances.some((item) => item.contents.length > 0)).toBe(true);
      }
      const beforeInventory = f.area.service.getSnapshot().inventory;
      const evidence = await replayFarmingInstruction(f.api, test, { farmId: "native-farm", plotId: "native/a" });
      expect(evidence.passed).toBe(true);
      if (test.expectedError) expect(f.area.service.getSnapshot().inventory).toEqual(beforeInventory);
      if (["immature", "delete-occupied"].includes(test.id))
        expect(f.area.service.getPlot("native/a")!.crop).not.toBeNull();
    });
});

it("retains shared catalog/rules for each component reference and releases them without destroying assets", async () => {
  const f = await create();
  const catalog = f.resources.catalog as typeof f.resources.catalog & {refs:number};
  const rules = f.resources.rules as typeof f.resources.rules & {refs:number};
  const initial = {catalog:catalog.refs,rules:rules.refs};
  f.system.catalog = catalog;
  f.system.rules = rules;
  f.system.catalog = catalog;
  expect(catalog.refs).toBe(initial.catalog + 1);
  expect(rules.refs).toBe(initial.rules + 1);
  const replacement = createFarmingResources(f.engine, TEST_FARMING_DEFINITIONS);
  f.system.catalog = replacement.catalog;
  expect(catalog.refs).toBe(initial.catalog);
  expect((replacement.catalog as typeof catalog).refs).toBe(1);
  await f.system.dispose();
  expect((replacement.catalog as typeof catalog).refs).toBe(0);
  expect(catalog.refs).toBe(0);
  expect(rules.refs).toBe(0);
  expect(catalog.destroyed).toBe(false);
});

it("releases a host binding without disposing its authored component or a later binding", async () => {
  const f = await create();
  const entity = {engine:f.engine,scene:{rootEntities:[]}} as unknown as typeof f.area.entity;
  const owner = new FarmingSystem(entity);
  (owner as any).entity = entity;
  owner.onAwake();
  const first = () => ({groundProvider:TEST_GROUND_PROVIDER});
  const release = owner.configureRuntime(first);
  release();
  expect(owner.isDisposed).toBe(false);
  const second = () => ({groundProvider:TEST_GROUND_PROVIDER,clock:f.clock});
  const releaseSecond = owner.configureRuntime(second);
  release();
  expect(owner.dependencies(f.area).clock).toBe(f.clock);
  releaseSecond();
  expect(() => owner.dependencies(f.area)).toThrow("MISSING_DEPENDENCY");
  await owner.dispose();
});
