import { afterEach, expect, it, vi } from "vitest";
import type { IslandPlan } from "../../../packages/world-planning/src/semantic-study/IslandPlanModel.ts";
import type { RockFormationJob, RockFormationMesh } from "../../../packages/terrain/src/rock-formation/types.ts";
import { planningHeightmap } from "../../../packages/world-planning/src/semantic-study/PlanningHeightmap.ts";

vi.mock("../../../packages/world-planning/src/semantic-study/PlanningHeightmap.ts", () => {
  const heights = new Float32Array(4);
  const map = { heights, resolution: 2, spacingX: 1, spacingZ: 1 };
  return { planningHeightmap: () => map, planningGroundSurface: () => map };
});
vi.mock("../../../packages/world-planning/src/integrations/terrain/rock-formation/Jobs.ts", () => ({
  rockFormationJobs: (plan: IslandPlan) => [{ id: String(plan.parameters.seed) }]
}));
import { RockFormationClient } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Client.ts";
import { readRockFormationSettings } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Settings.ts";
import type { PlanningDocument } from "../../../packages/world-planning/src/spatial/PlanningDocument.ts";

class TestWorker {
  static instances: TestWorker[] = [];
  static autoReady = true;
  private handler?: (event: { data: unknown }) => void;
  get onmessage() { return this.handler; }
  set onmessage(handler: ((event: { data: unknown }) => void) | undefined) {
    this.handler = handler; if (TestWorker.autoReady) handler?.({data:{ready:true}});
  }
  onerror?: (event: unknown) => void;
  requests: { id: number }[] = [];
  terminated = false;
  constructor() { TestWorker.instances.push(this); }
  postMessage(request: { id: number }): void { this.requests.push(request); }
  terminate(): void { this.terminated = true; }
  complete(index: number, mesh?: RockFormationMesh["mesh"]): void {
    const result: RockFormationMesh = { id: "rock", origin: [0, 0, 0], owners: [],
      mesh: mesh ?? { positions: new Float32Array(0), indices: new Uint32Array(0), normals: new Float32Array(0) },
      stats: { bodies: 0, vertices: 0, generationMs: 0 } };
    this.onmessage?.({ data: { id: this.requests[index].id, results: [result] } });
  }
}
const plan = (seed: number) => ({ parameters: { seed } }) as IslandPlan;
const localJob = (): RockFormationJob => ({
  id: "local-rock", seed: 1, origin: [0, 0, 0],
  guides: [{ id: "local-rock", ownerId: "local-rock", center: [0, 1, 0], size: [2, 2, 2],
    axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }],
});
const settings = () => readRockFormationSettings({ entities: {} } as PlanningDocument);
afterEach(() => { vi.unstubAllGlobals(); TestWorker.instances = []; TestWorker.autoReady = true; });

it("waits for the shared module before sending both planned and ground rocks", async () => {
  vi.stubGlobal("Worker", TestWorker); TestWorker.autoReady = false;
  const client = new RockFormationClient(), signal = new AbortController().signal;
  const pending = client.prepare(plan(1), settings(), signal), worker = TestWorker.instances[0];
  const companion = client.prepareJobs([localJob()], settings(), signal);
  expect(TestWorker.instances).toHaveLength(1); expect(worker.requests).toHaveLength(0);
  worker.onmessage?.({ data: { ready: true } }); await Promise.resolve();
  expect(worker.requests).toHaveLength(2); worker.complete(0); worker.complete(1);
  await Promise.all([pending, companion]); client.dispose(); expect(worker.terminated).toBe(true);
});

it("cancels a request before readiness without sending it to a terminated worker", async () => {
  vi.stubGlobal("Worker", TestWorker);
  TestWorker.autoReady = false;
  const client = new RockFormationClient(), controller = new AbortController();
  const pending = client.prepare(plan(1), settings(), controller.signal), worker = TestWorker.instances[0];
  const rejected = expect(pending).rejects.toThrow("cancelled before ready");
  controller.abort(new Error("cancelled before ready"));
  await rejected;
  worker.onmessage?.({ data: { ready: true } });
  await Promise.resolve();
  expect(worker.terminated).toBe(true); expect(worker.requests).toHaveLength(0);
  client.dispose();
});

it("keeps publication statistics when local stones stream afterward", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(), signal = new AbortController().signal;
  const publication = client.prepare(plan(1), settings(), signal), worker = TestWorker.instances[0];
  worker.complete(0, { positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) });
  await publication;
  const snapshot = client.publicationMetrics;
  const local = client.prepareJobs([localJob()], settings(), signal);
  worker.complete(1);
  await local;
  expect(client.unionMetrics.outputTriangles).toBe(0);
  expect(client.publicationMetrics).toBe(snapshot);
  expect(snapshot.outputTriangles).toBe(1);
  client.dispose();
});

it("cancels the old publication without terminating a newer queued rock request", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(), oldSignal = new AbortController(), newSignal = new AbortController();
  const old = client.prepare(plan(1), settings(), oldSignal.signal);
  const rejected = expect(old).rejects.toThrow("superseded");
  const current = client.prepare(plan(2), settings(), newSignal.signal);
  const worker = TestWorker.instances[0];
  oldSignal.abort(new Error("superseded"));
  await rejected;
  expect(worker.terminated).toBe(false);
  worker.complete(0); // Stale reply must not resolve the current publication.
  worker.complete(1);
  expect(await current).toHaveLength(1);
  client.dispose();
  expect(worker.terminated).toBe(true);
});

it("terminates abandoned CPU work and uses a fresh worker for the next publication", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(), controller = new AbortController();
  const task = client.prepare(plan(1), settings(), controller.signal);
  const rejected = expect(task).rejects.toThrow("cancelled");
  controller.abort(new Error("cancelled"));
  await rejected;
  expect(TestWorker.instances[0].terminated).toBe(true);
  const next = client.prepare(plan(2), settings(), new AbortController().signal);
  expect(TestWorker.instances).toHaveLength(2);
  TestWorker.instances[1].complete(0);
  expect(await next).toHaveLength(1);
  client.dispose();
});

it("reuses immutable CPU meshes for unchanged inputs and invalidates changed shape settings", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(), signal = new AbortController().signal;
  const current = settings(), first = client.prepare(plan(1), current, signal);
  const worker = TestWorker.instances[0]; worker.complete(0);
  const before = await first;
  const cached = await client.prepare(plan(1), current, signal);
  expect(cached[0]).toBe(before[0]);
  expect(worker.requests).toHaveLength(1);
  expect(client.preparationMetrics).toMatchObject({ generated: 0, cached: 1 });
  const changed = client.prepare(plan(1), { ...current, shape: { ...current.shape, wallCount: 20 } }, signal);
  worker.complete(1); await changed;
  expect(worker.requests).toHaveLength(2);
  expect(client.preparationMetrics).toMatchObject({ generated: 1, cached: 0 });
  client.dispose();
});

it("retains main and companion geometry when texture scale or rock color changes", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(), signal = new AbortController().signal, initial = settings();
  const first = client.prepare(plan(1), initial, signal), worker = TestWorker.instances[0];
  worker.complete(0);
  const resident = await first;
  const job = localJob(), companions = client.prepareJobs([job], initial, signal);
  worker.complete(1);
  const companionMeshes = await companions;
  const changed = { ...initial, textureScale: 12, colorBlend: structuredClone(initial.colorBlend) };
  changed.colorBlend.color = [0.3, 0.1, 0.2];
  expect((await client.prepare(plan(1), changed, signal, resident))[0]).toBe(resident[0]);
  expect((await client.prepareJobs([job], changed, signal))[0]).toBe(companionMeshes[0]);
  expect(worker.requests).toHaveLength(2);
  expect(client.preparationMetrics).toMatchObject({ generated: 0, cached: 1 });
  client.dispose();
});

it("caches individual atomic parameter seeds separately and reuses their exact replay", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(), signal = new AbortController().signal, current = settings();
  const job: RockFormationJob = { ...localJob(), kind: "mountain", worldSeed: 499, atomicSeed: 11 };
  const first = client.prepareJobs([job], current, signal), worker = TestWorker.instances[0];
  worker.complete(0);
  const original = await first;
  const changed = client.prepareJobs([{ ...job, atomicSeed: 12 }], current, signal);
  expect(worker.requests).toHaveLength(2);
  worker.complete(1);
  expect((await changed)[0]).not.toBe(original[0]);
  expect((await client.prepareJobs([job], current, signal))[0]).toBe(original[0]);
  expect(worker.requests).toHaveLength(2);
  client.dispose();
});

it("reuses live scene meshes outside the history cache budget without hiding parameter changes", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(), signal = new AbortController().signal, current = settings();
  const first = client.prepare(plan(1), current, signal), worker = TestWorker.instances[0];
  // A single payload larger than the history budget is still owned by the live view.
  worker.complete(0, { positions: new Float32Array(17 * 1024 * 1024), indices: new Uint32Array(0) });
  const resident = await first;
  expect((await client.prepare(plan(1), current, signal, resident))[0]).toBe(resident[0]);
  expect(worker.requests).toHaveLength(1);
  expect(client.preparationMetrics).toMatchObject({ generated: 0, cached: 1 });
  const changed = client.prepare(plan(1), { ...current, shape: { ...current.shape, topScale: .5 } }, signal, resident);
  expect(worker.requests).toHaveLength(2);
  worker.complete(1);
  expect((await changed)[0]).not.toBe(resident[0]);
  client.dispose();
});

it("reuses meshes when terrain changes without moving their published OBBs", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(), signal = new AbortController().signal, current = settings();
  const first = client.prepare(plan(1), current, signal);
  const worker = TestWorker.instances[0]; worker.complete(0); const original = await first;
  planningHeightmap(plan(1)).heights = new Float32Array([0, 1, 2, 3]);
  const unchanged = await client.prepare(plan(1), current, signal);
  expect(unchanged[0]).toBe(original[0]);
  expect(worker.requests).toHaveLength(1);
  expect(client.preparationMetrics).toMatchObject({ generated: 0, cached: 1 });
  client.dispose();
});

it("caches shapes separately and reuses the previous mesh when switching back", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(), signal = new AbortController().signal,
    current = settings();
  const first = client.prepare(plan(1), current, signal);
  const worker = TestWorker.instances[0]; worker.complete(0); const initial = await first;
  const moreFaces = { ...current, shape: { ...current.shape, wallCount: 20 } as const };
  const second = client.prepare(plan(1), moreFaces, signal);
  expect(worker.requests).toHaveLength(2); worker.complete(1); const curved = await second;
  expect(curved[0]).not.toBe(initial[0]);
  expect((await client.prepare(plan(1), current, signal))[0]).toBe(initial[0]);
  const changed = client.prepare(plan(1), { ...moreFaces, shape: { ...moreFaces.shape, wallStrength: 0 } }, signal);
  expect(worker.requests).toHaveLength(3); worker.complete(2); await changed;
  expect((await client.prepare(plan(1), moreFaces, signal))[0]).toBe(curved[0]);
  client.dispose();
});

it("separates bare and grass-covered jobs in the cache and preserves the default on replay", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(), signal = new AbortController().signal, current = settings(), job = localJob();
  try {
    const first = client.prepareJobs([job], current, signal), worker = TestWorker.instances[0];
    worker.complete(0);
    const covered = await first;
    const changed = client.prepareJobs([{ ...job, surfaceGrass: false }], current, signal);
    expect(worker.requests).toHaveLength(2);
    worker.complete(1);
    const bare = await changed;
    expect(bare[0]).not.toBe(covered[0]);
    expect((await client.prepareJobs([{ ...job, surfaceGrass: true }], current, signal))[0]).toBe(covered[0]);
    expect((await client.prepareJobs([{ ...job, surfaceGrass: false }], current, signal))[0]).toBe(bare[0]);
    expect(worker.requests).toHaveLength(2);
  } finally { client.dispose(); }
});

it.each([
  { mode: "size", override: { size: [3, 5, 2] as [number,number,number] } },
  { mode: "position", override: { center: [0, 4, 0] as [number,number,number] } }
])("regenerates only the formation containing an edited OBB $mode and reuses both versions on switchback", async ({ override }) => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(), signal = new AbortController().signal, current = settings();
  const job = localJob();
  const jobs: RockFormationJob[] = [
    { ...job, guides: [...job.guides, { ...job.guides[0], id: "neighbor", ownerId: "neighbor" }] },
    { ...localJob(), id: "other-formation" }
  ];
  try {
    const first = client.prepareJobs(jobs, current, signal), worker = TestWorker.instances[0];
    worker.complete(0); await Promise.resolve(); worker.complete(1);
    const before = await first;
    const edited: RockFormationJob[] = [
      { ...jobs[0], guides: jobs[0].guides.map((guide, index) => index === 0
        ? { ...guide, ...override } : guide) }, jobs[1]
    ];
    const task = client.prepareJobs(edited, current, signal);
    expect(worker.requests).toHaveLength(3);
    worker.complete(2);
    const after = await task;
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(client.preparationMetrics).toMatchObject({ generated: 1, cached: 1 });

    const restored = await client.prepareJobs(jobs, current, signal);
    expect(restored[0]).toBe(before[0]);
    expect(restored[1]).toBe(before[1]);
    expect(client.preparationMetrics).toMatchObject({ generated: 0, cached: 2 });
    expect((await client.prepareJobs(edited, current, signal))[0]).toBe(after[0]);
    expect(worker.requests).toHaveLength(3);
  } finally { client.dispose(); }
});

it("shares the worker across local sources and publications while cancelling only the abandoned request", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(), controller = new AbortController();
  const source = client.prepareJobs([localJob()], settings(), controller.signal);
  const rejected = expect(source).rejects.toThrow("cancelled source");
  const publication = client.prepare(plan(1), settings(), new AbortController().signal);
  const worker = TestWorker.instances[0];
  expect(TestWorker.instances).toHaveLength(1);
  controller.abort(new Error("cancelled source"));
  await rejected;
  expect(worker.terminated).toBe(false);
  worker.complete(0); worker.complete(1);
  expect(await publication).toHaveLength(1);
  client.dispose();
});

it("releases a failed submission so later abandoned local work can terminate its worker", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const submit = vi.spyOn(TestWorker.prototype, "postMessage").mockImplementationOnce(() => { throw new Error("cannot clone"); });
  const client = new RockFormationClient(), controller = new AbortController();
  try {
    await expect(client.prepareJobs([localJob()], settings(), controller.signal)).rejects.toThrow("cannot clone");
    const task = client.prepareJobs([localJob()], settings(), controller.signal);
    const rejected = expect(task).rejects.toThrow("cancelled source");
    controller.abort(new Error("cancelled source"));
    await rejected;
    expect(TestWorker.instances[0].terminated).toBe(true);
  } finally { submit.mockRestore(); client.dispose(); }
});

it("retains more than 96 small formations and regenerates only the edited job on replay", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(), signal = new AbortController().signal, current = settings();
  const jobs = Array.from({ length: 128 }, (_, index) => ({ ...localJob(), id: `small-rock-${index}` }));
  const first = client.prepareJobs(jobs, current, signal), worker = TestWorker.instances[0];
  for (let i = 0; i < jobs.length; i++) { worker.complete(i); await Promise.resolve(); }
  const before = await first;
  const cached = await client.prepareJobs(jobs, current, signal);
  expect(worker.requests).toHaveLength(jobs.length);
  expect(cached.every((mesh, index) => mesh === before[index])).toBe(true);
  expect(client.preparationMetrics).toMatchObject({ generated: 0, cached: jobs.length });

  const editedIndex = jobs.length / 2;
  const edited = jobs.map((job, index) => index === editedIndex ? { ...job, seed: job.seed + 1 } : job);
  const task = client.prepareJobs(edited, current, signal);
  expect(worker.requests).toHaveLength(jobs.length + 1);
  worker.complete(jobs.length);
  const after = await task;
  expect(after[editedIndex]).not.toBe(before[editedIndex]);
  expect(after.every((mesh, index) => index === editedIndex || mesh === before[index])).toBe(true);
  expect(client.preparationMetrics).toMatchObject({ generated: 1, cached: jobs.length - 1 });
  client.dispose();
});

it("keeps a stable retained subset when geometry payloads exceed the byte budget", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(), signal = new AbortController().signal, current = settings();
  const jobs = Array.from({ length: 3 }, (_, index) => ({ ...localJob(), id: `large-rock-${index}` }));
  // Three 24 MiB payloads exceed the 64 MiB budget, while any two fit.
  const payload = new Float32Array(24 * 1024 * 1024 / Float32Array.BYTES_PER_ELEMENT), empty = new Float32Array(0);
  const mesh = { positions: payload, indices: new Uint32Array(0) };
  const first = client.prepareJobs(jobs, current, signal), worker = TestWorker.instances[0];
  for (let i = 0; i < jobs.length; i++) { worker.complete(i, mesh); await Promise.resolve(); }
  const before = await first;
  const replay = client.prepareJobs(jobs, current, signal);
  expect(worker.requests).toHaveLength(jobs.length + 1);
  worker.complete(jobs.length, mesh);
  const after = await replay;
  expect(after[0]).toBe(before[0]); expect(after[1]).toBe(before[1]);
  // Avoid Vitest's deep-equality hint traversing the 24 MiB typed payload.
  expect(after[2] === before[2]).toBe(false);
  expect(client.preparationMetrics).toMatchObject({ generated: 1, cached: 2 });
  client.dispose();
});

it("invalidates a whole intersecting group after separation and reuses unrelated rocks", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const client = new RockFormationClient(true), signal = new AbortController().signal;
  const a = localJob(), b = { ...localJob(), id: "neighbor", origin: [1,0,0] as [number,number,number] },
    c = { ...localJob(), id: "far", origin: [30,0,0] as [number,number,number] };
  const mesh = (job: RockFormationJob): RockFormationMesh => ({ id:job.id,origin:job.origin,owners:[],
    mesh:{positions:new Float32Array(0),indices:new Uint32Array(0)},stats:{bodies:1,vertices:0,generationMs:1} });
  try {
    const first = client.prepareJobs([a,b,c],settings(),signal), worker = TestWorker.instances[0];
    const request = worker.requests[0] as { id:number; members:{job:RockFormationJob}[] };
    expect(request.members.map(m=>m.job.id)).toEqual([a.id,b.id]);
    worker.onmessage?.({data:{id:request.id,results:[mesh(a),mesh(b)]}});
    await Promise.resolve(); worker.complete(1);
    const before = await first;
    expect(client.unionMetrics).toMatchObject({enabled:true,groups:1,groupedBodies:2});
    expect(await client.prepareJobs([a,b,c],settings(),signal)).toEqual(before);
    expect(worker.requests).toHaveLength(2);
    const separated = {...b,origin:[10,0,0] as [number,number,number]};
    const changed = client.prepareJobs([a,separated,c],settings(),signal);
    worker.complete(2); await Promise.resolve(); worker.complete(3);
    const after = await changed;
    expect(after[2]).toBe(before[2]);
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(client.unionMetrics).toMatchObject({groups:0,groupedBodies:0});
    expect(client.preparationMetrics).toMatchObject({generated:2,cached:1});
    expect(await client.prepareJobs([a,b,c],settings(),signal)).toEqual(before);
    expect(worker.requests).toHaveLength(4);
  } finally { client.dispose(); }
});
