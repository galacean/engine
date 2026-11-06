import { describe, expect, it } from "vitest";
import { placeStripUnits } from "../src/building/runtime/StripPlacement";
import type { ArrangementRule } from "../src/building/runtime/UnitPlacementStyle";
const rules: Exclude<ArrangementRule, "auto">[] = [
  "grid",
  "staggered_rows",
  "overlap_rows",
  "horizontal_rows",
  "parallel_rows",
  "posts_and_rails"
];
describe("strip support placement independent of house schema", () => {
  it.each(rules)("places %s on rotated sloping ground", (algorithm) => {
    const rectangle = { center: [3, 4], size: [7, 0.3], rotation: 0.4 };
    const footprint = { width: 0.5, height: 0.4375, depth: 0.1 };
    const terrain = (x: number, z: number) => 0.1 * x + 0.03 * z;
    const input = { id: "strip", rectangle, height: 1.5, algorithm, footprint };
    const actual = placeStripUnits(input, terrain);
    expect(actual.length).toBeGreaterThan(0);

    if (algorithm === "posts_and_rails") {
      const rails = actual.filter((cell) => cell.id.includes("rail"));
      expect(rails.length).toBeGreaterThan(0);
      expect(rails.every((cell) => cell.tangent[1] > 0)).toBe(true);
    }
  });
});
