import { test } from "vitest";
import assert from "node:assert/strict";
import { buildConstructionFoundation } from "../src/building/runtime/ConstructionFoundation.ts";
import { buildConstructionFlatRoof } from "../src/building/runtime/ConstructionFlatRoof.ts";
import {
  arrangedWallCells,
  arrangedSurfaceCells,
  wallSurfaceGeometry
} from "../src/building/runtime/ConstructionArrangement.ts";
import { publishLevelWallProfile } from "../src/building/runtime/PublishedWallProfile.ts";

test("support and parallel rules consume unit specifications without moving the support envelope", () => {
  const shape = { type: "rectangle", center: [0, 0], width: 4, depth: 3, orientation: [1, 0] };
  const footprint = { width: 0.5, height: 0.4375, depth: 0.1 };
  const profile = publishLevelWallProfile(shape, 3, () => 0);
  const binding = {
    id: "wall",
    geometry_id: "wall",
    unit_id: "wooden_plank",
    rule: { type: "parallel_rows" },
    footprint,
    seed: "source"
  };
  const geometry = wallSurfaceGeometry("wall", profile);
  for (const rule of ["staggered_rows", "parallel_rows"]) {
    const foundation = (spec) =>
      buildConstructionFoundation({
        id: "foundation",
        shape,
        height: 1,
        terrain: (x, z) => 0.1 * x + 0.2 * z,
        rule,
        footprint: spec
      });
    const flat = (spec) =>
      buildConstructionFlatRoof({
        id: "roof",
        shape,
        topY: 4,
        material: "brick",
        rule,
        rim: true,
        seed: 17,
        footprint: spec
      });
    for (const producer of [foundation, flat]) {
      const original = producer(footprint);
      assert.deepEqual(producer(undefined), original, "explicit default footprint matches omitted footprint");
      for (const dimension of ["width", "height", "depth"]) {
        const spec = { ...footprint, [dimension]: footprint[dimension] * 0.5 },
          changed = producer(spec);
        assert.notDeepEqual(changed.cells, original.cells, rule + " " + dimension);
        if (producer === foundation)
          assert.deepEqual(
            changed.geometry,
            original.geometry,
            "unit dimensions cannot resize the foundation envelope"
          );
        else
          assert.deepEqual(
            changed.geometry.vertices.slice(0, 4),
            original.geometry.vertices.slice(0, 4),
            "floor outline and elevation remain fixed while rim units change"
          );
        assert(changed.cells.every((c) => c.size.every((v) => Number.isFinite(v) && v > 0)));
      }
    }
  }
  for (const producer of [(b) => arrangedWallCells(b, profile, []), (b) => arrangedSurfaceCells(b, geometry)]) {
    const original = producer(binding);
    for (const dimension of ["width", "height", "depth"]) {
      const changed = producer({ ...binding, footprint: { ...footprint, [dimension]: footprint[dimension] * 0.5 } });
      assert.notDeepEqual(changed, original, dimension);
      if (dimension !== "depth")
        assert(changed.length > original.length, dimension + " must drive row/column generation");
      assert(changed.every((c) => c.size.every((v) => Number.isFinite(v) && v > 0)));
    }
  }
});
