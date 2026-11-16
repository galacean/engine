import { expect, it } from "vitest";
import { createCoastalSeabed } from "../src/generation/terrain/CoastalSeabed";

it("smooths the underwater join between parallel shores and retains the shoreline and deep floor", () => {
  const distance = (x: number) => Math.min(Math.abs(x - 40), Math.abs(x - 100));
  const seabed = createCoastalSeabed(distance, 60, 4);
  const at = (x: number) => seabed(x, 80, distance(x));
  const centre = at(70);
  expect(Math.abs(at(69) + at(71) - 2 * centre)).toBeLessThan(0.04);
  expect(centre).toBeLessThan(-1.5);
  expect(at(40)).toBe(0);
  expect(at(100)).toBe(0);
  expect(at(230)).toBe(-4);
});
