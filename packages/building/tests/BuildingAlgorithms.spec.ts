import { describe, expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import {
  buildingPlacementAlgorithms,
  buildingSupportAlgorithms,
  copyBuildingValue
} from "../src/building/parts/BuildingAlgorithms";
import { pointSupport } from "../src/building/parts/supports/PointSupport";
import { pathSupport } from "../src/building/parts/supports/PathSupport";
import { alongPath } from "../src/building/parts/algorithms/AlongPath";
import { placeAtPoint } from "../src/building/parts/algorithms/PlaceAtPoint";
import { staggeredGrid } from "../src/building/parts/algorithms/SurfaceGrid";
import { BuildingMeshChart } from "../src/building/parts/BuildingLayout";

// Pure algorithm contracts shared by flat parts and programmatic geometry.
const context = {} as Parameters<typeof pointSupport>[1];
describe("Building algorithm contracts", () => {
  it("persists algorithm references without embedding executable code", () => {
    const value = {
      generator: buildingSupportAlgorithms.reference(pointSupport),
      params: { position: [1, 2, 3] }
    };
    expect(JSON.parse(JSON.stringify(value))).toEqual({
      generator: "point",
      params: { position: [1, 2, 3] }
    });
    const support = buildingSupportAlgorithms.resolve(value.generator)(value.params, context);
    expect(placeAtPoint(support, {}, context)[0].position).toEqual([1, 2, 3]);
  });
  it("uses the same registry contract for custom algorithms and rejects ambiguous registration", () => {
    const fn = buildingPlacementAlgorithms.register("test.empty", () => []);
    expect(buildingPlacementAlgorithms.resolve("test.empty")).toBe(fn);
    expect(() => buildingPlacementAlgorithms.register("test.empty", () => [])).toThrow("already registered");
    expect(() => buildingPlacementAlgorithms.reference(() => [])).toThrow("Register custom");
    expect(() => buildingPlacementAlgorithms.resolve("missing")).toThrow("Unknown");
  });
  it("keeps author parameters isolated and rejects cyclic/non-data inputs", () => {
    const source = { points: [[1, 2, 3]] },
      clone = copyBuildingValue(source);
    clone.points[0][0] = 9;
    expect(source.points[0][0]).toBe(1);
    const cycle: any = {};
    cycle.self = cycle;
    expect(() => copyBuildingValue(cycle)).toThrow("Cyclic");
    expect(() => copyBuildingValue({ value: Infinity })).toThrow("finite");
    expect(() => copyBuildingValue({ callback: () => {} })).toThrow("data");
  });
  it("routes Point/Path/Surface explicitly and preserves closed path semantics", () => {
    const path = pathSupport(
      {
        points: [
          [0, 0, 0],
          [2, 0, 0],
          [2, 0, 2],
          [0, 0, 2]
        ],
        closed: true
      },
      context
    );
    const result = alongPath(path, { spacing: 2 }, context);
    expect(result.map((p) => p.position)).toEqual([
      [0, 0, 0],
      [2, 0, 0],
      [2, 0, 2],
      [0, 0, 2]
    ]);
    expect(() => placeAtPoint(path, {}, context)).toThrow("Point");
    expect(() => staggeredGrid(path, { step: [1, 1] }, context)).toThrow("Surface");
  });
  it("surface placement consumes the actual mesh topology, including missing triangles", () => {
    const chart = new BuildingMeshChart({
      positions: [
        [0, 0, 0],
        [2, 0, 0],
        [0, 0, 2]
      ],
      uvs: [
        [0, 0],
        [2, 0],
        [0, 2]
      ],
      indices: [0, 2, 1]
    });
    const poses = staggeredGrid({ type: "surface", chart }, { step: [1, 1], offset: 0.1 }, context);
    expect(poses).toHaveLength(3);
    expect(poses.every((p) => p.position[1] === 0.1)).toBe(true);
  });
});

it("requires explicit Mesh references instead of guessing the generated output owner", () => {
  expect(() => meshSurface({} as any, {} as any)).toThrow("explicit Mesh reference");
});

import { meshSurface } from "../src/building/parts/supports/MeshSupport";
