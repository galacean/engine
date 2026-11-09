import { beforeAll, describe, expect, it } from "vitest";
import initialize from "manifold-3d";
import { unionRocks, compoundGuides } from "../../demos/procedural-rock/CompoundRock.js";
import { ROCK_SCENE_PRESETS } from "../../demos/procedural-rock/presets.js";
import { simplifierReady } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";

let api: Awaited<ReturnType<typeof initialize>>;
beforeAll(async () => {
  api = await initialize();
  api.setup();
  await simplifierReady;
});
const p = ROCK_SCENE_PRESETS.find((preset) => preset.id === "compound-cliff")!.parameters;
const reduction = { targetTriangles: 1000, error: 0.008 };
function volume(mesh: { positions: Float32Array; indices: Uint32Array }) {
  const { positions: p, indices } = mesh;
  let result = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3];
    result +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) +
      p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return result / 6;
}
describe("procedural rock solid union", () => {
  it("removes coincident interiors instead of concatenating duplicate surfaces", () => {
    const guide = compoundGuides(p)[0];
    const one = unionRocks([guide], reduction, api);
    const duplicate = unionRocks([guide, guide], reduction, api);
    expect(volume(duplicate)).toBeCloseTo(volume(one), 3);
    expect(duplicate.indices.length).toBe(one.indices.length);
    expect(duplicate.stats.componentCount).toBe(1);
  });
  it("unites tilted overlapping OBBs and keeps their individual envelope", () => {
    const guides = compoundGuides(p);
    const result = unionRocks(guides, reduction, api, p.planeCut);
    const a = unionRocks([guides[0]], reduction, api, p.planeCut);
    const b = unionRocks([guides[1]], reduction, api, p.planeCut);
    expect(result.stats.componentCount).toBe(1);
    expect(volume(result)).toBeGreaterThan(Math.max(volume(a), volume(b)));
    expect(volume(result)).toBeLessThan(volume(a) + volume(b));
    expect(result.guideBoxes).toHaveLength(2);
    expect([...result.positions, ...result.normals, ...result.surfaceRoles].every(Number.isFinite)).toBe(true);
    for (let k = 0; k < result.positions.length; k++) {
      expect(result.positions[k]).toBeGreaterThanOrEqual(result.envelopeBounds[0][k % 3] - 1e-5);
      expect(result.positions[k]).toBeLessThanOrEqual(result.envelopeBounds[1][k % 3] + 1e-5);
    }
    const vertices = new Map<string, number>();
    const ids = Array.from({ length: result.positions.length / 3 }, (_, i) => {
      const key = Array.from(result.positions.subarray(i * 3, i * 3 + 3), (x) => x.toFixed(5)).join("/");
      if (!vertices.has(key)) vertices.set(key, vertices.size);
      return vertices.get(key)!;
    });
    const edges = new Map<string, number>();
    for (let i = 0; i < result.indices.length; i += 3) {
      const face = [ids[result.indices[i]], ids[result.indices[i + 1]], ids[result.indices[i + 2]]];
      expect(new Set(face).size).toBe(3);
      for (let e = 0; e < 3; e++) {
        const a = face[e],
          b = face[(e + 1) % 3];
        const key = `${Math.min(a, b)}/${Math.max(a, b)}`;
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
    for (let i = 0; i < result.positions.length; i += 3) {
      // A union surface must belong to at least one oriented authoring volume,
      // not merely lie inside the larger world-aligned bounding box.
      const point = Array.from(result.positions.subarray(i, i + 3));
      expect(
        result.guideBoxes.some((box) =>
          [1, 2, 4].every((bit) => {
            const edge = box[bit].map((value, axis) => value - box[0][axis]);
            const t =
              edge.reduce((sum, value, axis) => sum + value * (point[axis] - box[0][axis]), 0) /
              edge.reduce((sum, value) => sum + value * value, 0);
            return t >= -1e-5 && t <= 1 + 1e-5;
          })
        )
      ).toBe(true);
    }
  });
  it("reports separated solids rather than inventing a bridge", () => {
    const guides = compoundGuides({ ...p, blockX: 40 });
    const result = unionRocks(guides, reduction, api);
    expect(result.stats.componentCount).toBe(2);
  });
});

it("keeps all corners of a new planar cut on the same lighting normal", () => {
  const mesh = unionRocks([compoundGuides(p)[0]], reduction, api, p.planeCut);
  let tested = 0;
  for (const side of [-1, 1]) {
    const n = [0.09 * side, 0.1, -side],
      length = Math.hypot(...n);
    const offset = ((-p.obbDepth / 2) * (1 - p.planeCut)) / length;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const ids = Array.from(mesh.indices.subarray(t, t + 3));
      if (
        !ids.every(
          (v) => Math.abs(n.reduce((s, x, k) => s + (x * mesh.positions[v * 3 + k]) / length, 0) - offset) < 1e-5
        )
      )
        continue;
      tested++;
      for (const v of ids) {
        const normal = mesh.normals.subarray(v * 3, v * 3 + 3);
        expect(normal.reduce((s, x, k) => s - (x * n[k]) / length, 0)).toBeGreaterThan(0.99999);
        expect(mesh.surfaceRoles[v]).toBe(0);
      }
    }
  }
  expect(tested).toBeGreaterThan(10);
});
