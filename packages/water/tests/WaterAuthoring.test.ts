import { describe, expect, it } from "vitest";
import { compileWaterShape, validateWaterShape, type WaterShapeAuthoring } from "../src/water/native/WaterAuthoring";
import { validateWaterResourceFile } from "../src/water/native/WaterProjectFormats";

import { lake, terrain } from "./WaterFixtures";

describe("Water author input", () => {
  it("retains a fixed reference level and compiles a local level edit without changing the bed", () => {
    const first = compileWaterShape(lake, terrain, "lake"),
      changed = compileWaterShape({ ...lake, levelOffsetM: 0.25 }, terrain, "lake");
    expect(first.sourceHash).not.toBe(changed.sourceHash);
    const descriptor = (changed.source as any).descriptor;
    expect(descriptor.lakeBoundary.waterLevel).toBe(0.75);
    expect([...descriptor.bedHeights].every((height) => height === -1)).toBe(true);
    expect(lake.levelOffsetM).toBe(0);
  });
  it("rejects invalid geometry at the author boundary", () => {
    expect(() => validateWaterResourceFile('{"version":2,"kind":"quality","data":{}}')).toThrow("version");
    expect(() => validateWaterShape({ ...lake, levelOffsetM: NaN })).toThrow("finite");
    expect(() => validateWaterShape({ ...lake, shoreline: lake.shoreline.slice(0, 2) })).toThrow("three");
    expect(() =>
      validateWaterShape({
        kind: "river",
        speed: 0,
        course: {
          id: "river",
          points: [
            { id: "a", x: 0, z: 0, width: 0, depth: 1 },
            { id: "b", x: 1, z: 1, width: 1, depth: 1 }
          ]
        }
      })
    ).toThrow("width");
  });
  it("compiles a river against its accepted bed and requires Terrain acceptance for a depth edit", () => {
    const river: Extract<WaterShapeAuthoring, { kind: "river" }> = {
      kind: "river",
      speed: 0,
      course: {
        id: "river",
        points: [
          { id: "a", x: 2, z: 4, elevation: 0, width: 1, depth: 1 },
          { id: "b", x: 6, z: 4, elevation: 0, width: 1, depth: 1 }
        ]
      }
    };
    const asset = compileWaterShape(river, terrain, "river");
    expect((asset.source as any).descriptor.defaults.flow.speed).toBe(0);
    const wider = compileWaterShape(
      { ...river, course: { ...river.course, points: river.course.points.map((point) => ({ ...point, width: 2 })) } },
      terrain,
      "river"
    );
    expect(wider.sourceHash).not.toBe(asset.sourceHash);
    expect(() =>
      compileWaterShape(
        { ...river, course: { ...river.course, points: river.course.points.map((point) => ({ ...point, depth: 2 })) } },
        terrain,
        "river"
      )
    ).toThrow("TERRAIN_CHANGE_REQUIRED");
    expect(terrain.heights.every((height) => height === -1)).toBe(true);
  });
});
