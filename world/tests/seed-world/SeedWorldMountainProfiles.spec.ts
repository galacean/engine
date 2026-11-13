import { expect, it } from "vitest";
import {
  createMountainProfile,
  generateMountainProfileScene,
  MOUNTAIN_PROFILE_SOURCE
} from "@galacean/engine-terrain/rock-ridge/features/arrangement/mountain-profile.mjs";
import {
  generateMountainExamples,
  mountainSignature,
  mountainDistance
} from "@galacean/engine-terrain/rock-ridge/features/arrangement/mountain-examples.mjs";
import {
  generateRuntimeRocks,
  runtimeRockRecipes,
  runtimeRockFingerprint
} from "@galacean/engine-terrain/rock-ridge/features/shaping/atomic-rocks.mjs";
import { buildRock } from "@galacean/engine-terrain/rock-formation/generator/rock-body.js";
import { simplifyRock } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";
import { simplifierReady } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";
import type { RockFormationJob } from "@galacean/engine-terrain/rock-formation/types";
import { generateRockFormation } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Generate";
import { readRockFormationSettings } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import { importPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { SEMANTIC_DEFAULTS } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";

await simplifierReady;
const growProfile = (seed: number) => createMountainProfile(MOUNTAIN_PROFILE_SOURCE, seed);
const examples = generateMountainExamples(498);
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
  atomicSeed: examples.examples[0].atomicSeed,
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
  expect(generateMountainExamples(498)).toEqual(examples);
  const changed = generateMountainExamples(499);
  expect(examples.examples).toHaveLength(10);
  expect(new Set(examples.examples.map((e) => e.seed)).size).toBe(10);
  expect(new Set(examples.examples.map((e) => e.atomicSeed)).size).toBe(10);
  expect(changed.examples.some((e) => examples.examples.some((old) => e.seed === old.seed))).toBe(false);
  // The set is selected using all three projections, after principal-axis alignment.
  expect(examples.minimumSeparation).toBeGreaterThan(0.2);
  expect(changed.minimumSeparation).toBeGreaterThan(0.2);
  const plans = examples.examples.map((e) => growProfile(e.seed));
  expect(new Set(plans.map((p) => `${p.topology.peaks}:${p.topology.spurs}`)).size).toBeGreaterThan(5);
  expect(growProfile(examples.examples[0].seed)).toEqual(plans[0]);
}, 30000);

it("does not count yaw-only copies as new shapes", () => {
  for (const seed of [0, 498, 1336282038]) {
    const plan = growProfile(seed),
      signature = mountainSignature(MOUNTAIN_PROFILE_SOURCE, plan);
    for (const yaw of [0.83, 2.4, Math.PI, 4.6]) {
      const c = Math.cos(yaw),
        s = Math.sin(yaw);
      const rotate = (p: number[]) => [c * p[0] - s * p[2], p[1], s * p[0] + c * p[2]];
      const node = (n: any) => ({ ...n, position: rotate(n.position) });
      const rotated = {
        ...plan,
        nodes: plan.nodes.map(node),
        curves: plan.curves.map((curve: any) => ({ ...curve, knots: curve.knots.map(node) }))
      };
      const source = structuredClone(MOUNTAIN_PROFILE_SOURCE);
      for (let i = 0; i < source.terrain.positions.length; i += 3)
        source.terrain.positions.splice(i, 3, ...rotate(source.terrain.positions.slice(i, i + 3)));
      expect(mountainDistance(signature, mountainSignature(source, rotated))).toBeLessThan(0.001);
    }
  }
});

it("keeps every seeded profile within a connected mountain ridge family", () => {
  for (let seed = 0; seed < 64; seed++) {
    const plan = growProfile(seed),
      primary = plan.nodes.find((n: any) => n.primary)!;
    expect(plan.nodes.filter((n: any) => n.primary)).toHaveLength(1);
    expect(plan.topology.peaks).toBeGreaterThanOrEqual(1);
    expect(plan.topology.peaks).toBeLessThanOrEqual(5);
    expect(primary.y).toBeGreaterThan(20);
    expect(primary.y).toBeLessThan(44);
    const links = new Map<string, string[]>(plan.nodes.map((n: any) => [n.id, []]));
    for (const curve of plan.curves) {
      for (let i = 1; i < curve.knots.length; i++) {
        const a = curve.knots[i - 1],
          b = curve.knots[i];
        links.get(a.id)!.push(b.id);
        links.get(b.id)!.push(a.id);
      }
      if (curve.type === "summit-link") {
        const saddle = curve.knots.find((n: any) => n.role === "saddle");
        expect(saddle.y).toBeLessThan(Math.min(curve.knots[0].y, curve.knots.at(-1).y));
      }
    }
    const visited = new Set<string>(),
      queue = [primary.id];
    while (queue.length) {
      const id = queue.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      queue.push(...links.get(id)!);
    }
    expect(visited.size).toBe(plan.nodes.length);
    for (const node of plan.nodes) {
      expect(node.position.every(Number.isFinite)).toBe(true);
      expect(node.position[1]).toBe(node.y);
      expect(node.y).toBeGreaterThan(0);
      expect(node.y).toBeLessThanOrEqual(primary.y);
      if (node.role === "tail") expect(node.y).toBeLessThan(primary.y * 0.2);
    }
  }
});

it("uses the original fitter to make one connected mass with sparse small rocks", async () => {
  const fingerprints = new Set<string>();
  const parameterSets = new Set<string>();
  for (const example of examples.examples) {
    const library = generateRuntimeRocks({ buildRock, simplifyRock }, example.atomicSeed);
    fingerprints.add(runtimeRockFingerprint(library));
    parameterSets.add(JSON.stringify(runtimeRockRecipes(example.atomicSeed)));
    const scene = generateMountainProfileScene(MOUNTAIN_PROFILE_SOURCE, library, example.seed);
    expect(scene.ridge.composition.components).toBe(1);
    expect(scene.ridge.composition.smallRocks).toBeLessThanOrEqual(2);
    expect(scene.rocks.filter((r: any) => r.role !== "small accent").every((r: any) => r.massLengthM >= 12)).toBe(true);
    expect(scene.ridge.plan.profile.version).toBe("seeded-mountain-profile-1");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  expect(fingerprints.size).toBe(10);
  expect(parameterSets.size).toBe(10);
}, 120000);

it("publishes ten distinct carved meshes in native rotated OBBs, retaining their proportions", async () => {
  const sizes: number[][] = [];
  const bodies = new Set<number>();
  for (const example of examples.examples) {
    const result = generateRockFormation({ ...job, seed: example.seed, atomicSeed: example.atomicSeed }, settings);
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
    expect(result.stats.ridgePeaks).toBeGreaterThanOrEqual(1);
    expect(result.stats.ridgePeaks).toBeLessThanOrEqual(5);
    // Yield between synchronous worker-sized jobs so Vitest can deliver its
    // progress messages even when all ten fits take more than an RPC timeout.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const heights = sizes.map((s) => s[1]);
  expect(Math.max(...heights) / Math.min(...heights)).toBeGreaterThan(1.3);
  expect(bodies.size).toBeGreaterThan(4);
}, 120000);

it("keeps the new arrangement independent from carving and preserves exact replay after toggles", () => {
  const carved = generateRockFormation(job, settings);
  const uncarved = generateRockFormation(job, { ...settings, mountain: { ...settings.mountain, rockShaping: false } });
  const single = generateRockFormation(job, {
    ...settings,
    mountain: { ...settings.mountain, ridgeArrangement: false }
  });
  expect(uncarved.stats.bodies).toBeGreaterThan(1);
  expect(carved.stats.bodies).toBeGreaterThan(1);
  expect(uncarved.stats.ridgePeaks).toBe(carved.stats.ridgePeaks);
  expect(uncarved.stats.fractureMs).toBe(0);
  expect(uncarved.mesh.positions).not.toEqual(carved.mesh.positions);
  expect(single.stats.bodies).toBe(1);
  expect(single.stats.arrangementMs).toBe(0);
  const base = generateRockFormation(job, {
    ...settings,
    mountain: { ...settings.mountain, ridgeArrangement: false, rockShaping: false }
  });
  expect(base.stats.bodies).toBe(1);
  expect(base.stats.fractureMs).toBe(0);
  expect(base.stats.arrangementMs).toBe(0);
  expect(generateRockFormation(job, settings).mesh).toEqual(carved.mesh);
});

it("uses the individual atom seed independently of the ridge and world seeds", () => {
  const first = generateRockFormation(job, settings);
  const changed = generateRockFormation({ ...job, atomicSeed: examples.examples[1].atomicSeed }, settings);
  expect(changed.mesh.positions).not.toEqual(first.mesh.positions);
  expect(changed.stats.ridgePeaks).toBe(first.stats.ridgePeaks);
  expect(changed.stats.ridgeBranches).toBe(first.stats.ridgeBranches);
  expect(generateRockFormation({ ...job, worldSeed: 499 }, settings).mesh).toEqual(first.mesh);
  expect(generateRockFormation({ ...job, atomicSeed: undefined }, settings).mesh).toEqual(first.mesh);
}, 60000);

it("rejects an invalid candidate budget instead of leaving its worker in an unbounded loop", () => {
  for (const candidateCount of [Infinity, NaN, -1, 9, 257])
    expect(() => generateMountainExamples(498, 10, candidateCount)).toThrow(RangeError);
});
