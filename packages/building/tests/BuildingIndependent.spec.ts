import { describe, expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import {
  BuildingMeshChart,
  type BuildingMeshData,
  type BuildingPoint
} from "../src/building/parts/BuildingLayout";
import {
  surfaceCourseCells,
  type SurfaceCourseParameters
} from "../src/building/parts/algorithms/SurfaceCourseCells";
function rectangles(rects: number[][]): BuildingMeshData {
  const positions: BuildingPoint[] = [],
    uvs: [number, number][] = [],
    indices: number[] = [];
  for (const [l, b, r, t] of rects) {
    const i = positions.length;
    positions.push([l, b, 0], [r, b, 0], [r, t, 0], [l, t, 0]);
    uvs.push([l, b], [r, b], [r, t], [l, t]);
    indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  return { positions, uvs, indices };
}
const data = rectangles([
  [0, 0, 4, 1],
  [0, 1, 1, 3],
  [3, 1, 4, 3],
  [0, 3, 4, 4]
]);
const p: SurfaceCourseParameters = {
  assets: {} as any,
  material: "brick",
  size: [0.6, 0.7, 0.2],
  seed: 17,
  splitAtVertices: true,
  splitProbability: 0.7,
  gap: 0.01
};
describe("Independent mesh-consuming masonry", () => {
  it("keeps actual aperture intervals and fits every brick outside the opening", () => {
    const chart = new BuildingMeshChart(data);
    expect(chart.intervals(2)).toEqual([
      [0, 1],
      [3, 4]
    ]);
    expect(chart.intervals(0.5)).toEqual([[0, 4]]);
    const cells = surfaceCourseCells(chart, p);
    expect(cells.length).toBeGreaterThan(20);
    for (const c of cells) {
      const [x, y] = c.center,
        [w, h] = c.size;
      expect(x + w / 2 <= 1 || x - w / 2 >= 3 || y + h / 2 <= 1 || y - h / 2 >= 3).toBe(true);
    }
  });
  it("follows a rotated and translated mesh without any building descriptor", () => {
    const original = surfaceCourseCells(new BuildingMeshChart(data), p);
    const transformed = {
      ...data,
      positions: data.positions.map(([x, y, z]) => [z + 10, y + 2, -x + 4] as BuildingPoint)
    };
    const next = surfaceCourseCells(new BuildingMeshChart(transformed), p);
    expect(next.length).toBe(original.length);
    next.forEach((c, i) => {
      expect(c.center[0]).toBeCloseTo(10);
      expect(c.center[1]).toBeCloseTo(original[i].center[1] + 2);
      expect(c.center[2]).toBeCloseTo(4 - original[i].center[0]);
      expect(c.normal[0]).toBeCloseTo(1);
    });
  });
  it("reacts to topology edits and preserves deterministic variation", () => {
    const chart = new BuildingMeshChart(data),
      a = surfaceCourseCells(chart, p);
    expect(surfaceCourseCells(chart, p)).toEqual(a);
    expect(surfaceCourseCells(chart, { ...p, seed: 19 })).not.toEqual(a);
    const solid = surfaceCourseCells(new BuildingMeshChart(rectangles([[0, 0, 4, 4]])), p);
    expect(solid.some((c) => c.center[0] > 1 && c.center[0] < 3 && c.center[1] > 1 && c.center[1] < 3)).toBe(true);
  });
  it("overlaps tiles down the surface but fits the upper boundary", () => {
    const chart = new BuildingMeshChart(rectangles([[0, 0, 4, 4]]));
    const cells = surfaceCourseCells(chart, {
      ...p,
      material: "roof_tile",
      overlap: 0.3,
      splitProbability: 0,
      startOverhang: 0.2
    });
    expect(cells.some((c) => c.center[1] - c.size[1] / 2 < 0)).toBe(true);
    expect(cells.every((c) => c.center[1] + c.size[1] / 2 <= 4 + 1e-7)).toBe(true);
  });
  it("bounds tiny-unit work before constructing huge column arrays", () => {
    const chart = new BuildingMeshChart(rectangles([[0, 0, 4, 4]]));
    expect(() => surfaceCourseCells(chart, { ...p, size: [1e-10, 0.5, 0.2] })).toThrow(/budget/);
    expect(() => surfaceCourseCells(chart, { ...p, overlap: NaN })).toThrow();
  });
});
