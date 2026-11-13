import { expect, it } from "vitest";
import { assignMountainVariants, resolveMountainVariant } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/MountainVariants";
import { generateRockFormation } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Generate";
import { readRockFormationSettings } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import { simplifierReady } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";
import { generateMountainExamples } from "@galacean/engine-terrain/rock-ridge/features/arrangement/mountain-examples.mjs";
import { importPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { SEMANTIC_DEFAULTS } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { applyPlanningMountainSet } from "../../demos/seed-world/src/planning/spatial/PlanningStartupTemplate.ts";
import type { RockFormationJob } from "@galacean/engine-terrain/rock-formation/types";

await simplifierReady;
const job = (id: string): RockFormationJob => ({
  id, seed: 42, worldSeed: 499, kind: "mountain", surfaceGrass: false, origin: [5, 2, 7],
  guides: [{ id, ownerId: id, center: [0, 30, 0], size: [96, 60, 80], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }]
});

it("distributes the gallery's exact ten seeds, sharing atoms and retaining stable per-placement variation", () => {
  const jobs = Array.from({ length: 20 }, (_, i) => job(`mountain-${String(i).padStart(2, "0")}`));
  const stone = { ...job("stone"), kind: undefined };
  const assigned = assignMountainVariants([...jobs, stone], true);
  const set = generateMountainExamples(499);
  expect(assigned.at(-1)).toBe(stone);
  expect(assignMountainVariants(jobs, false)).toBe(jobs);
  expect(assigned.slice(0, 10).map((j) => resolveMountainVariant(j).seed)).toEqual(set.examples.map((e) => e.seed));
  expect(new Set(assigned.slice(0, 20).map((j) => resolveMountainVariant(j).atomicSeed))).toEqual(new Set([499]));
  expect(assigned.slice(0, 20).every((j) => j.triangleBudget === 1000)).toBe(true);
  expect(new Set(assigned.slice(0, 20).map((j) => JSON.stringify(j.mountainTransform))).size).toBe(20);
  const reordered = assignMountainVariants([...jobs].reverse(), true).reverse();
  expect(reordered).toEqual(assigned.slice(0, 20));
  const resized = assignMountainVariants(jobs.map((j) => ({ ...j, guides: [{ ...j.guides[0], size: [60, 40, 90] as [number, number, number] }] })), true);
  expect(resized.map((j) => [j.mountainVariant, j.mountainTransform])).toEqual(assigned.slice(0, 20).map((j) => [j.mountainVariant, j.mountainTransform]));
});

it("keeps skewed, scaled placements grounded, carved and inside rotated OBBs without changing topology", () => {
  const document = importPlanningDocument({ version: 2, parameters: { ...SEMANTIC_DEFAULTS, seed: 499 }, edits: {} });
  applyPlanningMountainSet(document);
  const settings = readRockFormationSettings(document);
  const placed = assignMountainVariants([job("mountain")], true)[0];
  const yaw = 0.43, c = Math.cos(yaw), s = Math.sin(yaw);
  placed.guides[0].axes = [[c, 0, s], [0, 1, 0], [-s, 0, c]];
  const base = generateRockFormation({ ...placed, mountainTransform: undefined }, settings);
  const varied = generateRockFormation(placed, settings);
  expect(varied.mesh.indices).toEqual(base.mesh.indices);
  expect(varied.mesh.positions).not.toEqual(base.mesh.positions);
  expect(varied.mesh.cornerNormals).not.toEqual(base.mesh.cornerNormals);
  expect(varied.mesh.indices.length / 3).toBeLessThanOrEqual(1000);
  expect(varied.stats.carvedTriangles).toBeGreaterThan(10);
  expect(varied.stats.mountainVariant).toBe(0);
  expect(varied.origin).toEqual(placed.origin);
  let lowY = Infinity;
  const p = varied.mesh.positions, box = placed.guides[0];
  for (let i = 0; i < p.length; i += 3) for (let axis = 0; axis < 3; axis++) {
    const local = box.axes[axis].reduce((sum, v, d) => sum + (p[i + d] - box.center[d]) * v, 0);
    expect(Math.abs(local)).toBeLessThanOrEqual(box.size[axis] / 2 + 0.0001);
    if (axis === 1) lowY = Math.min(lowY, local);
  }
  expect(lowY).toBeCloseTo(-30, 4);
  for (let i = 0; i < varied.mesh.cornerNormals!.length; i += 3)
    expect(Math.hypot(...varied.mesh.cornerNormals!.subarray(i, i + 3))).toBeCloseTo(1, 4);
  expect(generateRockFormation(placed, settings).mesh).toEqual(varied.mesh);
}, 30000);
