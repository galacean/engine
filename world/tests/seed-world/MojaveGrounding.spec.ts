import { expect, it } from "vitest";
import { fitContainedPrefab, fitGroundedPrefabHeight } from "../../demos/seed-world/src/MojaveGrounding";

it("buries the source mesh while preserving the authored exposed top", () => {
  for (const fraction of [0, 0.45, 0.56]) {
    const fit = fitGroundedPrefabHeight(12, 6, 3, fraction);
    expect(fit.bottom + 3 * fit.scaleY).toBeCloseTo(18);
    expect((12 - fit.bottom) / (3 * fit.scaleY)).toBeCloseTo(fraction);
    expect(fit.bottom).toBeLessThanOrEqual(12);
  }
});
it("rejects a fully buried or invalid source rather than creating an infinite scale", () => {
  expect(() => fitGroundedPrefabHeight(0, 1, 1, 1)).toThrow();
  expect(() => fitGroundedPrefabHeight(0, 1, 0, 0.5)).toThrow();
});

it("contains all three dimensions without stretching, allowing enlargement and reduction", () => {
  for (const source of [[11, 5, 7], [2, 3, 1]] as const) {
    for (const envelope of [[20, 10, 20], [1, 2, 3], [20, 1, 10]] as const) {
      for (const burial of [0, 0.45, 0.56]) {
        const fit = fitContainedPrefab(12, envelope, source, burial);
        const occupied = [source[0], source[1] * (1 - burial), source[2]].map(v => v * fit.scale);
        occupied.forEach((size, axis) => expect(size).toBeLessThanOrEqual(envelope[axis] + 1e-10));
        expect(occupied.some((size, axis) => Math.abs(size - envelope[axis]) < 1e-10)).toBe(true);
        expect(fit.bottom + source[1] * fit.scale * burial).toBeCloseTo(12);
      }
    }
  }
  expect(fitContainedPrefab(0, [4, 4, 4], [2, 2, 2], 0).scale).toBe(2);
  expect(fitContainedPrefab(0, [1, 4, 4], [2, 2, 2], 0).scale).toBe(0.5);
  expect(() => fitContainedPrefab(0, [1, 1, 1], [0, 1, 1], 0)).toThrow();
});
