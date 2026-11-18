import { describe, expect, it, vi } from "vitest";
import { PlanningNaturalVegetationRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetationRuntime";

function fixture() {
  let release!: () => void;
  const resources = new Promise<void>((resolve) => {
    release = resolve;
  });
  const host = Object.create(PlanningNaturalVegetationRuntime.prototype) as any;
  const compileCell = vi.fn(() => ({
    instances: [],
    diagnostics: { layers: [], populations: [], decorations: [], rejected: {} }
  }));
  Object.assign(host, {
    disposed: false,
    time: 0,
    trees: [],
    cells: new Map(),
    camera: { entity: { transform: { worldPosition: { x: 64, z: 64 } } } },
    plan: { parameters: { width: 640, depth: 640 } },
    planner: { compileCell },
    rockSources: { prepareInstances: () => resources },
    detailRoot: { createChild: vi.fn(() => ({})) }
  });
  return { host, release, compileCell };
}

describe("nearby vegetation shader preparation", () => {
  it("awaits asynchronous cell creation and drains only the current nearby demand", async () => {
    const { host, release, compileCell } = fixture();
    const task = host.preparePresentation();
    expect(compileCell).toHaveBeenCalledOnce();
    expect(host.cells.size).toBe(0);
    release();
    await task;
    // At a 64m cell corner, the 60m presentation radius touches these four cells, not the distant world.
    expect([...host.cells.keys()].sort()).toEqual(["0/0", "0/1", "1/0", "1/1"]);
    expect(compileCell).toHaveBeenCalledTimes(4);
    await host.preparePresentation();
    expect(compileCell).toHaveBeenCalledTimes(4);
  });
  it("does not publish cells or request the next cell after disposal during preparation", async () => {
    const { host, release, compileCell } = fixture();
    const task = host.preparePresentation();
    host.disposed = true;
    release();
    await task;
    expect(host.cells.size).toBe(0);
    expect(host.detailRoot.createChild).not.toHaveBeenCalled();
    expect(compileCell).toHaveBeenCalledOnce();
  });
});
