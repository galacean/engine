import { test } from "vitest";
import assert from "node:assert/strict";
import { masonryPlacementAnchors } from "../src/masonry/MasonryPlacement.ts";

test("Seed placement reads spawn from the published IslandPlan rather than renderer projection", () => {
  const published = { plan: { spawn: { x: 23, z: 47 } }, data: { plan: { observationAnchor: { x: 999, z: 999 } } } };
  assert.deepEqual(masonryPlacementAnchors(published, { x: 1, z: 2 }), [
    [1, 2],
    [23, 47]
  ]);
  assert.throws(() => masonryPlacementAnchors({ plan: {} }, { x: 1, z: 2 }), /出生点/);
});
