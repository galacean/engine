import { expect, it } from "vitest";
import { buildRock, DEFAULT_ROCK } from "@galacean/engine-terrain/rock-formation/generator/rock-body.js";
import { createWallComposition } from "@galacean/engine-terrain/rock-formation/generator/wall-composition.js";

const basis = { ...DEFAULT_ROCK, topScale: 1, bottomScale: 1, topRoughness: 0, topSlope: 0, wallProtrusion: 0 };
function meanMovement(a: Float32Array, b: Float32Array) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 3) sum += Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]);
  return sum / (a.length / 3);
}

it("disabling carving returns the same base body regardless of composition", () => {
  const a = buildRock({ ...basis, wallStrength: 0, wallCount: 4, wallOverlap: 0, wallLength: 0.5 });
  const b = buildRock({ ...basis, wallStrength: 0, wallCount: 28, wallOverlap: 1, wallLength: 3 });
  expect(a.positions).toEqual(b.positions);
  expect(a.indices).toEqual(b.indices);
  const carved = buildRock({ ...basis, wallStrength: 1 });
  expect(meanMovement(a.positions, carved.positions)).toBeGreaterThan(0.1);
});

it.each([
  ["wallCount", 4, 28, 0.1],
  ["wallOverlap", 0, 1, 0.05],
  ["wallLength", 0.5, 3, 0.05],
  ["wallTilt", -35, 35, 0.025]
])("%s changes the actual surface, not only metadata", (key, low, high, threshold) => {
  const a = buildRock({ ...basis, wallStrength: 1, [key]: low });
  const b = buildRock({ ...basis, wallStrength: 1, [key]: high });
  expect(meanMovement(a.positions, b.positions)).toBeGreaterThan(Number(threshold));
});

function contourSpan(shapes: ReturnType<typeof createWallComposition>["composition"]["shapes"]) {
  return shapes.reduce(
    (sum: number[], shape: { points: number[][] }) => {
      for (let axis = 0; axis < 2; axis++) {
        const coordinates = shape.points.map((point) => point[axis]);
        sum[axis] += (Math.max(...coordinates) - Math.min(...coordinates)) / shapes.length;
      }
      return sum;
    },
    [0, 0]
  );
}

it.each([
  ["wallOverlap", 0, 1, 0],
  ["wallLength", 0.5, 3, 1]
])("%s changes its physical contour span without resizing the other axis", (key, low, high, axis) => {
  const parameters = { ...DEFAULT_ROCK, wallTilt: 0 };
  const a = contourSpan(createWallComposition({ ...parameters, [key]: low }, 15, 4.2).composition.shapes);
  const b = contourSpan(createWallComposition({ ...parameters, [key]: high }, 15, 4.2).composition.shapes);
  const changedAxis = Number(axis),
    stableAxis = 1 - changedAxis;
  expect(b[changedAxis] / a[changedAxis]).toBeGreaterThan(2);
  expect(b[stableAxis] / a[stableAxis]).toBeGreaterThan(0.95);
  expect(b[stableAxis] / a[stableAxis]).toBeLessThan(1.05);
});

it.each([
  { name: "default OBB", parameters: {}, mean: 0.2, p95: 0.5 },
  {
    name: "31 degree roof and narrow lower section",
    parameters: {
      obbWidth: 10,
      obbHeight: 16,
      obbDepth: 8,
      topScale: 1,
      shoulderScale: 0.56,
      shoulderHeight: 0.23,
      bottomScale: 0.08,
      topRoughness: 0.58,
      topSlope: 31
    },
    mean: 0.5,
    p95: 1
  }
])("protrusion visibly raises localized wall faces inside $name", ({ parameters, mean, p95 }) => {
  const a = buildRock({ ...parameters, wallProtrusion: 0 });
  const b = buildRock({ ...parameters, wallProtrusion: 1 });
  const halfHeight = ((parameters as Record<string, number>).obbHeight ?? 4.2) * 0.35;
  const changes: number[] = [];
  for (let i = 0; i < a.positions.length; i += 3) {
    if (a.surfaceRoles[i / 3] !== 0 || Math.abs(a.positions[i + 1]) >= halfHeight) continue;
    changes.push(Math.hypot(b.positions[i], b.positions[i + 2]) - Math.hypot(a.positions[i], a.positions[i + 2]));
  }
  changes.sort((a, b) => a - b);
  const average = changes.reduce((sum, value) => sum + value, 0) / changes.length;
  const percentile95 = changes[Math.floor(changes.length * 0.95)];
  const percentile05 = changes[Math.floor(changes.length * 0.05)];
  expect(average).toBeGreaterThan(mean);
  expect(percentile95).toBeGreaterThan(p95);
  // Different areas rise by different amounts; this must not be a body scale/offset.
  expect(percentile95 - percentile05).toBeGreaterThan(p95 * 0.7);
  expect(percentile05).toBeGreaterThanOrEqual(-0.001);
});

it("reuses the original 2D angle window and gives every generated contour its own seed", () => {
  const a = createWallComposition({ ...basis, wallCount: 28 }, 15, 4.2).composition;
  expect(a.shapes).toHaveLength(28);
  for (const shape of a.shapes) {
    expect(shape.points).toHaveLength(256);
    expect(shape.angles.windowLength).toBe(0.06);
    expect(shape.angles.passed).toBe(true);
  }
  const replay = createWallComposition({ ...basis, wallCount: 28 }, 15, 4.2).composition;
  expect(replay.shapes).toEqual(a.shapes);
  const changed = createWallComposition({ ...basis, wallCount: 28, seed: basis.seed + 1 }, 15, 4.2).composition;
  expect(changed.shapes[0].points).not.toEqual(a.shapes[0].points);
});

it("carving strength scales depth monotonically and preserves the selected contour layout", () => {
  const shallow = createWallComposition({ ...basis, wallStrength: 0.25 }, 15, 4.2);
  const deep = createWallComposition({ ...basis, wallStrength: 1 }, 15, 4.2);
  expect(shallow.composition).toEqual(deep.composition);
  for (let u = 0; u < 15; u += 0.25)
    for (let y = -2.1; y <= 2.1; y += 0.2) {
      expect(shallow.depth(u, y) * 4).toBeCloseTo(deep.depth(u, y), 10);
      expect(deep.depth(u + 15, y)).toBeCloseTo(deep.depth(u, y), 10);
    }
});

it("fills enclosed depressions but preserves a channel open across the periodic seam", async () => {
  const { openRecesses } = await import("@galacean/engine-terrain/rock-formation/generator/open-recesses.js");
  const closed = new Float64Array(25).fill(0.1);
  closed[12] = 0.9;
  const result = openRecesses(closed, 5, 4);
  expect(result.filledSamples).toBe(1);
  expect(result.maxFillHeight).toBeCloseTo(0.8);
  expect(closed[12]).toBe(0.1);
  const open = new Float64Array(25).fill(0.1);
  for (const index of [0, 5, 9, 14, 13, 12]) open[index] = 0.9;
  const before = open.slice();
  expect(openRecesses(open, 5, 4).filledSamples).toBe(0);
  expect(open).toEqual(before);
});
