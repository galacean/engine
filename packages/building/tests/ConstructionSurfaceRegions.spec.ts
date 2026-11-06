import { describe, expect, it } from "vitest";
import {
  surfaceArea,
  surfaceBoundary,
  mapSurfaceBoundary,
  surfaceMaskTriangles,
  subtractSurfacePolygon,
  intersectSurfacePolygon,
  effectiveSurfaceRegions
} from "../src/tiny-glade/runtime/SurfacePolygon";
import { clean, intersect, subtractConvex } from "../src/tiny-glade/runtime/RecoveredRoofGeometry";
import { clipPlasterSupport } from "../src/tiny-glade/runtime/ConstructionPlasterSupport";

describe("source clipping regions", () => {
  it.each([
    { input: [] },
    { input: [[0, 0]] },
    {
      input: [
        [0, 0],
        [1, 0],
        [2, 0]
      ]
    }
  ])("keeps empty or degenerate domains empty in both clipping implementations: $input", ({ input }) => {
    const points = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2]
    ];
    const polygon = surfaceBoundary(points),
      empty = surfaceBoundary(input);
    const roofPolygon = clean(points),
      roofEmpty = clean(input);
    expect(empty.points).toEqual([]);
    expect(roofEmpty).toEqual([]);
    expect(intersectSurfacePolygon(polygon, empty).points).toEqual([]);
    expect(intersectSurfacePolygon(empty, polygon).points).toEqual([]);
    expect(intersectSurfacePolygon(empty, empty).points).toEqual([]);
    expect(subtractSurfacePolygon(polygon, empty)).toEqual([polygon]);
    expect(subtractSurfacePolygon(empty, polygon)).toEqual([]);
    expect(subtractSurfacePolygon(empty, empty)).toEqual([]);
    expect(intersect(roofPolygon, roofEmpty)).toEqual([]);
    expect(intersect(roofEmpty, roofPolygon)).toEqual([]);
    expect(intersect(roofEmpty, roofEmpty)).toEqual([]);
    expect(subtractConvex(roofPolygon, roofEmpty)).toEqual([roofPolygon]);
    expect(subtractConvex(roofEmpty, roofPolygon)).toEqual([]);
    expect(subtractConvex(roofEmpty, roofEmpty)).toEqual([]);
    expect(clipPlasterSupport(polygon, [empty])).toEqual([]);
    expect(surfaceMaskTriangles(input)).toEqual([]);
    // A normal clipping result can become empty and be used as the next cutter.
    const other = surfaceBoundary([
      [3, 0],
      [4, 0],
      [4, 2],
      [3, 2]
    ]);
    const disjoint = intersectSurfacePolygon(polygon, other);
    expect(intersectSurfacePolygon(polygon, disjoint).points).toEqual([]);
    const roofDisjoint = intersect(roofPolygon, other.points);
    expect(intersect(roofPolygon, roofDisjoint)).toEqual([]);
    expect(subtractConvex(roofPolygon, roofDisjoint)).toEqual([roofPolygon]);
  });
});

describe("intermediate polygons and final acceptance", () => {
  it("retains small intersections and ears until the complete region is evaluated", () => {
    const strip = [
      [1, -1],
      [1.0000000002, -1],
      [1.0000000002, 2],
      [1, 2]
    ];
    const source = surfaceBoundary([
      [0, 0],
      [2, 0],
      [0, 1.12]
    ]);
    const triangles = surfaceMaskTriangles(strip);
    const areas = triangles.map((t) => Math.abs(surfaceArea(intersectSurfacePolygon(source, t))));
    expect(areas.every((a) => a > 0 && a < 1e-10)).toBe(true);
    expect(areas.reduce((a, b) => a + b, 0)).toBeGreaterThan(1e-10);
    const parts = triangles.reduce((parts, t) => parts.flatMap((p) => subtractSurfacePolygon(p, t)), [source]);
    expect(Math.abs(surfaceArea(source)) - parts.reduce((sum, p) => sum + Math.abs(surfaceArea(p)), 0)).toBeCloseTo(
      areas.reduce((a, b) => a + b, 0),
      14
    );
    const thin = [
      [0, 0],
      [1, 0],
      [1, 1.5e-10],
      [0, 1.5e-10]
    ];
    const ears = surfaceMaskTriangles(thin);
    expect(ears).toHaveLength(2);
    expect(ears.every((t) => Math.abs(surfaceArea(t)) < 1e-10)).toBe(true);
    expect(effectiveSurfaceRegions(ears)).toHaveLength(2);
    expect(effectiveSurfaceRegions([ears[0]])).toEqual([]);
  });
});

describe("affine constraint transport", () => {
  it("retains nearly parallel intersections through translation, reflection and snapshot", () => {
    const source = surfaceBoundary([
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1]
    ]);
    const clip = surfaceBoundary([
      [0, -1],
      [2, -1],
      [2, 1 - Number.EPSILON],
      [0, 1 + Number.EPSILON]
    ]);
    const cut = intersectSurfacePolygon(source, clip);
    expect(cut.constraints).toBeDefined();
    const translated = mapSurfaceBoundary(cut, { origin: [0, 0], offset: [10, 100], u: [1, 0], v: [0, 1] });
    expect(surfaceArea(translated)).toBeCloseTo(2, 12);
    expect(subtractSurfacePolygon(translated, structuredClone(translated))).toEqual([]);
    const restored = mapSurfaceBoundary(structuredClone(translated), {
      origin: [10, 100],
      offset: [0, 0],
      u: [1, 0],
      v: [0, 1]
    });
    expect(subtractSurfacePolygon(cut, restored)).toEqual([]);
    expect(subtractSurfacePolygon(restored, cut)).toEqual([]);
    const reflected = mapSurfaceBoundary(translated, { origin: [10, 100], offset: [0, 0], u: [1, 0], v: [0, -1] });
    expect(surfaceArea(reflected)).toBeCloseTo(2, 12);
    expect(subtractSurfacePolygon(reflected, structuredClone(reflected))).toEqual([]);
    // Removing a genuine region must still be detected after transport.
    const smaller = intersectSurfacePolygon(
      reflected,
      surfaceBoundary([
        [0, -1],
        [1, -1],
        [1, 0],
        [0, 0]
      ])
    );
    expect(subtractSurfacePolygon(reflected, smaller).reduce((n, p) => n + surfaceArea(p), 0)).toBeCloseTo(1, 12);
  });
});
