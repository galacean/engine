import { describe, expect, it } from "vitest";
import { generateTerrainRoad } from "@galacean/engine-world-planning/spatial/layout/TerrainRoad";

describe("terrain road generation", () => {
  const start = { x: 42, z: 126 };
  const end = { x: 210, z: 126 };
  const key = { x: 126, z: 66 };
  const options = {
    sizeMetres: 252,
    resolution: 253,
    widthMetres: 7,
    shoulderMetres: 5,
    heightAt: (x: number, z: number) => (z > 90 ? Math.max(0, 80 - Math.abs(x - 126) * 8) : 0),
    clearanceAt: () => 100
  };

  it("routes around steep ground and preserves ordered keypoints", () => {
    const road = generateTerrainRoad({ ...options, keypoints: [start, end] })!;
    expect(road.points[0]).toEqual(start);
    expect(road.points.at(-1)).toEqual(end);
    expect(road.points.find((p) => Math.abs(p.x - 126) < 2)?.z).toBeLessThan(90);
    expect(road.coverage[126 * 253 + 42]).toBe(1);
    expect(road.coverage[126 * 253 + 126]).toBe(0);
    expect(road.coverage.some((value) => value > 0 && value < 1)).toBe(true);
    const keyed = generateTerrainRoad({ ...options, keypoints: [start, key, end] })!;
    expect(keyed.points).toContainEqual(key);
  });

  it("returns no road across disconnected terrain", () => {
    expect(
      generateTerrainRoad({ ...options, keypoints: [start, end], clearanceAt: (x) => Math.abs(x - 126) - 8 })
    ).toBeUndefined();
  });
});
