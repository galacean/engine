import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildingCpuClient } from "../src/building/parts/architecture/BuildingCpuClient";
class WorkerPort {
  static instances: WorkerPort[] = [];
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  sent: any[] = [];
  terminated = false;
  constructor() {
    WorkerPort.instances.push(this);
  }
  postMessage(value: any) {
    this.sent.push(value);
  }
  terminate() {
    this.terminated = true;
  }
  reply(id: number, result = {}) {
    this.onmessage?.({ data: { id, ok: true, result } });
  }
}
const terrain = {
  samples: new Uint16Array(4),
  resolution: 2,
  origin: [-10, -10],
  size: 20,
  decode: { offset: 0, scale: 1 }
} as any;
const doc = { groups: [], parts: [], relations: [] } as any;
afterEach(() => {
  vi.unstubAllGlobals();
  WorkerPort.instances.length = 0;
});
describe("flat building CPU ownership", () => {
  it.each(["error", "messageerror"] as const)(
    "rebuilds after Worker %s without reusing lost snapshots",
    async (fault) => {
      vi.stubGlobal("Worker", WorkerPort);
      const client = new BuildingCpuClient(),
        units = {} as any,
        signal = new AbortController().signal;
      const first = client.prepare(doc, terrain, units, signal),
        old = WorkerPort.instances[0];
      old.reply(old.sent[0].id);
      const snapshot = (await first).cpu;
      const lateMessage = old.onmessage!,
        lateError = old.onerror!;
      const pending = snapshot.compile(signal),
        rejected = expect(pending).rejects.toThrow("Building Worker");
      if (fault === "error") old.onerror!({ message: "network unavailable" });
      else old.onmessageerror!();
      await rejected;
      expect(old.terminated).toBe(true);
      expect(snapshot.valid).toBe(false);
      await expect(snapshot.compile(signal)).rejects.toThrow("expired");
      const retry = client.prepare(doc, terrain, units, signal),
        next = WorkerPort.instances[1];
      expect(next.sent[0].units).toBe(units);
      expect(next.sent[0].terrain.samples).toBe(terrain.samples);
      expect(next.sent[0].assetId).not.toBe(old.sent[0].assetId);
      const count = next.sent.length;
      snapshot.dispose();
      expect(next.sent).toHaveLength(count);
      // Events from the terminated instance must neither settle nor close the replacement.
      lateMessage({ data: { id: next.sent[0].id, ok: true, result: { stale: true } } });
      lateError({ message: "late error" });
      expect(next.terminated).toBe(false);
      next.reply(next.sent[0].id, { fresh: true });
      const fresh = await retry;
      expect(fresh).toHaveProperty("fresh", true);
      expect(fresh.cpu.valid).toBe(true);
      fresh.cpu.dispose();
      client.dispose();
    }
  );
  it("retries a failed initial module load in the same service", async () => {
    vi.stubGlobal("Worker", WorkerPort);
    const client = new BuildingCpuClient(),
      signal = new AbortController().signal;
    const first = client.prepare(doc, terrain, {} as any, signal),
      rejected = expect(first).rejects.toThrow("module script unavailable");
    WorkerPort.instances[0].onerror!({ message: "" });
    await rejected;
    const retry = client.prepare(doc, terrain, {} as any, signal),
      worker = WorkerPort.instances[1];
    worker.reply(worker.sent[0].id);
    expect((await retry).cpu.valid).toBe(true);
    client.dispose();
  });
  it("shares one worker and one asset snapshot, while keeping independent compilation lifetimes", async () => {
    vi.stubGlobal("Worker", WorkerPort);
    const client = new BuildingCpuClient(),
      units = {} as any,
      signal = new AbortController().signal;
    const first = client.prepare(doc, terrain, units, signal),
      port = WorkerPort.instances[0];
    port.reply(port.sent[0].id);
    const a = await first;
    const second = client.prepare(doc, terrain, units, signal);
    expect(port.sent[0].units).toBe(units);
    expect(port.sent[1]).not.toHaveProperty("units");
    expect(port.sent[1].assetId).toBe(port.sent[0].assetId);
    expect(port.sent[1].terrainId).toBe(port.sent[0].terrainId);
    expect(port.sent[0].terrain.samples).toBe(terrain.samples);
    expect(port.sent[1].terrain).toBeUndefined();
    port.reply(port.sent[1].id);
    const b = await second;
    a.cpu.dispose();
    await expect(a.cpu.compile(signal)).rejects.toThrow("disposed");
    const detail = b.cpu.compile(signal),
      request = port.sent.at(-1);
    expect(request.token).toBe(port.sent[1].id);
    expect(request).not.toHaveProperty("document");
    port.reply(request.id, { plans: ["retained"] });
    expect(await detail).toEqual({ plans: ["retained"] });
    b.cpu.dispose();
    const third = client.prepare(doc, terrain, units, signal);
    expect(port.sent.at(-1).units).toBe(units);
    expect(port.sent.at(-1).terrain.samples).toBe(terrain.samples);
    port.reply(port.sent.at(-1).id);
    (await third).cpu.dispose();
    expect(WorkerPort.instances).toHaveLength(1);
    client.dispose();
    expect(port.terminated).toBe(true);
  });
  it("rejects cancelled work, releases its snapshot and ignores the late result", async () => {
    vi.stubGlobal("Worker", WorkerPort);
    const client = new BuildingCpuClient(),
      abort = new AbortController();
    const pending = client.prepare(doc, terrain, {} as any, abort.signal),
      port = WorkerPort.instances[0],
      id = port.sent[0].id;
    abort.abort();
    await expect(pending).rejects.toThrow();
    expect(port.sent.at(-1)).toMatchObject({ mode: "release", token: id });
    port.reply(id);
    const next = client.prepare(doc, terrain, {} as any, new AbortController().signal);
    port.reply(port.sent.at(-1).id);
    (await next).cpu.dispose();
    client.dispose();
  });
  it("disposal rejects pending requests and prohibits reopening the worker", async () => {
    vi.stubGlobal("Worker", WorkerPort);
    const client = new BuildingCpuClient(),
      signal = new AbortController().signal;
    const pending = client.prepare(doc, terrain, {} as any, signal);
    client.dispose();
    await expect(pending).rejects.toThrow("disposed");
    await expect(client.prepare(doc, terrain, {} as any, signal)).rejects.toThrow("disposed");
    expect(WorkerPort.instances).toHaveLength(1);
  });
});

it("does not return a detail result after its owner released the handle", async () => {
  vi.stubGlobal("Worker", WorkerPort);
  const client = new BuildingCpuClient(),
    signal = new AbortController().signal;
  const first = client.prepare(doc, terrain, {} as any, signal),
    port = WorkerPort.instances[0];
  port.reply(port.sent[0].id);
  const { cpu } = await first;
  const detail = cpu.compile(signal),
    id = port.sent.at(-1).id;
  const rejected = expect(detail).rejects.toThrow("disposed");
  cpu.dispose();
  cpu.dispose();
  expect(port.sent.filter((m) => m.mode === "release")).toHaveLength(1);
  port.reply(id, { stale: true });
  await rejected;
  client.dispose();
});

it("a synchronous clone failure cannot poison a concurrently queued prepare", async () => {
  class CloneFailurePort extends WorkerPort {
    fail = true;
    override postMessage(value: any) {
      if (this.fail) {
        this.fail = false;
        throw new DOMException("Cannot clone Unit", "DataCloneError");
      }
      super.postMessage(value);
    }
  }
  vi.stubGlobal("Worker", CloneFailurePort);
  const client = new BuildingCpuClient(),
    units = {} as any,
    signal = new AbortController().signal;
  const bad = client.prepare(doc, terrain, units, signal);
  // No await: this prepare happens before rejection continuations run.
  const good = client.prepare(doc, terrain, units, signal),
    port = WorkerPort.instances[0];
  await expect(bad).rejects.toThrow("Cannot clone");
  expect(port.sent[0].units).toBe(units);
  expect(port.sent[0].terrain).toBe(terrain);
  port.reply(port.sent[0].id);
  (await good).cpu.dispose();
  client.dispose();
});
