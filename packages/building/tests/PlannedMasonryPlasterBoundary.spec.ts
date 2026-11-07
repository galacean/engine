import { buildConstructionFlatRoof } from "../src/building/runtime/ConstructionFlatRoof";
import { describe, it, expect } from "vitest";
import {
  surfaceBoundary,
  surfaceTriangleMapper,
  intersectSurfacePolygon,
  surfaceRegionBoundary,
  subtractSurfacePolygon
} from "../src/building/runtime/SurfacePolygon";
import { plasterBoundaryDistance } from "../src/building/runtime/ConstructionPlasterSupport";

const rect = (x: number, y: number, X: number, Y: number) =>
  surfaceBoundary([
    [x, y],
    [X, y],
    [X, Y],
    [x, Y]
  ]);
describe("plaster effective boundary", () => {
  it.each([false, true])("preserves actual generated rim shared edges (circle=%s)", (circle) => {
    const roof = buildConstructionFlatRoof({
      id: "rim",
      material: "brick",
      rim: true,
      topY: 3.97,
      shape: circle
        ? { type: "circle", center: [0, 0], radius: 3, phase: 0.17 }
        : { type: "rectangle", center: [0, 0], width: 6, depth: 6, orientation: [Math.cos(0.3), Math.sin(0.3)] },
      seed: 42
    });
    const { geometry, wallUV } = roof.finishSupport;
    expect(geometry.triangles.length).toBeGreaterThan(0);
    for (let i = 0; i < geometry.triangles.length; i += 2) {
      const pair = geometry.triangles.slice(i, i + 2);
      const mapped = pair.map((triangle) =>
        surfaceTriangleMapper(
          triangle.map((j) => geometry.uv[j]),
          triangle.map((j) => wallUV[j])
        )(surfaceBoundary(triangle.map((j) => geometry.uv[j])))
      );
      const expected = pair.map((triangle) => surfaceBoundary(triangle.map((j) => wallUV[j])));
      const canonical = (regions: typeof mapped) =>
        surfaceRegionBoundary(regions)
          .map((edge) =>
            edge
              .map((p) => p.join(","))
              .sort()
              .join(";")
          )
          .sort();
      expect(canonical(mapped)).toEqual(canonical(expected));
      expect(surfaceRegionBoundary(mapped)).toHaveLength(4);
    }
  });
  it("keeps original shared vertices and cut intersections through exact recharting", () => {
    // Real generated round-rim face: its two charts are piecewise affine after
    // deformation. The former world-frame round trip produced six outer edges.
    const from = [
      [5.987316798817494, 3.192967123479696],
      [6.3740848263129894, 3.192967123479696],
      [6.3740848263129894, 3.4192900896976903],
      [5.987316798817494, 3.4192900896976903]
    ];
    const to = [
      [0, 3.839722385188149],
      [0.3866962057635992, 3.824401681755441],
      [0.3866962057635992, 4.080737655516714],
      [0, 4.103646598756313]
    ];
    const triangles = [
      [0, 1, 2],
      [0, 2, 3]
    ];
    const source = triangles.map((t) => surfaceBoundary(t.map((i) => from[i])));
    const charts = triangles.map((t) =>
      surfaceTriangleMapper(
        t.map((i) => from[i]),
        t.map((i) => to[i])
      )
    );
    const mapped = source.map((s, i) => charts[i](s));
    expect(surfaceRegionBoundary(mapped)).toHaveLength(4);
    const x = (from[0][0] + from[2][0]) / 2;
    const clipped = source.map((s) => intersectSurfacePolygon(s, rect(x, 0, 100, 100)));
    const cutMapped = clipped.map((s, i) => charts[i](s));
    // The two collinear vertical cut segments coalesce; the internal diagonal cancels.
    expect(surfaceRegionBoundary(cutMapped)).toHaveLength(4);
    expect(surfaceRegionBoundary(structuredClone(cutMapped))).toEqual(surfaceRegionBoundary(cutMapped));
    const thin = source.map((s) => intersectSurfacePolygon(s, rect(x, 0, x + 1e-8, 100)));
    const thinMapped = thin.map((s, i) => charts[i](s));
    expect(thinMapped.every((p) => p.points.length >= 3)).toBe(true);
    expect(surfaceRegionBoundary(thinMapped)).toHaveLength(4);
    const slanted = surfaceBoundary([
      [x, 0],
      [100, 0],
      [100, 100],
      [x + 0.1, 100]
    ]);
    const slantedMapped = source.map((s, i) => charts[i](intersectSurfacePolygon(s, slanted)));
    expect(surfaceRegionBoundary(slantedMapped)).toHaveLength(5);
    const distance = plasterBoundaryDistance({ wallLength: 10, regions: cutMapped });
    expect(distance([0.3, 3.95])).toBeGreaterThan(0.05);
    expect(source.map((s, i) => charts[i](s))).toEqual(mapped);
    const reflected = triangles.map((t) =>
      surfaceTriangleMapper(
        t.map((i) => from[i]),
        t.map((i) => [-to[i][0], to[i][1]])
      )
    );
    expect(surfaceRegionBoundary(source.map((s, i) => reflected[i](s)))).toHaveLength(4);
  });

  it("distinguishes collapsed targets from representable narrow faces", () => {
    const source = [
      [0, 0],
      [1, 0],
      [0, 1]
    ];
    expect(
      surfaceTriangleMapper(source, [
        [0, 0],
        [1, 0],
        [2, 0]
      ])(surfaceBoundary(source)).points
    ).toHaveLength(0);
    const thin = surfaceTriangleMapper(source, [
      [0, 0],
      [1, 0],
      [0, 1e-12]
    ])(surfaceBoundary(source));
    expect(surfaceRegionBoundary([thin])).toHaveLength(3);
    expect(() =>
      surfaceTriangleMapper(
        [
          [0, 0],
          [1, 0],
          [2, 0]
        ],
        source
      )
    ).toThrow("invertible");
  });
  it("cancels triangle diagonals, T junctions and the closed wall chart seam", () => {
    const regions = [
      surfaceBoundary([
        [0, 0],
        [4, 0],
        [4, 4]
      ]),
      surfaceBoundary([
        [0, 0],
        [4, 4],
        [0, 4]
      ]),
      rect(4, 0, 8, 2),
      rect(4, 2, 8, 4)
    ];
    expect(surfaceRegionBoundary(regions, 8)).toHaveLength(2);
    const distance = plasterBoundaryDistance({ wallLength: 8, regions });
    for (const u of [0, 1, 2, 3.999, 4, 4.001, 7.99, 8]) expect(distance([u, 2])).toBe(1);
    expect(distance([4, 0.2])).toBeCloseTo(0.2, 12);
  });
  it("keeps arbitrary real cut boundaries and wraps distances across the UV seam", () => {
    const hole = surfaceBoundary([
      [0.1, 1],
      [1.1, 2],
      [0.1, 3]
    ]);
    const regions = subtractSurfacePolygon(rect(0, 0, 8, 4), hole);
    const distance = plasterBoundaryDistance({ wallLength: 8, regions });
    expect(distance([7.9, 2])).toBeCloseTo(0.2, 10);
    expect(distance([1.2, 2])).toBeCloseTo(0.1, 10);
    expect(distance([4, 2])).toBe(1);
    // A real narrow opening is not removed by coordinate quantization.
    const thin = subtractSurfacePolygon(rect(0, 0, 8, 4), rect(2, 1, 2 + 1e-8, 3));
    expect(plasterBoundaryDistance({ wallLength: 8, regions: thin })([2.1, 2])).toBeCloseTo(0.1 - 1e-8, 10);
  });
});
