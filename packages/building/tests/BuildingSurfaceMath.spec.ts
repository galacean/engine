import { test } from "vitest";
import assert from "node:assert/strict";
import { segmentTriangleDistanceSquared as distance } from "../src/building/runtime/SurfaceQueryMath";
type Vec3 = [number, number, number];

const a: Vec3 = [-2, -2, 0],
  b: Vec3 = [2, -2, 0],
  c: Vec3 = [0, 2, 0];
test("capsule axis distances cover face crossing, parallel projection, edge and vertex contacts", () => {
  assert.equal(distance([0, 0, -1], [0, 0, 1], a, b, c), 0);
  assert.equal(distance([-4, 0, 1], [4, 0, 1], a, b, c), 1);
  assert.equal(distance([0, 0, 2], [0, 0, 2], a, b, c), 4);
  assert.equal(distance([0, 3, -1], [0, 3, 1], a, b, c), 1);
  assert.equal(distance([-3, -3, 0], [-3, -3, 0], a, b, c), 2);
  assert.equal(distance([-4, 0, 0], [4, 0, 0], a, b, c), 0);
  assert.equal(distance([0, 0, -2], [0, 0, -1], a, b, c), 1);
});

test("degenerate triangles retain edge and point distance; orientation and translation do not change distance", () => {
  assert.equal(distance([0, 1, -1], [0, 1, 1], [-2, 0, 0], [2, 0, 0], [0, 0, 0]), 1);
  assert.equal(distance([0, 0, 0], [0, 1, 0], [2, 0, 0], [2, 0, 0], [2, 0, 0]), 4);
  const transform = (p: Vec3): Vec3 => [p[2] + 702, p[0] + 15, p[1] + 867];
  const start: Vec3 = [-4, 0, 1],
    end: Vec3 = [4, 0, 1];
  assert.equal(distance(transform(start), transform(end), transform(c), transform(b), transform(a)), 1);
});
