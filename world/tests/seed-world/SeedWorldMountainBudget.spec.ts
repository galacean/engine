import { expect, it } from "vitest";
import {
  allocateMountainTriangles,
  budgetMountainRock
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/MountainBudget";
import { generateRuntimeRocks } from "@galacean/engine-terrain/rock-ridge/features/shaping/atomic-rocks.mjs";
import {
  fractureRockGeometry,
  creasedRockAttributes
} from "@galacean/engine-terrain/rock-ridge/features/shaping/rock-surface.mjs";
import { buildRock } from "@galacean/engine-terrain/rock-formation/generator/rock-body.js";
import { simplifierReady } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";
import { generateRockFormation } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Generate";
import { MOUNTAIN_DEFAULTS } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/MountainSettings";

await simplifierReady;

it("allocates one hard budget across masses, including odd budgets and small supports", () => {
  for (const count of [1, 10, 22, 32]) {
    const budgets = allocateMountainTriangles(
      Array.from({ length: count }, (_, i) => i + 1),
      1001
    );
    expect(budgets.reduce((sum, value) => sum + value, 0)).toBe(1000);
    expect(budgets.every((value) => value >= 8 && value % 2 === 0)).toBe(true);
    expect(budgets.at(-1)).toBeGreaterThanOrEqual(budgets[0]);
  }
  for (const budget of [0, NaN, Infinity, -1, 1000.1])
    expect(() => allocateMountainTriangles([1], budget)).toThrow(RangeError);
});

it("retains real cut walls, closed topology and all extrema without moving vertices", () => {
  const library = generateRuntimeRocks({ buildRock, simplifyRock: (raw: any) => budgetMountainRock(raw, 128) }, 499);
  const carved = fractureRockGeometry(library.peak, { depth: 0.7, width: 1.9, irregularity: 1.8 });
  const original = new Set<string>();
  for (let i = 0; i < carved.positions.length; i += 3) original.add(carved.positions.slice(i, i + 3).join(":"));
  for (const budget of [40, 64, 128, 192]) {
    const lod = budgetMountainRock(carved, budget);
    expect(lod.indices.length / 3).toBeLessThanOrEqual(budget);
    expect(lod.faceTags.some((tag: number) => tag > 0)).toBe(true);
    for (let i = 0; i < lod.positions.length; i += 3)
      expect(original.has(lod.positions.slice(i, i + 3).join(":"))).toBe(true);
    for (let d = 0; d < 3; d++) {
      const values = lod.positions.filter((_: number, i: number) => i % 3 === d);
      expect(Math.min(...values)).toBeCloseTo(carved.bounds[0][d], 5);
      expect(Math.max(...values)).toBeCloseTo(carved.bounds[1][d], 5);
    }
    const edges = new Map<string, number>();
    for (let i = 0; i < lod.indices.length; i += 3)
      for (let c = 0; c < 3; c++) {
        const a = lod.indices[i + c],
          b = lod.indices[i + ((c + 1) % 3)],
          key = `${Math.min(a, b)}:${Math.max(a, b)}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
    const render = creasedRockAttributes(lod);
    for (let i = 0; i < render.normals.length; i += 3)
      expect(Math.hypot(...render.normals.slice(i, i + 3))).toBeCloseTo(1, 4);
  }
});

it("applies the cap to the entire job when a mountain contains multiple bounds", () => {
  const guide = {
    id: "a",
    ownerId: "a",
    center: [0, 30, 0],
    size: [96, 60, 80],
    axes: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ]
  };
  const result = generateRockFormation(
    {
      id: "mountain",
      kind: "mountain",
      seed: 2769142889,
      worldSeed: 499,
      triangleBudget: 1000,
      surfaceGrass: false,
      origin: [0, 0, 0],
      guides: [guide, { ...guide, id: "b", ownerId: "b", center: [100, 30, 0] }]
    } as any,
    {
      targetTriangles: 1000,
      mountain: { ...MOUNTAIN_DEFAULTS, ridgeArrangement: true, seededShapes: true, rockShaping: true }
    } as any
  );
  expect(result.mesh.indices.length / 3).toBeLessThanOrEqual(1000);
  expect(new Set(result.owners)).toEqual(new Set(["a", "b"]));
  expect(result.stats.carvedTriangles).toBeGreaterThan(0);
});
