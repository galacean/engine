import { afterEach, expect, it, vi } from "vitest";
import { PlanningSeedScenePublication } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedScenePublication";
import { RockFormationClient } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Client";
import { readRockFormationSettings } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import type { PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";

vi.mock("@galacean/engine-world-planning/semantic-study/PlanningHeightmap", () => ({
  planningGroundSurface: () => ({ sample: () => 0 })
}));
vi.mock("@galacean/engine-world-planning/integrations/terrain/rock-formation/Jobs", () => ({
  rockFormationJobs: () => [{ id: "rock" }]
}));
afterEach(() => vi.unstubAllGlobals());

it.each(["raster failure", "rock failure", "cancel"])(
  "settles parallel preparation on %s without publishing a partial scene",
  async (mode) => {
    let worker!: TestWorker;
    class TestWorker {
      onmessage?: (event: { data: unknown }) => void;
      request?: { id: number };
      terminated = false;
      constructor() {
        worker = this;
        queueMicrotask(() => this.onmessage?.({ data: { ready: true } }));
      }
      postMessage(request: { id: number }) {
        this.request = request;
      }
      terminate() {
        this.terminated = true;
      }
    }
    vi.stubGlobal("Worker", TestWorker);
    // No scene resources should be accessed before both CPU preparations succeed.
    const owner = new PlanningSeedScenePublication({ water: { destroy: vi.fn() } } as never);
    const rocks = new RockFormationClient(),
      controller = new AbortController();
    let resolveRaster!: () => void, rejectRaster!: (error: Error) => void;
    const raster = new Promise<void>((resolve, reject) => {
      resolveRaster = resolve;
      rejectRaster = reject;
    });
    const plan = { parameters: { seed: 1 } } as IslandPlan;
    let signal!: AbortSignal;
    const task = owner.prepare(
      plan,
      async (candidateSignal) => {
        signal = candidateSignal;
        await Promise.all([
          raster,
          rocks.prepare(plan, readRockFormationSettings({ entities: {} } as PlanningDocument), signal)
        ]);
        throw Error("unexpected partial scene creation");
      },
      controller.signal
    );
    const rejected = expect(task).rejects.toThrow(mode === "cancel" ? /abort/i : mode);
    try {
      await Promise.resolve();
      await Promise.resolve();
      expect(worker.request).toBeDefined();
      if (mode === "raster failure") rejectRaster(Error(mode));
      else if (mode === "rock failure") worker.onmessage!({ data: { id: worker.request!.id, error: mode } });
      else controller.abort();
      await rejected;
      expect(signal.aborted).toBe(true);
      if (mode !== "rock failure") expect(worker.terminated).toBe(true);
      // A late raster completion cannot revive the rejected candidate.
      resolveRaster();
      await Promise.resolve();
      expect(owner.current).toBeUndefined();
      expect(owner.getDiagnostics().pendingCount).toBe(0);
    } finally {
      resolveRaster();
      rocks.dispose();
      await owner.destroy();
    }
  }
);
