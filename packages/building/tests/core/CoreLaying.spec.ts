import { describe, expect, it } from "vitest";
import {
  createBuildingRegistry,
  describeLaying,
  designBuildingCore,
  expandUnits,
  simpleLaying,
  type BuildingCoreDraft,
  type BuildingPartDef
} from "../../src/building/core";

const frame = (x: number) => ({ origin: [x, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
const board = { source: "board", bounds: { min: [-0.5, -0.1, -0.1], max: [0.5, 0.1, 0.1] } } as const;
function draft(part: Omit<BuildingPartDef, "id" | "group" | "type">): BuildingCoreDraft {
  return { groups: [{ id: "g", seed: 1 }], parts: [{ id: "p", group: "g", type: "thing", ...part }] };
}
const points = {
  generator: "elements",
  params: { elements: { a: { kind: "point", frame: frame(0) }, b: { kind: "point", frame: frame(2) } } }
};
const polyline = {
  generator: "elements",
  params: {
    elements: {
      line: {
        kind: "surface",
        surface: {
          kind: "ribbon",
          params: {
            points: [
              [0, 0, 0],
              [1.2, 0, 0],
              [2, 0, 0]
            ]
          }
        }
      }
    }
  }
};
const plane = {
  generator: "elements",
  params: {
    elements: {
      face: {
        kind: "surface",
        surface: { kind: "plane", params: { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], size: [2, 1] } }
      }
    }
  }
};

describe("Laying algorithms, like easing functions", () => {
  it("lays one unit per point when a point part names no algorithm", () => {
    const registry = createBuildingRegistry();
    const result = designBuildingCore(draft({ geometry: points, unit: board }), registry);
    expect(result.diagnostics).toEqual([]);
    expect(result.parts[0].algorithm).toEqual({ type: "placeAtPoints" });
    expect(expandUnits(result.parts[0], registry).map((u) => u.key)).toEqual(["a", "b"]);
  });

  it("lays one stretched unit per straight segment when a line part names no algorithm", () => {
    const registry = createBuildingRegistry();
    const unit = { ...board, range: { min: [0.5, 1, 1], max: [1.5, 1, 1] } } as const;
    const result = designBuildingCore(draft({ geometry: polyline, unit }), registry);
    expect(result.diagnostics).toEqual([]);
    const units = expandUnits(result.parts[0], registry);
    expect(units.map((u) => u.size![0])).toEqual([1.2, 0.8].map((v) => expect.closeTo(v, 12)));
  });

  it("asks a surface part to name its algorithm", () => {
    const result = designBuildingCore(draft({ geometry: plane, unit: board }), createBuildingRegistry());
    expect(result.diagnostics.map((d) => d.message)).toEqual(["A surface part must name a laying algorithm"]);
  });

  it("rejects an algorithm that does not lay the part's geometry", () => {
    const result = designBuildingCore(
      draft({ geometry: points, unit: board, algorithm: { type: "surfaceGrid" } }),
      createBuildingRegistry()
    );
    expect(result.diagnostics.map((d) => d.message)).toEqual([
      "surfaceGrid lays surface elements; this geometry has none"
    ]);
  });

  it("accepts a custom algorithm written as one function", () => {
    const registry = createBuildingRegistry();
    registry.algorithms.register(
      "twoInARow",
      simpleLaying({ accepts: ["point"], summary: "Two units next to each point." }, ({ geometry }) =>
        geometry.ids("point").flatMap((id) => {
          const f = geometry.point(id);
          return [0, 1].map((i) => ({ key: `${id}:${i}`, frame: { ...f, origin: [f.origin[0] + i, 0, 0] as const } }));
        })
      )
    );
    const result = designBuildingCore(
      draft({ geometry: points, unit: board, algorithm: { type: "twoInARow" } }),
      registry
    );
    expect(result.diagnostics).toEqual([]);
    expect(expandUnits(result.parts[0], registry).map((u) => u.frame.origin[0])).toEqual([0, 1, 2, 3]);
    expect(registry.algorithms.get("twoInARow")!.info!.cpuOnly).toBe(true);
  });

  it("lists every algorithm with what it lays and how", () => {
    const list = describeLaying(createBuildingRegistry());
    expect(list.map((a) => a.name)).toEqual(["alongCurves", "coverSurfaces", "none", "placeAtPoints", "surfaceGrid"]);
    for (const a of list) {
      expect(a.accepts?.length).toBeGreaterThan(0);
      expect(a.summary).toBeTruthy();
    }
    expect(list.find((a) => a.name === "surfaceGrid")!.accepts).toEqual(["surface"]);
  });
});
