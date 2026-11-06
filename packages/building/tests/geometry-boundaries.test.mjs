import { test } from "vitest";
import assert from "node:assert/strict";
import { buildConstructionFlatRoof } from "../src/building/runtime/ConstructionFlatRoof.ts";

test("thin flat-roof supports retain positive floor-unit height after joint inset", () => {
  for (const depth of [0.005, 0.4, 1]) {
    const floor = buildConstructionFlatRoof({
      id: "floor",
      shape: { type: "rectangle", center: [0, 0], width: 2, depth, orientation: [1, 0] },
      topY: 3,
      material: "brick",
      rule: "grid",
      rim: false
    });
    assert(floor.cells.length > 0);
    assert(floor.cells.every((c) => c.size.every((v) => Number.isFinite(v) && v > 0)));
  }
});
