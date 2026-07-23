import { describe, expect, it } from "vitest";
import { createPoolFleetPlacements } from "../../demo/pool/PoolBodyFleetLayout";

describe("PoolBodyFleet layout", () => {
  it.each([0, 3, 7, 15])("creates %i deterministic additional placements inside the pool", (count) => {
    const first = createPoolFleetPlacements(count, 40, 18);
    const second = createPoolFleetPlacements(count, 40, 18);
    expect(first).toEqual(second);
    expect(first).toHaveLength(count);
    for (const placement of first) {
      expect(Math.abs(placement.localX)).toBeLessThan(20);
      expect(Math.abs(placement.localZ)).toBeLessThan(9);
      expect(Math.hypot(placement.directionLocalX, placement.directionLocalZ)).toBeGreaterThan(0.9);
    }
  });

  it("hard-caps the showcase at fifteen additional bodies", () => {
    expect(createPoolFleetPlacements(99, 40, 18)).toHaveLength(15);
  });
});
