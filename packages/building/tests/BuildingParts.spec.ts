import { describe, expect, it } from "vitest";
import {
  BuildingMeshChart,
  BuildingPath,
  beamBetween,
  pathArray,
  surfaceGrid,
  type BuildingMeshData
} from "../src/tiny-glade/parts/BuildingLayout";

const plane: BuildingMeshData = {
  positions: [
    [0, 0, 0],
    [2, 0, 0],
    [0, 0, 2],
    [2, 0, 2]
  ],
  uvs: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2]
  ],
  indices: [0, 2, 1, 1, 2, 3]
};
describe("Mesh-backed building surfaces", () => {
  it("samples real triangles and normals, including a sloping mesh", () => {
    const data = { ...plane, positions: plane.positions.map(([x, _, z]) => [x, x, z] as [number, number, number]) };
    const pose = new BuildingMeshChart(data).sample(0.5, 1)!;
    expect(pose.position).toEqual([0.5, 0.5, 1]);
    expect(pose.normal[0]).toBeCloseTo(-Math.SQRT1_2);
    expect(pose.normal[1]).toBeCloseTo(Math.SQRT1_2);
    pose.tangent.forEach((n, i) => expect(n).toBeCloseTo(i === 2 ? 0 : Math.SQRT1_2));
    expect(new BuildingMeshChart(data).sample(3, 1)).toBeNull();
  });
  it("uses topology rather than a rectangular footprint to reject gaps", () => {
    const chart = new BuildingMeshChart({ ...plane, indices: [0, 2, 1] });
    expect(chart.sample(1.8, 1.8)).toBeNull();
    expect(surfaceGrid(chart, { step: [1, 1] })).toHaveLength(3);
  });
  it("does not alias input and requires a fresh chart after mesh changes", () => {
    const data = structuredClone(plane),
      snapshot = new BuildingMeshChart(data);
    data.positions[0][1] = 4;
    expect(snapshot.sample(0, 0)!.position[1]).toBe(0);
    expect(new BuildingMeshChart(data).sample(0, 0)!.position[1]).toBe(4);
  });
  it("rejects ambiguous UV interiors, invalid indices and degenerate charts", () => {
    const chart = new BuildingMeshChart({ ...plane, indices: [0, 2, 1, 0, 2, 1] });
    expect(() => chart.sample(0.3, 0.3)).toThrow(/overlapping/);
    expect(() => new BuildingMeshChart({ ...plane, indices: [0, 1, 7] })).toThrow(/index/);
    expect(
      () =>
        new BuildingMeshChart({
          ...plane,
          uvs: [
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0]
          ]
        })
    ).toThrow(/degenerate/);
  });
  it("rejects coincident UV boundaries belonging to disconnected geometry", () => {
    const chart = new BuildingMeshChart({
      positions: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 0, 1],
        [0, 2, 0],
        [-1, 2, 0],
        [0, 2, -1]
      ],
      uvs: [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 0],
        [-1, 0],
        [0, -1]
      ],
      indices: [0, 2, 1, 3, 5, 4]
    });
    expect(() => chart.sample(0, 0)).toThrow(/disconnected/);
  });
  it("offsets along geometric normals and bounds candidate work before allocation", () => {
    const chart = new BuildingMeshChart(plane),
      result = surfaceGrid(chart, { step: [1, 1], offset: 0.2 });
    expect(result.map((p) => p.position)).toEqual([
      [0.5, 0.2, 0.5],
      [1.5, 0.2, 0.5],
      [0.5, 0.2, 1.5],
      [1.5, 0.2, 1.5]
    ]);
    expect(() => surfaceGrid(chart, { step: [0.001, 0.001], limit: 20 })).toThrow(/budget/);
    expect(() => surfaceGrid(chart, { step: [NaN, 1] })).toThrow();
  });
});
describe("Path and shared endpoint construction", () => {
  it("uses arc length rather than vertex count", () => {
    const path = new BuildingPath([
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 3]
    ]);
    expect(path.length).toBe(4);
    expect(pathArray(path, 2).map((p) => p.position)).toEqual([
      [0, 0, 0],
      [1, 0, 1],
      [1, 0, 3]
    ]);
  });
  it("omits the repeated closed endpoint and keeps corner orientation deterministic", () => {
    const path = new BuildingPath(
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1]
      ],
      true
    );
    expect(pathArray(path, 1)).toHaveLength(4);
    expect(path.sample(1).tangent).toEqual([1, 0, 0]);
    expect(() => pathArray(path, 0.01, { limit: 10 })).toThrow(/budget/);
  });
  it("requires explicit up for vertical paths and rejects zero length segments", () => {
    const path = new BuildingPath([
      [0, 0, 0],
      [0, 3, 0]
    ]);
    expect(() => path.sample(1)).toThrow(/nonzero/);
    expect(path.sample(1, [0, 0, 1]).position).toEqual([0, 1, 0]);
    expect(
      () =>
        new BuildingPath([
          [0, 0, 0],
          [0, 0, 0]
        ])
    ).toThrow();
  });
  it("derives beam center and length from shared endpoints", () => {
    const beam = beamBetween([2, 1, 0], [5, 5, 0], [0, 0, 1]);
    expect(beam.length).toBe(5);
    expect(beam.pose.position).toEqual([3.5, 3, 0]);
    expect(beam.pose.tangent).toEqual([0.6, 0.8, 0]);
  });
});
