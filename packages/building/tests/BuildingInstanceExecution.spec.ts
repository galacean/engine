import { describe, expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import {
  buildingSupportAlgorithms,
  buildingPlacementAlgorithms,
  type BuildingAlgorithmContext
} from "../src/building/parts/BuildingAlgorithms";
import * as algorithms from "../src/building/parts/BuildingAlgorithms";
import { buildingPose } from "../src/building/parts/BuildingLayout";
import { European } from "../src/building/parts/architecture/European";
import { combineBuildingDrafts, type BuildingDraft } from "../src/building/parts/architecture/BuildingDraft";
import { designBuilding } from "../src/building/parts/architecture/BuildingDesign";
import { implementBuilding } from "../src/building/parts/architecture/BuildingImplementation";
import { constructionGeometry } from "./fixtures/constructionGeometry";

// These algorithms are pure coordinate computations. Any attempted native object
// allocation/access in the implementation stage is a test failure.
const context = (): BuildingAlgorithmContext => ({
  get entity(): never {
    throw Error("Coordinate layout must not access a native Entity");
  },
  cache: new Map(),
  own(): never {
    throw Error("Coordinate layout must not allocate native resources");
  }
});

describe("common implementation output for instance supports", () => {
  it("includes a Path stair layout alongside profile parts without changing their packed bytes", async () => {
    const house = European.buildHouses({ id: "house" });
    const steps = European.buildSteps({ id: "steps", width: 2, rise: 0.25, run: 0.4, count: 6 });
    const base = await implementBuilding(designBuilding(house, () => 0, constructionGeometry));
    const execute = vi.spyOn(algorithms, "executeBuildingPlacement");
    let result: Awaited<ReturnType<typeof implementBuilding>>;
    try {
      result = await implementBuilding(
        designBuilding(combineBuildingDrafts(house, steps), () => 0, constructionGeometry),
        { context: context() }
      );
      expect(execute.mock.calls.map(([name]) => name)).toEqual(["stepCourses", "staggered_rows", "overlap_rows"]);
    } finally {
      execute.mockRestore();
    }
    expect(result.groups).toEqual(base.groups);
    expect(result.instanceParts).toHaveLength(1);
    const instance = result.instanceParts[0];
    expect(instance.part.identity).toEqual({ kind: "author", id: "steps-steps" });
    expect(instance.support.type).toBe("path");
    expect(instance.placements).toHaveLength(6);
    if ("kind" in instance.placements) throw Error("Expected coordinate placements for steps");
    expect(instance.placements[5]).toMatchObject({ position: [0, 0.75, 2.2], scale: [2, 1.5, 0.4] });
  });

  it("executes custom support and placement once using the same resource context", async () => {
    const resources = context();
    const support = vi.fn((params, seen) => {
      expect(seen).toBe(resources);
      seen.cache.set("position", params.position);
      return { type: "point" as const, pose: buildingPose(params.position, [1, 0, 0], [0, 1, 0]) };
    });
    const placement = vi.fn((resolved, params, seen) => {
      expect(seen).toBe(resources);
      expect(seen.cache.get("position")).toEqual([2, 3, 4]);
      return [resolved.pose];
    });
    buildingSupportAlgorithms.register("test.execution.point", support);
    buildingPlacementAlgorithms.register("test.execution.place", placement);
    const draft: BuildingDraft = {
      groups: [{ id: "custom", seed: 17, wallColor: 0, woodColor: 0 }],
      relations: [],
      parts: [
        {
          id: "lamp",
          group: "custom",
          type: "lamp",
          support: { generator: "test.execution.point", params: { position: [2, 3, 4] } },
          algorithm: { type: "test.execution.place" },
          unit: "brick",
          params: {}
        }
      ]
    };
    const design = designBuilding(draft, () => 0);
    const result = await implementBuilding(design, { context: resources });
    expect(support).toHaveBeenCalledTimes(1);
    expect(placement).toHaveBeenCalledTimes(1);
    const positions = result.instanceParts[0].placements;
    if ("kind" in positions) throw Error("Expected coordinate placements for the point");
    expect(positions[0].position).toEqual([2, 3, 4]);
    expect(result.groups).toHaveLength(0);
    await expect(implementBuilding(design)).rejects.toThrow(/BuildingAlgorithmContext/);
    const controller = new AbortController();
    controller.abort();
    await expect(implementBuilding(design, { context: resources, signal: controller.signal })).rejects.toThrow();
    expect(support).toHaveBeenCalledTimes(1);
  });
  it("rejects an async placement completed after cancellation", async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    buildingSupportAlgorithms.register("test.async.point", () => ({
      type: "point",
      pose: buildingPose([0, 0, 0], [1, 0, 0], [0, 1, 0])
    }));
    buildingPlacementAlgorithms.register("test.async.place", async (support) => {
      entered();
      await pending;
      if (support.type !== "point" || !("pose" in support)) throw Error("Point required");
      return [support.pose];
    });
    const draft: BuildingDraft = {
      groups: [{ id: "async", seed: 17, wallColor: 0, woodColor: 0 }],
      relations: [],
      parts: [
        {
          id: "lamp",
          group: "async",
          type: "lamp",
          support: { generator: "test.async.point", params: {} },
          algorithm: { type: "test.async.place" },
          unit: "brick",
          params: {}
        }
      ]
    };
    const abort = new AbortController();
    const result = implementBuilding(
      designBuilding(draft, () => 0),
      { context: context(), signal: abort.signal }
    );
    await started;
    abort.abort();
    release();
    await expect(result).rejects.toThrow();
  });
});
