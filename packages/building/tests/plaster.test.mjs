import { test } from "vitest";
import assert from "node:assert/strict";
import { generateWallPlaster } from "../src/tiny-glade/runtime/RecoveredWallPlaster.ts";
import { publishLevelWallProfile } from "../src/tiny-glade/runtime/PublishedWallProfile.ts";
const terrain = () => 0;
test("flat roof plaster covers rim and rimless branches without exposing invalid grid data", () => {
  const shape = { type: "rectangle", center: [0, 0], width: 5, depth: 4, orientation: [1, 0] };
  const profile = publishLevelWallProfile(shape, 4, terrain);
  const rim = generateWallPlaster(shape, profile, { flatRoof: true }),
    open = generateWallPlaster(shape, profile, { flatRoof: true, flatWithoutRim: true });
  for (const result of [rim, open]) {
    assert(result.patches.length > 0);
    for (const s of result.sides) assert([...new Float32Array(s.vertices48.buffer)].every(Number.isFinite));
  }
  const maxY = (r) =>
    Math.max(...r.sides.flatMap((s) => [...new Float32Array(s.vertices48.buffer)].filter((_, i) => i % 12 === 1)));
  assert(Math.abs(maxY(rim) - maxY(open) - 0.64) < 1e-5);
});
