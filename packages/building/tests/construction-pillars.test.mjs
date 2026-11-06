import { test } from "vitest";
import assert from "node:assert/strict";
import { buildConstructionFoundation } from "../src/building/runtime/ConstructionFoundation.ts";
const rectangle = { type: "rectangle", center: [0, 0], width: 8, depth: 6, orientation: [1, 0] };
const circle = { type: "circle", center: [0, 0], radius: 3, phase: 0.3 };
test("independent pillars keep open gaps, level bearing course and grounded feet on slopes", () => {
  for (const shape of [rectangle, circle]) {
    const terrain = (x, z) => x * 0.3 + z * 0.12;
    const p = buildConstructionFoundation({ id: "base", shape, height: 2, terrain });
    assert(p.pillars.length >= 4);
    assert(p.pillars.every((x) => x.endY === p.topY - 0.24));
    assert(new Set(p.pillars.map((x) => x.startY)).size > 1);
    assert(p.pillars.every((x) => x.startY < terrain(x.point[0], x.point[2])));
    const vertical = p.geometry.triangles.filter((t) => new Set(t.map((i) => p.geometry.vertices[i][1])).size > 1);
    for (const t of vertical) {
      const ps = t.map((i) => p.geometry.vertices[i]);
      if (Math.min(...ps.map((p) => p[1])) < p.topY - 0.24 - 1e-8) {
        assert(Math.max(...ps.map((p) => p[0])) - Math.min(...ps.map((p) => p[0])) < 1.6);
        assert(Math.max(...ps.map((p) => p[2])) - Math.min(...ps.map((p) => p[2])) < 1.6);
      }
    }
    assert(p.cells.every((c) => c.size.every((x) => Number.isFinite(x) && x > 0)));
  }
});
test("zero authored elevation keeps walls grounded and never creates support geometry", () => {
  const flat = buildConstructionFoundation({ id: "base", shape: rectangle, height: 0, terrain: () => 4 });
  assert.equal(flat.pillars.length, 0);
  const slope = buildConstructionFoundation({ id: "base", shape: rectangle, height: 0, terrain: (x) => x * 0.4 });
  assert.equal(slope.pillars.length, 0);
  for (const p of [flat, slope]) {
    assert.equal(p.cells.length, 0);
    assert.equal(p.geometry.triangles.length, 0);
  }
});
test("material substitution retains explicit rule and pillar topology; changing rule changes units", () => {
  const input = { id: "base", shape: circle, height: 3, terrain: () => 0, rule: "grid" };
  const brick = buildConstructionFoundation(input),
    wood = buildConstructionFoundation({ ...input, material: "wooden_plank" });
  assert.deepEqual(brick.cells, wood.cells);
  assert.deepEqual(brick.geometry, wood.geometry);
  assert.deepEqual(brick.pillars, wood.pillars);
  const stagger = buildConstructionFoundation({ ...input, rule: "staggered_rows" });
  assert.deepEqual(brick.geometry, stagger.geometry);
  assert.notDeepEqual(brick.cells, stagger.cells);
  assert.deepEqual(brick, buildConstructionFoundation(input));
});

test("structural notifications ignore material/rule/footprint edits but retain actual support changes", async () => {
  const { ConstructionSurfaceQuery } = await import("../src/building/runtime/ConstructionSurfaceQuery.ts");
  const input = { id: "base", shape: circle, height: 3, terrain: () => 0, rule: "grid" };
  const query = (p) => new ConstructionSurfaceQuery(p.previewParts, [0, 0, 0], () => "building");
  const original = query(buildConstructionFoundation(input));
  for (const edit of [
    { material: "wooden_plank" },
    { rule: "staggered_rows" },
    { footprint: { width: 0.8, height: 0.4, depth: 0.2 } },
    { material: "wooden_plank", rule: "parallel_rows", footprint: { width: 0.4, height: 0.5, depth: 0.3 } }
  ])
    assert(original.hasSameGeometry(query(buildConstructionFoundation({ ...input, ...edit }))));
  assert(!original.hasSameGeometry(query(buildConstructionFoundation({ ...input, height: 4 }))));
});
test("neighbor occupied volumes remove concealed columns without moving the bearing elevation", () => {
  const input = { id: "base", shape: rectangle, height: 3, terrain: () => 0 };
  const a = buildConstructionFoundation(input);
  const b = buildConstructionFoundation({
    ...input,
    neighbors: [{ shape: { ...rectangle, center: [4, 0] }, bottomY: 0, topY: 6 }]
  });
  assert(b.pillars.length > 0 && b.pillars.length < a.pillars.length);
  assert.equal(a.topY, b.topY);
  assert(b.pillars.every((p) => p.point[0] <= 0));
});

test("support unit seeds change the arrangement without changing physical supports", () => {
  for (const mode of ["auto", "solid"]) {
    const input = { id: "base", shape: circle, height: 3, terrain: () => 0, mode, rule: "grid" };
    const original = buildConstructionFoundation(input);
    const edited = buildConstructionFoundation({ ...input, seed: 42 });
    assert.notDeepEqual(edited.cells, original.cells);
    assert.deepEqual(edited.geometry, original.geometry);
    assert.deepEqual(edited.previewParts, original.previewParts);
    assert.deepEqual(edited, buildConstructionFoundation({ ...input, seed: 42 }));
  }
});

test("circular pillar count follows native perimeter fit from four to seven", () => {
  for (const [radius, count] of [
    [1, 4],
    [3, 4],
    [5, 5],
    [7, 6],
    [10, 7]
  ]) {
    const p = buildConstructionFoundation({ id: "base", shape: { ...circle, radius }, height: 3, terrain: () => 0 });
    assert.equal(p.pillars.length, count);
  }
});
test("solid fill clips uphill edges instead of publishing inverted walls", () => {
  for (const shape of [rectangle, circle]) {
    const terrain = (x) => x * 0.7;
    const s = buildConstructionFoundation({ id: "base", shape, height: 0.4, terrain, mode: "solid" });
    assert(s.geometry.vertices.every((v) => v[1] <= s.topY + 1e-6));
    assert(s.cells.every((c) => c.size.every((v) => Number.isFinite(v) && v > 0)));
    const zero = buildConstructionFoundation({ id: "base", shape, height: 0, terrain, mode: "solid" });
    assert.equal(zero.cells.length, 0);
    assert.equal(zero.geometry.triangles.length, 0);
  }
});
