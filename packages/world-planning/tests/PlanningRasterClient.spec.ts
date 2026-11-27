import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanningRasterClient } from "../src/semantic-study/PlanningRasterClient";
import { PlanningRasterTransfer } from "../src/semantic-study/PlanningRasterTransfer";
import { adoptPlanningHeightmap } from "../src/semantic-study/PlanningHeightmap";

class FakeRasterWorker {
  static instances: FakeRasterWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  sent: any[] = [];
  terminated = false;
  constructor() {
    FakeRasterWorker.instances.push(this);
  }
  postMessage(data: any) {
    this.sent.push(data);
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: any) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

function makePlan(seed: number): any {
  return {
    parameters: { seed, width: 1024, depth: 1024, landMode: "continuous" },
    land: [],
    islands: [],
    slopes: [],
    regions: [],
    waters: [],
    routes: [],
    rocks: [],
    buildings: []
  };
}

function makeRasterPacket(id: number, seed: number) {
  const transfer = new PlanningRasterTransfer();
  const heights = new Float32Array([seed, seed + 1, seed + 2, seed + 3]);
  const encoded = new Uint16Array([10, 20, 30, 40]);
  return transfer.encode(id, {
    height: {
      resolution: 2,
      spacingX: 1024,
      spacingZ: 1024,
      heights,
      encoded,
      decodeOffset: -5,
      decodeScale: 100
    },
    alpha: {
      resolution: 2,
      spacingX: 1024,
      spacingZ: 1024,
      weights: new Uint8Array(16)
    }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeRasterWorker.instances.length = 0;
});

describe("PlanningRasterClient.waitForHeight", () => {
  it("resolves early on height-ready without disturbing the in-flight final raster result", async () => {
    vi.stubGlobal("Worker", FakeRasterWorker);
    const client = new PlanningRasterClient();
    const plan = makePlan(1);
    const runPromise = client.run(plan, true, true);
    const worker = FakeRasterWorker.instances[0];
    const reqId = worker.sent[0].id;

    let runSettled = false;
    void runPromise.then(() => {
      runSettled = true;
    });

    const waitBefore = client.waitForHeight(plan);
    const earlyHeight = {
      resolution: 2,
      encoded: new Uint16Array([10, 20, 30, 40]),
      decodeOffset: -5,
      decodeScale: 100
    };
    worker.emit({ id: reqId, kind: "height-ready", height: earlyHeight });

    const resolvedBefore = await waitBefore;
    expect(resolvedBefore).toEqual(earlyHeight);
    // Final raster must still be in-flight.
    expect(runSettled).toBe(false);
    // Subsequent waitForHeight calls resolve immediately from earlyHeights.
    expect(await client.waitForHeight(plan)).toEqual(earlyHeight);

    worker.emit({ id: reqId, raster: makeRasterPacket(reqId, 1), elapsedMs: 123 });
    expect(await runPromise).toBe(123);
    client.dispose();
  });

  it("settles pending waitForHeight with undefined when superseded, failed, or disposed", async () => {
    vi.stubGlobal("Worker", FakeRasterWorker);
    const client = new PlanningRasterClient();
    const planA = makePlan(10);
    const planB = makePlan(20);
    const runA = client.run(planA, false, false);
    const waitA = client.waitForHeight(planA);
    // Superseding planA with planB resolves waitA with undefined and runA with undefined.
    const runB = client.run(planB, false, false);
    expect(await waitA).toBeUndefined();
    expect(await runA).toBeUndefined();

    const waitB = client.waitForHeight(planB);
    FakeRasterWorker.instances[0].onerror?.({ message: "worker crashed" } as ErrorEvent);
    await expect(runB).rejects.toThrow("worker crashed");
    expect(await waitB).toBeUndefined();

    const planC = makePlan(30);
    const runC = client.run(planC, false, false);
    const waitC = client.waitForHeight(planC);
    client.dispose();
    expect(await waitC).toBeUndefined();
    expect(await runC).toBeUndefined();
  });

  it("returns immediately when planningHeightmap is already cached on the plan", async () => {
    const client = new PlanningRasterClient();
    const plan = makePlan(99);
    const encoded = new Uint16Array([1, 2, 3, 4]);
    adoptPlanningHeightmap(plan, {
      resolution: 2,
      spacingX: 1024,
      spacingZ: 1024,
      heights: new Float32Array([0, 1, 2, 3]),
      encoded,
      decodeOffset: 0,
      decodeScale: 50
    });
    const resolved = await client.waitForHeight(plan);
    expect(resolved).toEqual({
      resolution: 2,
      encoded,
      decodeOffset: 0,
      decodeScale: 50
    });
    expect(FakeRasterWorker.instances).toHaveLength(0);
  });
});
