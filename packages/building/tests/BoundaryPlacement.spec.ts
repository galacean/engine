import { describe, it, expect } from "vitest";
import {
  placeBoundaryUnits,
  parseBoundaryArrangement,
  type BoundaryPlacementGeometry
} from "../src/tiny-glade/runtime/BoundaryPlacement";
import { buildConstructionFlatRoof } from "../src/tiny-glade/runtime/ConstructionFlatRoof";
import type { WallConnectionShape } from "../src/tiny-glade/runtime/WallConnectionTypes";

const line: BoundaryPlacementGeometry = {
  id: "standalone-path",
  length: 8,
  cuts: [0, 1],
  publishedU: (u) => u * 8,
  holes: [],
  frame: (a, b, y, Y, id, depth) => ({
    id,
    logical_id: id,
    surface_id: "standalone-path",
    anchor_uv: [(a + b) * 4, (y + Y) / 2],
    center: [(a + b) * 4, (y + Y) / 2, 0],
    tangent: [1, 0, 0],
    bitangent: [0, 1, 0],
    normal: [0, 0, 1],
    size: [(b - a) * 8, Y - y, depth]
  })
};
const band = {
  id: "course",
  minY: 2,
  maxY: 3,
  publishOccupancy: true,
  rule: { type: "alternating" as const, pitch: 1, jitter: 0 }
};
describe("geometry / unit / arrangement boundary", () => {
  it("places on a standalone path without any building or material-mesh dependency", () => {
    const run = (material: "brick" | "wooden_plank" | "roof_tile") =>
      placeBoundaryUnits({ geometry: line, unit: { material, height: 1, depth: 0.2 }, bands: [band], seed: 17 });
    const a = run("brick");
    expect(a.cells).toHaveLength(4);
    expect(a.occupancy.map((v) => v.occupied)).toEqual([false, true, false, true, false, true, false, true]);
    expect(run("wooden_plank")).toEqual(a);
    expect(run("roof_tile")).toEqual(a);
    const continuous = placeBoundaryUnits({
      geometry: line,
      unit: { material: "brick", height: 1, depth: 0.2 },
      bands: [{ ...band, rule: { ...band.rule, type: "continuous" } }],
      seed: 17
    });
    expect(continuous.cells).toHaveLength(8);
  });
  it("clips before height subdivision, retains the original phase and does not mutate published inputs", () => {
    const g = { ...line, holes: [{ minU: 3.2, maxU: 3.7, minY: 2.2, maxY: 2.8 }] };
    const holes = JSON.stringify(g.holes);
    const input = {
      geometry: g,
      unit: { material: "brick" as const, height: 0.25, depth: 0.1 },
      bands: [band],
      seed: 2
    };
    const a = placeBoundaryUnits(input);
    expect(a.cells.some((c) => c.id.includes("/piece-"))).toBe(true);
    for (const c of a.cells) {
      expect(c.size[1]).toBeLessThanOrEqual(0.25 + 1e-8);
      const [x, y] = c.center,
        [w, h] = c.size;
      expect(
        x + w / 2 <= 3.2 + 1e-8 || x - w / 2 >= 3.7 - 1e-8 || y + h / 2 <= 2.2 + 1e-8 || y - h / 2 >= 2.8 - 1e-8
      ).toBe(true);
    }
    expect(placeBoundaryUnits(input)).toEqual(a);
    expect(JSON.stringify(g.holes)).toBe(holes);
  });
  it.each([false, true])(
    "switches boundary arrangement independently of floor placement and retains stable floor edits (%s)",
    (circle) => {
      const shape: WallConnectionShape = circle
        ? { type: "circle", center: [0, 0], radius: 2, phase: 0.2 }
        : { type: "rectangle", center: [0, 0], width: 4, depth: 3, orientation: [1, 0] };
      const options = { id: "surface", shape, topY: 3, material: "brick" as const, rim: true, seed: 7 };
      const a = buildConstructionFlatRoof(options);
      const b = buildConstructionFlatRoof({
        ...options,
        boundaryRule: { type: "continuous", pitch: 0.69, jitter: 0.05 }
      });
      expect(b.cells).toEqual(a.cells);
      expect(b.deckGeometry).toEqual(a.deckGeometry);
      expect(b.connection_cells.filter((c) => c.id.includes("/parapet-"))).toEqual(
        a.connection_cells.filter((c) => c.id.includes("/parapet-"))
      );
      expect(b.perimeterOccupancy.every((s) => s.occupied)).toBe(true);
      expect(a.perimeterOccupancy.some((s) => !s.occupied)).toBe(true);
      expect(
        buildConstructionFlatRoof({ ...options, material: "wooden_plank", rule: "grid" }).connection_cells
      ).toEqual(a.connection_cells);
    }
  );

  it.each([
    { type: "grid", pitch: 1, jitter: 0 },
    { type: "continuous", pitch: 0, jitter: 0 },
    { type: "alternating", pitch: 1, jitter: -1 },
    { type: "continuous", pitch: 1, jitter: 0, extra: true }
  ])("rejects unsupported author requests instead of silently ignoring them", (value) => {
    expect(() => parseBoundaryArrangement(value)).toThrow();
  });
});
