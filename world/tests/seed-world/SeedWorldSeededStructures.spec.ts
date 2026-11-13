import { expect, it } from "vitest";
import {
  growStructure,
  massFrame,
  massCorners
} from "@galacean/engine-terrain/rock-ridge/features/arrangement/growth/plan.mjs";
import {
  generateStructureExamples,
  structureSignature,
  structureDistance
} from "@galacean/engine-terrain/rock-ridge/features/arrangement/growth/diversity.mjs";
import { simplifierReady } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";
import type { RockFormationJob } from "@galacean/engine-terrain/rock-formation/types";
import { generateRockFormation } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Generate";
import { readRockFormationSettings } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import { importPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { SEMANTIC_DEFAULTS } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";

await simplifierReady;
const examples = generateStructureExamples(498);
const document = importPlanningDocument({ version: 2, parameters: { ...SEMANTIC_DEFAULTS, seed: 498 }, edits: {} });
const defaults = readRockFormationSettings(document);
const settings = {
  ...defaults,
  targetTriangles: 1000,
  mountain: { ...defaults.mountain!, seededShapes: true, ridgeArrangement: true, rockShaping: true }
};
const yaw = 0.43,
  c = Math.cos(yaw),
  s = Math.sin(yaw);
const job: RockFormationJob = {
  id: "seeded-structure",
  kind: "mountain",
  worldSeed: 498,
  seed: examples.examples[0].seed,
  origin: [400, 12, 300],
  surfaceGrass: false,
  guides: [
    {
      id: "box",
      ownerId: "seeded-structure:box",
      center: [0, 30, 0],
      size: [96, 60, 80],
      axes: [
        [c, 0, s],
        [0, 1, 0],
        [-s, 0, c]
      ]
    }
  ]
};

it("replays an entire diverse set from one seed and generates a new set when it changes", () => {
  expect(generateStructureExamples(498)).toEqual(examples);
  const changed = generateStructureExamples(499);
  expect(examples.examples).toHaveLength(10);
  expect(new Set(examples.examples.map((e) => e.seed)).size).toBe(10);
  expect(changed.examples.some((e) => examples.examples.some((old) => e.seed === old.seed))).toBe(false);
  // The set is selected using all three projections, after principal-axis alignment.
  expect(examples.minimumSeparation).toBeGreaterThan(0.45);
  expect(changed.minimumSeparation).toBeGreaterThan(0.45);
  const plans = examples.examples.map((e) => growStructure(e.seed));
  expect(new Set(plans.map((p) => `${p.nodes.length}:${p.edges.length}`)).size).toBeGreaterThan(5);
  expect(growStructure(examples.examples[0].seed)).toEqual(plans[0]);
}, 30000);

it("does not count yaw-only copies as new shapes", () => {
  for (const seed of [0, 498, 1336282038]) {
    const plan = growStructure(seed),
      signature = structureSignature(plan);
    for (const yaw of [0.83, 2.4, Math.PI, 4.6]) {
      const c = Math.cos(yaw),
        s = Math.sin(yaw);
      const rotate = (p: number[]) => [c * p[0] - s * p[2], p[1], s * p[0] + c * p[2]];
      const rotated = {
        ...plan,
        masses: plan.masses.map((m) => ({ ...m, center: rotate(m.center), frame: massFrame(m).map(rotate) }))
      };
      expect(structureDistance(signature, structureSignature(rotated))).toBeLessThan(0.001);
    }
  }
});

it("keeps supporting masses grounded and tilted frames orthonormal across seeds", () => {
  for (let seed = 0; seed < 64; seed++) {
    const plan = growStructure(seed);
    for (const mass of plan.masses) {
      expect(mass.size.every((v: number) => Number.isFinite(v) && v > 0)).toBe(true);
      const frame = massFrame(mass);
      for (let a = 0; a < 3; a++)
        for (let b = 0; b < 3; b++)
          expect(frame[a].reduce((sum: number, v: number, d: number) => sum + v * frame[b][d], 0)).toBeCloseTo(
            a === b ? 1 : 0,
            6
          );
      const corners = massCorners(mass);
      const low = Math.min(...corners.map((p) => p[1]));
      expect(low).toBeGreaterThanOrEqual(-0.000001);
      expect(Math.max(...corners.map((p) => p[1]))).toBeLessThanOrEqual(52.000001);
      if (mass.role === "support" || mass.role === "foundation") expect(low).toBeCloseTo(0, 6);
    }
  }
});

it("publishes ten distinct carved meshes in native rotated OBBs, retaining their proportions", () => {
  const sizes: number[][] = [];
  const bodies = new Set<number>();
  for (const example of examples.examples) {
    const result = generateRockFormation({ ...job, seed: example.seed }, settings);
    const low = [Infinity, Infinity, Infinity],
      high = [-Infinity, -Infinity, -Infinity];
    const obb = job.guides[0],
      p = result.mesh.positions;
    for (let i = 0; i < p.length; i += 3)
      for (let axis = 0; axis < 3; axis++) {
        const local = obb.axes[axis].reduce((sum, v, d) => sum + (p[i + d] - obb.center[d]) * v, 0);
        low[axis] = Math.min(low[axis], local);
        high[axis] = Math.max(high[axis], local);
      }
    for (let d = 0; d < 3; d++) {
      expect(low[d]).toBeGreaterThanOrEqual(-obb.size[d] / 2 - 0.0001);
      expect(high[d]).toBeLessThanOrEqual(obb.size[d] / 2 + 0.0001);
    }
    expect(low[1]).toBeCloseTo(-30, 4);
    expect([...p].every(Number.isFinite)).toBe(true);
    expect([...result.mesh.indices].every((i) => i < p.length / 3)).toBe(true);
    expect(result.owners).toHaveLength(result.mesh.indices.length / 3);
    expect(new Set(result.owners)).toEqual(new Set([obb.ownerId]));
    const normals = result.mesh.cornerNormals!;
    let normalError = 0;
    for (let i = 0; i < normals.length; i += 3)
      normalError = Math.max(normalError, Math.abs(Math.hypot(normals[i], normals[i + 1], normals[i + 2]) - 1));
    expect(normalError).toBeLessThan(0.0001);
    sizes.push(high.map((v, d) => v - low[d]));
    bodies.add(result.stats.bodies);
  }
  const heights = sizes.map((s) => s[1]);
  expect(Math.max(...heights) / Math.min(...heights)).toBeGreaterThan(2);
  expect(bodies.size).toBeGreaterThan(4);
}, 60000);

it("keeps the new arrangement independent from carving and preserves exact replay after toggles", () => {
  const carved = generateRockFormation(job, settings);
  const uncarved = generateRockFormation(job, { ...settings, mountain: { ...settings.mountain, rockShaping: false } });
  const single = generateRockFormation(job, {
    ...settings,
    mountain: { ...settings.mountain, ridgeArrangement: false }
  });
  expect(uncarved.stats.bodies).toBe(carved.stats.bodies);
  expect(uncarved.stats.fractureMs).toBe(0);
  expect(uncarved.mesh.positions).not.toEqual(carved.mesh.positions);
  expect(single.stats.bodies).toBe(1);
  expect(single.stats.arrangementMs).toBe(0);
  expect(generateRockFormation(job, settings).mesh).toEqual(carved.mesh);
});

it("rejects an invalid candidate budget instead of leaving its worker in an unbounded loop", () => {
  for (const candidateCount of [Infinity, NaN, -1, 9, 257])
    expect(() => generateStructureExamples(498, 10, candidateCount)).toThrow(RangeError);
});
