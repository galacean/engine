import { expect, it } from "vitest";
import {
  fractureSmoothing,
  smoothFractureNormals
} from "@galacean/engine-terrain/rock-ridge/features/shaping/rock-normals.mjs";

// A body face meets a cut at a right angle along vertices 0 and 1.
const crease = {
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  indices: [0, 1, 2, 0, 3, 1],
  faceTags: [-1, 1]
};
const hard = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];

it("smooths only fracture-adjacent normals without changing positions or topology", () => {
  const before = structuredClone(crease),
    hardBefore = [...hard];
  expect(smoothFractureNormals(crease, hard, 0)).toBe(hard);
  const smooth = smoothFractureNormals(crease, hard, 1);
  const partial = smoothFractureNormals(crease, hard, 0.5);
  expect(smooth.slice(0, 3)).toEqual(smooth.slice(9, 12));
  expect(smooth.slice(3, 6)).toEqual(smooth.slice(15, 18));
  expect(smooth[1]).toBeCloseTo(Math.SQRT1_2, 12);
  expect(smooth[2]).toBeCloseTo(Math.SQRT1_2, 12);
  expect(partial[1]).toBeGreaterThan(0);
  expect(partial[1]).toBeLessThan(smooth[1]);
  expect(smooth.slice(6, 9)).toEqual(hard.slice(6, 9)); // untouched body vertex
  for (const normals of [smooth, partial])
    for (let i = 0; i < normals.length; i += 3) expect(Math.hypot(...normals.slice(i, i + 3))).toBeCloseTo(1, 12);
  expect(crease).toEqual(before);
  expect(hard).toEqual(hardBefore);
  expect(smoothFractureNormals({ ...crease, faceTags: [-1, -2] }, hard, 1)).toBe(hard);
});

it("keeps smoothing independent of how a planar cut is triangulated", () => {
  // Split the cut triangle into three: all old vertices must keep their normals.
  const subdivided = {
    positions: [...crease.positions, 1 / 3, 0, 1 / 3],
    indices: [0, 1, 2, 0, 3, 4, 3, 1, 4, 1, 0, 4],
    faceTags: [-1, 1, 1, 1]
  };
  const splitHard = [...hard.slice(0, 9), ...Array.from({ length: 9 }, () => [0, 1, 0]).flat()];
  const original = smoothFractureNormals(crease, hard, 1);
  const split = smoothFractureNormals(subdivided, splitHard, 1);
  for (let corner = 0; corner < subdivided.indices.length; corner++) {
    const id = subdivided.indices[corner];
    if (id === 4) continue;
    const reference = crease.indices.indexOf(id) * 3;
    for (let d = 0; d < 3; d++) expect(split[corner * 3 + d]).toBeCloseTo(original[reference + d], 12);
  }
});

it("clamps authoring values and defaults old saved worlds to partial smoothing", () => {
  expect(fractureSmoothing(-1)).toBe(0);
  expect(fractureSmoothing(2)).toBe(1);
  expect(fractureSmoothing()).toBe(0.65);
  expect(fractureSmoothing(NaN)).toBe(0.65);
});
