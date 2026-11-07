import { simplifierReady } from "../../../packages/terrain/src/rock-formation/generator/simplify-rock.js";
import { expect, it } from "vitest";
import {
  generateRockFormation,
  rockParameters
} from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Generate.ts";
import { readRockFormationSettings } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Settings.ts";
import type { PlanningDocument } from "../../../packages/world-planning/src/spatial/PlanningDocument.ts";
import type { RockFormationJob, V3 } from "../../../packages/terrain/src/rock-formation/types.ts";

await simplifierReady;
const settings = readRockFormationSettings({ entities: {} } as PlanningDocument);
function job(size: V3, seed = 31): RockFormationJob {
  const yaw = 0.43,
    c = Math.cos(yaw),
    s = Math.sin(yaw);
  return {
    id: "rock",
    seed,
    origin: [401, 13, 208],
    guides: [
      {
        id: "rock:obb",
        ownerId: "rock:obb",
        center: [5, 10, -7],
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
it.each<V3>([
  [0.6, 0.4, 0.8],
  [9, 38, 8],
  [180, 64, 140]
])(
  "keeps the reduced physical mesh inside its published OBB %s",
  (width, height, depth) => {
    const input = job([width, height, depth]),
      result = generateRockFormation(input, settings),
      obb = input.guides[0];
    const { positions, indices, normals } = result.mesh;
    const extent = [Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        const value = obb.axes[axis].reduce(
          (sum, component, world) => sum + (positions[i + world] - obb.center[world]) * component,
          0
        );
        expect(Math.abs(value)).toBeLessThanOrEqual(obb.size[axis] / 2 + 1e-4);
        if (axis === 1) {
          extent[0] = Math.min(extent[0], value);
          extent[1] = Math.max(extent[1], value);
        }
      }
      expect(Math.hypot(...normals!.subarray(i, i + 3))).toBeCloseTo(1, 4);
    }
    expect(extent[0]).toBeCloseTo(-height / 2, 3);
    expect(extent[1] - extent[0]).toBeGreaterThan(height * 0.98);
    expect(result.owners).toHaveLength(indices.length / 3);
    expect(new Set(result.owners)).toEqual(new Set([obb.ownerId]));
    expect(result.origin).toEqual(input.origin);
    expect(result.textureScale).toBe(Math.max(width, height, depth) / 2);
    expect(indices.length / 3).toBeLessThan(result.stats.rawTriangles!);
    expect(indices.length / 3).toBeLessThanOrEqual(1000);
    expect(result.stats).toMatchObject({ targetTriangles: 1000, overBudgetBodies: 0 });
    expect(result.grass!.coverage.some((v) => v > 0.99)).toBe(true);
  },
  30000
);
it("uses the same reduced geometry for a bare ground stone and a grass-covered formation", () => {
  const input = job([4, 3, 5]);
  const meadow = generateRockFormation(input, settings),
    bare = generateRockFormation({ ...input, surfaceGrass: false }, settings);
  expect(meadow.mesh.positions).toEqual(bare.mesh.positions);
  expect(meadow.mesh.indices).toEqual(bare.mesh.indices);
  expect(bare.grass).toBeUndefined();
}, 30000);
it("has deterministic variations and broad foundations for the ordinary-world defaults", () => {
  const input = job([9, 38, 8]),
    first = rockParameters(input.guides[0], input.seed, settings);
  expect(rockParameters(input.guides[0], input.seed, settings)).toEqual(first);
  for (let seed = 1; seed < 100; seed++) {
    const p = rockParameters(input.guides[0], seed, settings);
    expect(p.bottomScale).toBeGreaterThan(0.8);
    expect(p.topScale).toBeGreaterThanOrEqual(0.95);
    expect(p.topRoughness).toBeGreaterThan(0.3);
    expect(p.obbHeight).toBe(38);
  }
});
