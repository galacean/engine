import { expect, it } from "vitest";
import { simplifierReady } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";
import type { RockFormationJob } from "@galacean/engine-terrain/rock-formation/types";
import { generateRockFormation } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Generate";
import { readRockFormationSettings } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import { importPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { SEMANTIC_DEFAULTS } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { rockSurfaceAttributes } from "@galacean/engine-terrain/rock-formation/SurfaceAttributes";
import {
  PLANNING_VISUAL_AUTHORING,
  encodeVisualAuthoring,
  decodeVisualAuthoring
} from "../../demos/seed-world/src/planning/spatial/PlanningVisualAuthoring.ts";

await simplifierReady;
const document = importPlanningDocument({ version: 2, parameters: { ...SEMANTIC_DEFAULTS, seed: 425 }, edits: {} });
const defaults = readRockFormationSettings(document);
const settings = (arrangement: boolean, shaping: boolean) => ({
  ...defaults,
  mountain: {
    ...defaults.mountain!,
    ridgeArrangement: arrangement,
    rockShaping: shaping,
    ridgeSeededCounts: false,
    ridgePeaks: 2,
    ridgeBranches: 3
  }
});
const yaw = 0.43,
  c = Math.cos(yaw),
  s = Math.sin(yaw);
const job: RockFormationJob = {
  id: "mountain",
  kind: "mountain",
  worldSeed: 425,
  seed: 31,
  origin: [400, 12, 300],
  guides: [
    {
      id: "box",
      ownerId: "mountain:obb:box",
      center: [0, 30, 0],
      size: [120, 60, 90],
      axes: [
        [c, 0, s],
        [0, 1, 0],
        [-s, 0, c]
      ]
    }
  ]
};

it("publishes all four independent feature combinations with native bounds, normals and owners", () => {
  const results = [settings(false, false), settings(true, false), settings(false, true), settings(true, true)].map(
    (s) => generateRockFormation(job, s)
  );
  expect(results.map((r) => r.stats.bodies > 1)).toEqual([false, true, false, true]);
  expect(results[0].stats.fractureMs).toBe(0);
  expect(results[1].stats.fractureMs).toBe(0);
  expect(results[2].stats.arrangementMs).toBe(0);
  expect(results[1].stats.ridgePeaks).toBe(2);
  expect(results[3].stats.ridgePeaks).toBe(2);
  expect(results[3].mesh.indices.length / 3).toBeLessThan(90000);
  for (const result of results) {
    const obb = job.guides[0],
      p = result.mesh.positions;
    for (let i = 0; i < p.length; i += 3)
      for (let axis = 0; axis < 3; axis++) {
        const local = obb.axes[axis].reduce((sum, v, d) => sum + (p[i + d] - obb.center[d]) * v, 0);
        expect(Number.isFinite(local)).toBe(true);
        expect(Math.abs(local)).toBeLessThanOrEqual(obb.size[axis] / 2 + 0.0001);
      }
    expect(result.origin).toEqual(job.origin);
    expect(result.owners).toHaveLength(result.mesh.indices.length / 3);
    expect(new Set(result.owners)).toEqual(new Set([obb.ownerId]));
    expect(result.grass?.coverage.length).toBe(result.mesh.indices.length);
    if (result.mesh.cornerNormals) {
      const render = rockSurfaceAttributes(result);
      for (let i = 0; i < result.mesh.indices.length; i++) {
        const normal = result.mesh.cornerNormals.subarray(i * 3, i * 3 + 3);
        expect(Math.hypot(...normal)).toBeCloseTo(1, 4);
        expect([...render.data.subarray(i * render.stride + 3, i * render.stride + 6)]).toEqual([...normal]);
      }
    }
  }
  const replay = generateRockFormation(job, settings(true, true));
  expect(replay.mesh).toEqual(results[3].mesh);
  const changed = generateRockFormation({ ...job, seed: 32 }, settings(true, true));
  expect(changed.mesh.positions).not.toEqual(replay.mesh.positions);
}, 60000);

it("keeps decorative and streamed stones on their existing generation path", () => {
  const stone = { ...job, kind: undefined, surfaceGrass: false };
  expect(generateRockFormation(stone, settings(true, true)).mesh).toEqual(
    generateRockFormation(stone, settings(false, false)).mesh
  );
});

it("changes only render normals when fracture smoothing changes", () => {
  const controls = settings(true, true);
  const hard = generateRockFormation(job, { ...controls, mountain: { ...controls.mountain, fractureSmoothing: 0 } });
  const smooth = generateRockFormation(job, { ...controls, mountain: { ...controls.mountain, fractureSmoothing: 1 } });
  expect(smooth.mesh.cornerNormals).not.toEqual(hard.mesh.cornerNormals);
  expect({ ...smooth.mesh, cornerNormals: undefined }).toEqual({ ...hard.mesh, cornerNormals: undefined });
  expect(smooth.owners).toEqual(hard.owners);
  expect(smooth.grass).toEqual(hard.grass);
  for (let i = 0; i < smooth.mesh.cornerNormals!.length; i += 3)
    expect(Math.hypot(...smooth.mesh.cornerNormals!.subarray(i, i + 3))).toBeCloseTo(1, 4);
});

it("reads independently persisted controls without adding overrides to legacy documents", () => {
  expect(defaults.mountain).toMatchObject({ ridgeArrangement: false, rockShaping: false });
  const saved = structuredClone(document);
  saved.entities.world.components.rockFormation = {
    values: { ridgeArrangement: true, rockShaping: false, ridgePeaks: 5, fractureDepth: 0.7, fractureSmoothing: 0.8 }
  };
  expect(readRockFormationSettings(JSON.parse(JSON.stringify(saved))).mountain).toMatchObject({
    ridgeArrangement: true,
    rockShaping: false,
    ridgePeaks: 5,
    fractureDepth: 0.7,
    fractureSmoothing: 0.8
  });
  const descriptor = PLANNING_VISUAL_AUTHORING.find((d) => d.component === "rockFormation")!;
  const component = saved.entities.world.components.rockFormation;
  expect(decodeVisualAuthoring(descriptor, encodeVisualAuthoring(descriptor, component))).toEqual(component);
});
