import { beforeAll, describe, expect, it } from "vitest";
import initialize from "manifold-3d";
import { overlappingRockGroups } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/OverlapGroups.ts";
import { unionRockFormations } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Union.ts";
import { generateRockFormation } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Generate.ts";
import { readRockFormationSettings } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Settings.ts";
import { simplifierReady } from "../../../packages/terrain/src/rock-formation/generator/simplify-rock.js";
import type { RockFormationJob, RockFormationMesh, V3 } from "../../../packages/terrain/src/rock-formation/types.ts";
import type { PlanningDocument } from "../../../packages/world-planning/src/spatial/PlanningDocument.ts";

function job(id: string, origin: V3, size: V3 = [4, 6, 4], yaw = 0): RockFormationJob {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  return {
    id,
    seed: 37,
    origin,
    guides: [
      {
        id,
        ownerId: id,
        center: [0, size[1] / 2, 0],
        size,
        axes: [
          [c, 0, s],
          [0, 1, 0],
          [-s, 0, c]
        ]
      }
    ]
  };
}
describe("automatic OBB grouping", () => {
  it("groups transitive intersections without moving authoring volumes", () => {
    const jobs = [job("a", [0, 0, 0]), job("b", [3, 0, 0]), job("c", [6, 0, 0]), job("d", [50, 0, 0])];
    const before = structuredClone(jobs);
    expect(overlappingRockGroups(jobs)).toEqual([[0, 1, 2], [3]]);
    expect(jobs).toEqual(before);
  });
  it("rejects rotated AABB false positives and merely touching boxes", () => {
    const angle = Math.PI / 4;
    expect(
      overlappingRockGroups([job("a", [0, 0, 0], [8, 2, 1], angle), job("b", [-1.5, 0, 1.5], [8, 2, 1], angle)])
    ).toEqual([[0], [1]]);
    expect(overlappingRockGroups([job("a", [0, 0, 0]), job("b", [4, 0, 0])])).toEqual([[0], [1]]);
    expect(overlappingRockGroups([])).toEqual([]);
  });
});

let api: Awaited<ReturnType<typeof initialize>>;
beforeAll(async () => {
  api = await initialize();
  api.setup();
  await simplifierReady;
});
const settings = () => readRockFormationSettings({ entities: {} } as PlanningDocument);
function volume(formations: RockFormationMesh[]) {
  let result = 0;
  for (const f of formations) {
    const p = (v: number, k: number) => f.mesh.positions[v * 3 + k] + f.origin[k];
    for (let t = 0; t < f.mesh.indices.length; t += 3) {
      const [a, b, c] = f.mesh.indices.subarray(t, t + 3);
      result +=
        p(a, 0) * (p(b, 1) * p(c, 2) - p(b, 2) * p(c, 1)) +
        p(a, 1) * (p(b, 2) * p(c, 0) - p(b, 0) * p(c, 2)) +
        p(a, 2) * (p(b, 0) * p(c, 1) - p(b, 1) * p(c, 0));
    }
  }
  return result / 6;
}
function expectClosedExterior(formations: RockFormationMesh[]) {
  const edges = new Map<string, number>();
  for (const f of formations) {
    const ids = Array.from({ length: f.mesh.positions.length / 3 }, (_, v) =>
      [0, 1, 2].map((k) => (f.mesh.positions[v * 3 + k] + f.origin[k]).toFixed(4)).join("/")
    );
    for (let t = 0; t < f.mesh.indices.length; t += 3) {
      const face = Array.from(f.mesh.indices.subarray(t, t + 3), (i) => ids[i]);
      expect(new Set(face).size).toBe(3);
      for (let e = 0; e < 3; e++) {
        const a = face[e],
          b = face[(e + 1) % 3],
          key = [a, b].sort().join(":");
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
  }
  expect([...edges.values()].every((n) => n === 2)).toBe(true);
}
it("cuts internal surfaces while preserving per-rock picking, tiling, grass and local coordinates", () => {
  const jobs = [job("a", [600, 17, -700]), job("b", [601, 17, -699], [3, 4, 3], 0.27)];
  jobs[1].surfaceGrass = false;
  const input = jobs.map((j) => generateRockFormation(j, settings()));
  const before = input.map((f) => f.mesh.positions.slice());
  const result = unionRockFormations(input, api);
  expect(result.map((f) => f.id)).toEqual(["a", "b"]);
  expect(volume(result)).toBeLessThan(volume(input));
  expect(volume(result)).toBeGreaterThan(Math.max(...input.map((f) => volume([f]))));
  for (const [i, f] of result.entries()) {
    expect(f.mesh.indices.length).toBeGreaterThan(0);
    expect(f.textureScale).toBe(input[i].textureScale);
    expect(f.origin).toEqual(input[i].origin);
    expect(new Set(f.owners)).toEqual(new Set([jobs[i].id]));
    expect(f.owners.length).toBe(f.mesh.indices.length / 3);
    expect(input[i].mesh.positions).toEqual(before[i]);
    for (let v = 0; v < f.mesh.normals!.length; v += 3)
      expect(Math.hypot(...f.mesh.normals!.subarray(v, v + 3))).toBeCloseTo(1, 5);
    for (let v = 0; v < f.mesh.positions.length; v += 3) {
      const point = [0, 1, 2].map(
        (k) => f.mesh.positions[v + k] + f.origin[k] - jobs[i].origin[k] - jobs[i].guides[0].center[k]
      );
      const guide = jobs[i].guides[0];
      for (let a = 0; a < 3; a++)
        expect(Math.abs(point.reduce((sum, x, k) => sum + x * guide.axes[a][k], 0))).toBeLessThanOrEqual(
          guide.size[a] / 2 + 1e-4
        );
    }
  }
  expect(result[0].grass!.coverage).toHaveLength(result[0].mesh.indices.length);
  expect([...result[0].grass!.coverage].every((v) => v >= 0 && v <= 1)).toBe(true);
  expect(Math.max(...result[0].grass!.coverage)).toBeGreaterThan(0.9);
  expect(result[1].grass).toBeUndefined();
  expectClosedExterior(result);
});
it("removes coincident duplicate faces without changing exterior volume", () => {
  const first = generateRockFormation(job("a", [0, 0, 0]), settings());
  const second = { ...first, id: "duplicate", owners: first.owners.map(() => "duplicate") };
  const result = unionRockFormations([first, second], api);
  expect(result).toHaveLength(2);
  expect(result.reduce((s, f) => s + f.mesh.indices.length, 0)).toBe(first.mesh.indices.length);
  expect(volume(result)).toBeCloseTo(volume([first]), 4);
  expectClosedExterior(result);
});

it("retains a fully buried owner as an empty patch for editing and cache identity", () => {
  const first = generateRockFormation(job("outer", [0, 0, 0]), settings());
  const inner = generateRockFormation(job("inner", [0, 2, 0], [0.2, 0.2, 0.2]), settings());
  const result = unionRockFormations([first, inner], api);
  expect(result[1].id).toBe("inner");
  expect(result[1].mesh.indices.length).toBe(0);
  expect(result[1].mesh.positions.length).toBe(0);
  expect(result[1].owners).toEqual([]);
  expect(result[1].grass!.patches).toEqual([]);
  expect(volume(result)).toBeCloseTo(volume([first]), 4);
});
