import * as templates from "@galacean/engine-world-planning/spatial/WorldTemplateAuthoring";
import { afterEach, expect, it, vi } from "vitest";
import { PlanningWorkerClient } from "../../demos/seed-world/src/planning/semantic-study/PlanningWorkerClient.ts";
import { createPlanningWorkerRuntime, type PlanningWorkerRequest, type PlanningWorkerResponse } from "../../demos/seed-world/src/planning/semantic-study/PlanningWorkerRuntime.ts";
import { planningRuntimeSignature } from "@galacean/engine-world-planning/spatial/PlanningRuntime";
import * as planningRuntime from "@galacean/engine-world-planning/spatial/PlanningRuntime";
import { createSpatialWorldBase } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { createSeedPlanningInputs } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import * as initialization from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { PlanningProjectStorage } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningProjectStorage.ts";
import { exportPlanningScene } from "../../demos/seed-world/src/planning/spatial/PlanningSceneAsset.ts";
import { exportPlanningAuthoring } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { importRuntimeHierarchy } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-hierarchy-source";
import { RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";

class WorkerStub {
  static instances: WorkerStub[] = [];
  onmessage?: (event: { data: PlanningWorkerResponse }) => void;
  onerror?: (event: { message: string }) => void;
  requests: PlanningWorkerRequest[] = [];
  terminated = false;
  constructor() { WorkerStub.instances.push(this); }
  postMessage(request: PlanningWorkerRequest) { this.requests.push(structuredClone(request)); }
  terminate() { this.terminated = true; }
  respond(response: PlanningWorkerResponse) { this.onmessage?.({ data: structuredClone(response) }); }
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); WorkerStub.instances = []; });

it("queues initialization on the worker, forwards progress and reuses the worker for generation", async () => {
  vi.stubGlobal("Worker", WorkerStub);
  const client = new PlanningWorkerClient(), progress = vi.fn();
  client.onProgress = progress;
  const document = createSeedPlanningInputs(1);
  const pending = client.initialize(1);
  const worker = WorkerStub.instances[0];
  expect(worker.requests[0]).toMatchObject({ type: "initialize", seed: 1 });
  expect(client.busy).toBe(true);
  worker.respond({ type: "progress", requestId: worker.requests[0].requestId, stage: "初始化布局参数" });
  expect(progress).toHaveBeenCalledWith("初始化布局参数");
  worker.respond({ type: "initialized", requestId: worker.requests[0].requestId, document, elapsedMs: 12 });
  expect(await pending).toEqual(document);
  expect(client.busy).toBe(false);
  const next = client.run({ seed: 1 } as any, {}, undefined, document);
  expect(WorkerStub.instances).toHaveLength(1);
  expect(worker.requests[1]).toMatchObject({ document });
  worker.respond({ type: "error", requestId: worker.requests[1].requestId, message: "solve rejected" });
  await expect(next).rejects.toThrow("solve rejected");
  client.dispose();
});

it("initializes the selected theme without preparing the default world first", () => {
  const document = createSeedPlanningInputs(7);
  const selected = vi.spyOn(templates, "createTemplatePlanningDocument").mockReturnValue(document);
  const defaults = vi.spyOn(initialization, "prepareSeedPlanningDocument");
  const responses: PlanningWorkerResponse[] = [];
  createPlanningWorkerRuntime(message => responses.push(message))({
    type: "initialize", requestId: 1, runtimeSignature: planningRuntimeSignature(), seed: 7, templateId: "titan-wasteland"
  });
  expect(selected).toHaveBeenCalledWith(7, "titan-wasteland");
  expect(defaults).not.toHaveBeenCalled();
  expect(responses.at(-1)).toMatchObject({ type: "initialized", document });
});

it("terminates cancelled initialization, ignores late results and propagates worker failures", async () => {
  vi.stubGlobal("Worker", WorkerStub);
  const client = new PlanningWorkerClient(), abort = new AbortController();
  const pending = client.initialize(7, abort.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  const oldWorker = WorkerStub.instances[0];
  abort.abort();
  await rejected;
  expect(oldWorker.terminated).toBe(true);
  expect(client.busy).toBe(false);
  const next = client.initialize(8);
  oldWorker.respond({ type: "initialized", requestId: oldWorker.requests[0].requestId, document: createSeedPlanningInputs(7), elapsedMs: 1 });
  expect(client.busy).toBe(true);
  WorkerStub.instances[1].onerror!({ message: "worker failed" });
  await expect(next).rejects.toThrow("worker failed");
  expect(WorkerStub.instances[1].terminated).toBe(true);
  client.dispose();
});

it("reuses only matching prepared authoring and sends a complete first result", () => {
  const document = createSeedPlanningInputs(1);
  const result = { plan: createSpatialWorldBase(exportPlanningRecipe(document)), accepted: true, checks: [], execution: "full" } as any;
  const prepare = vi.spyOn(initialization, "prepareSeedPlanningDocument").mockReturnValue({ document, result });
  const generate = vi.spyOn(planningRuntime, "generatePlanningDocument").mockReturnValue(result);
  const responses: PlanningWorkerResponse[] = [];
  const run = createPlanningWorkerRuntime(message => responses.push(structuredClone(message)));
  const runtimeSignature = planningRuntimeSignature();
  run({ type: "initialize", requestId: 1, runtimeSignature, seed: 1 });
  expect(prepare).toHaveBeenCalledWith(1);
  const session = new PlanningSession(exportPlanningRecipe(document), undefined, document);
  const restored = session.export();
  run({ requestId: 2, runtimeSignature, document: restored, ...exportPlanningRecipe(restored) });
  expect(generate.mock.calls[0][1]).toBe(result);
  expect(responses.at(-1), JSON.stringify(responses.at(-1))).toMatchObject({ type: "result", requestId: 2 });
  run({ type: "initialize", requestId: 3, runtimeSignature, seed: 1 });
  const edited = structuredClone(restored);
  edited.entities.world.components.population = { values: { villageMin: 0, villageMax: 0, buildingMin: 0, buildingMax: 20 } };
  run({ requestId: 4, runtimeSignature, document: edited, ...exportPlanningRecipe(edited) });
  expect(generate.mock.calls[1][1]).toBeUndefined();
  expect(responses.at(-1)).toMatchObject({ type: "result", requestId: 4 });
});


it("matches cold generation after real worker initialization and session authoring normalization", () => {
  const responses: PlanningWorkerResponse[] = [];
  const run = createPlanningWorkerRuntime(message => responses.push(structuredClone(message)));
  const runtimeSignature = planningRuntimeSignature();
  run({ type: "initialize", requestId: 1, runtimeSignature, seed: 1 });
  const initialized = responses.at(-1);
  expect(initialized?.type).toBe("initialized");
  if (initialized?.type !== "initialized") throw Error(JSON.stringify(initialized));
  const session = new PlanningSession(exportPlanningRecipe(initialized.document), undefined, initialized.document);
  const document = session.export();
  const generate = vi.spyOn(planningRuntime, "generatePlanningDocument");
  run({ requestId: 2, runtimeSignature, document, ...exportPlanningRecipe(document) });
  expect(generate.mock.calls[0][1]).toBeDefined();
  generate.mockRestore();
  const published = responses.at(-1);
  expect(published?.type).toBe("result");
  if (published?.type !== "result") throw Error(JSON.stringify(published));
  const cold = planningRuntime.generatePlanningDocument(document);
  expect(published.result.accepted).toBe(true);
  for (const key of ["buildings", "rocks", "routes", "roadGraph", "bridges", "roadApproaches", "landscapes", "flowerRegions", "farming", "waters", "poiDistribution", "visualGuidance"] as const)
    expect(published.result.plan[key], key).toEqual(cold.plan[key]);
  expect(published.result.checks).toEqual(cold.checks);
}, 60000);


it("resets through a live project transaction, retaining the prior document on publish failure and replaying success", async () => {
  let requestId = 0;
  const messages: PlanningWorkerResponse[] = [];
  const runtimeSignature = planningRuntimeSignature();
  const run = createPlanningWorkerRuntime(message => messages.push(structuredClone(message)));
  const execute = async (document: ReturnType<typeof createSeedPlanningInputs>, previousSnapshot?: any) => {
    run({ requestId: ++requestId, runtimeSignature, document,
      previousRequestId: previousSnapshot?.planningWorkerToken?.requestId,
      previousHeightToken: previousSnapshot ? "unrelated-previous-height" : undefined,
      ...exportPlanningRecipe(document) });
    const response = messages.at(-1);
    if (response?.type !== "result") throw Error(JSON.stringify(response));
    response.result.planningWorkerToken = { owner: 0, generation: 0, requestId };
    return response.result;
  };
  const original = createSeedPlanningInputs(1);
  original.entities.world.components.population = { values: { villageMin: 0, villageMax: 0, buildingMin: 0, buildingMax: 0 } };
  const session = new PlanningSession(exportPlanningRecipe(original), execute, original, { history: false });
  await session.initialize();
  const originalDocument = session.export(), originalResult = session.result;
  const path = "World.scene", files = [{ virtualPath: path, path: "runtime-world:scene", type: "Scene" },
    { virtualPath: "keep.json", path: "runtime-world:keep", type: "JSON" }];
  let pack: RuntimeProjectPackage = { version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: path, files },
    contents: { [path]: JSON.stringify(importRuntimeHierarchy(exportPlanningScene(originalDocument), path, files, () => true)), "keep.json": '{"retained":true}' } };
  const originalPack = structuredClone(pack);
  let fail = true;
  const project = { get projectPackage() { return pack; }, async publish(next: RuntimeProjectPackage) {
    if (fail) throw Error("publication failed");
    pack = structuredClone(next);
  } };
  const storage = new PlanningProjectStorage(project);
  const reset = async () => {
    const transaction = session.beginProjectEdit();
    try {
      const prepared = vi.spyOn(initialization, "prepareSeedPlanningDocument");
      run({ type: "initialize", requestId: ++requestId, runtimeSignature, seed: 1 });
      const response = messages.at(-1);
      if (response?.type !== "initialized") throw Error(JSON.stringify(response));
      const expectedBaseline = prepared.mock.results[0].value.result;
      prepared.mockRestore();
      const generation = vi.spyOn(planningRuntime, "generatePlanningDocument");
      const receipt = await transaction.session.load(response.document);
      expect(receipt.status, receipt.message).toBe("accepted");
      expect(generation.mock.calls.at(-1)![1]).toBe(expectedBaseline);
      generation.mockRestore();
      await transaction.prepare(new AbortController().signal);
      await storage.save(transaction.session.export(), "reset-transaction");
      transaction.commit();
    } finally { await transaction.discard(); }
  };
  await expect(reset()).rejects.toThrow("publication failed");
  expect(session.export()).toEqual(originalDocument);
  expect(session.result).toBe(originalResult);
  expect(pack).toEqual(originalPack);
  fail = false;
  await reset();
  expect(pack.contents["keep.json"]).toBe('{"retained":true}');
  pack = JSON.parse(JSON.stringify(pack));
  const saved = (await new PlanningProjectStorage(project).load(1))!;
  expect(exportPlanningAuthoring(saved)).toEqual(session.export());
  const cold = planningRuntime.generatePlanningDocument(saved);
  for (const key of ["buildings", "rocks", "routes", "roadGraph", "bridges", "roadApproaches", "landscapes", "flowerRegions", "waters", "poiDistribution", "visualGuidance"] as const)
    expect(session.result!.plan[key], key).toEqual(cold.plan[key]);
  expect(session.result!.checks).toEqual(cold.checks);
}, 60000);
