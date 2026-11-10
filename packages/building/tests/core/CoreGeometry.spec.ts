import { describe, expect, it } from "vitest";
import {
  authorPartKey,
  createBuildingRegistry,
  designBuildingCore,
  expandUnits,
  EffectiveGeometry,
  Registry,
  transformPoint,
  unitBox,
  unitMatrix,
  type BuildingGeometry,
  type CurveData
} from "../../src/building/core";
import { houseDraft, testRegistry } from "./fixtures";

const square: CurveData = {
  points: [
    [0, 0, 0],
    [4, 0, 0],
    [4, 0, 4],
    [0, 0, 4]
  ],
  closed: true
};
const extruded = (): BuildingGeometry => ({
  elements: { face: { kind: "surface", surface: { kind: "extrusion", params: { curve: square, height: 2 } } } }
});

describe("Geometry", () => {
  it("trims a grid unit around a removed area instead of dropping it", () => {
    const registry = createBuildingRegistry();
    const result = designBuildingCore(
      {
        groups: [{ id: "g", seed: 1 }],
        parts: [
          {
            id: "p",
            group: "g",
            type: "thing",
            geometry: { generator: "elements", params: extruded() },
            algorithm: { type: "surfaceGrid", params: { cell: [1, 1], trim: true } },
            unit: {
              source: "box",
              bounds: { min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0.1] },
              range: { min: [0.1, 0.1, 1], max: [1, 1, 1] }
            }
          }
        ]
      },
      registry
    );
    expect(result.diagnostics).toEqual([]);
    const part = result.parts[0];
    const cut = {
      ...part,
      modifications: [{ element: "face", op: "removeArea", rect: [0.7, 0, 2, 1] } as const]
    };
    const units = expandUnits(cut, registry, {});
    const first = units.find((u) => u.key === "face:0:0")!;
    expect(first.size![0]).toBeCloseTo(0.7, 6);
    expect(units.some((u) => u.key === "face:0:1")).toBe(false);
  });

  it("removes only the inside of an outline, and refuses a broken one", () => {
    const outline = [
      [1, 0],
      [3, 0],
      [2, 2]
    ] as const;
    const rect = [1, 0, 3, 2] as const;
    const modification = { element: "face", op: "removeArea", rect, outline } as const;
    const geometry = new EffectiveGeometry(extruded(), [modification], createBuildingRegistry().surfaces);
    const face = geometry.surface("face");
    expect(face.outlineOf(face.removed[0])).toEqual(outline);
    expect(face.contains(2, 1)).toBe(false);
    expect(face.contains(1.1, 1.9)).toBe(true);
    const broken = {
      ...modification,
      outline: [
        [1, 0],
        [3, 0]
      ] as never
    };
    expect(() => new EffectiveGeometry(extruded(), [broken], createBuildingRegistry().surfaces)).toThrow(
      "An outline needs three or more finite points [u, v]"
    );
  });

  it("keeps the boxes its units give way in, leaves the surface whole, and refuses a tilted one", () => {
    const box = { center: [1, 1, 0] as const, size: [0.5, 1, 0.8] as const, out: [0.6, 0, 0.8] as const };
    const modification = { element: "face", op: "clearBox", box } as const;
    const geometry = new EffectiveGeometry(extruded(), [modification], createBuildingRegistry().surfaces);
    expect(geometry.clearings("face")).toEqual([box]);
    expect(geometry.surface("face").removed).toEqual([]);
    const surfaces = createBuildingRegistry().surfaces;
    expect(
      () => new EffectiveGeometry(extruded(), [{ ...modification, box: { ...box, out: [0.6, 0.1, 0.8] } }], surfaces)
    ).toThrow("A box's out direction must be level and unit length");
    expect(
      () => new EffectiveGeometry(extruded(), [{ ...modification, box: { ...box, size: [0.5, 0, 0.8] } }], surfaces)
    ).toThrow("A box's size must be positive");
  });

  it("evaluates orthonormal frames and wraps closed curves", () => {
    const surface = new EffectiveGeometry(extruded(), [], createBuildingRegistry().surfaces).surface("face");
    expect(surface.domain).toEqual({ u: [0, 16], v: [0, 2], closedU: true });
    const f = surface.frame(5, 1);
    expect(f.origin).toEqual([4, 1, 1]);
    expect(f.x).toEqual([0, 0, 1]);
    expect(f.y).toEqual([0, 1, 0]);
    expect(f.z).toEqual([-1, 0, 0]);
    expect(surface.frame(17, 1)).toEqual(surface.frame(1, 1));
  });

  it("applies removed and added areas, including across the seam of a closed surface", () => {
    const geometry = new EffectiveGeometry(
      extruded(),
      [
        { element: "face", op: "removeArea", rect: [15.9, 0, 16.1, 1] },
        { element: "face", op: "addArea", rect: [0, 2, 4, 3] }
      ],
      createBuildingRegistry().surfaces
    );
    const surface = geometry.surface("face");
    expect(surface.covers([0, 0, 0.05, 0.5])).toBe(false);
    expect(surface.covers([15.8, 0, 15.85, 0.5])).toBe(true);
    expect(surface.covers([1, 2.2, 2, 2.8])).toBe(true);
    expect(surface.covers([5, 2.2, 6, 2.8])).toBe(false);
    expect(surface.bounds.v).toEqual([0, 3]);
  });

  it("divides a closed surface into whole columns", () => {
    const registry = createBuildingRegistry();
    const result = designBuildingCore(
      {
        groups: [{ id: "g", seed: 1 }],
        parts: [
          {
            id: "ring",
            group: "g",
            type: "ring",
            geometry: { generator: "elements", params: extruded() },
            algorithm: { type: "surfaceGrid", params: { cell: [0.5, 0.5] } },
            unit: { source: "tile" }
          }
        ]
      },
      registry
    );
    expect(result.diagnostics).toEqual([]);
    expect(expandUnits(result.parts[0], registry)).toHaveLength(32 * 4);
  });

  it("reads group-shared values and reports missing ones", () => {
    const draft = houseDraft();
    const result = designBuildingCore({ ...draft, groups: [{ ...draft.groups[0], shared: {} }] }, testRegistry());
    expect(result.diagnostics[0]).toEqual({
      source: authorPartKey("wall"),
      message: 'Missing shared value "footprint" at params.curve'
    });
  });

  it("rejects duplicate registrations", () => {
    const registry = new Registry<number>("Entry");
    registry.register("a", 1);
    expect(() => registry.register("a", 2)).toThrow('Entry "a" is already registered');
  });
});

describe("Units", () => {
  const at = (m: readonly number[], p: [number, number, number]) =>
    transformPoint(m as number[], p).map((v) => Math.round(v * 1e9) / 1e9 + 0);

  it("composes pivot, scale, rotation and position in that order", () => {
    const unit = {
      source: "u",
      bounds: { min: [-1, 0, -1], max: [1, 2, 1] },
      pivot: [0.5, 0, 0.5],
      position: [1, 0, 0],
      rotation: [0, 90, 0],
      scale: [2, 2, 2]
    } as const;
    const m = unitMatrix(unit);
    expect(at(m, [0, 0, 0])).toEqual([1, 0, 0]);
    expect(at(m, [1, 0, 0])).toEqual([1, 0, -2]);
  });

  it("gives every unit of a prototype the same normalized pivot", () => {
    const pivot = [0.5, 0, 0.5] as const;
    const small = unitBox({ source: "a", bounds: { min: [0, 0, 0], max: [1, 1, 1] }, pivot })!;
    const large = unitBox({ source: "b", bounds: { min: [3, 3, 3], max: [7, 5, 7] }, pivot })!;
    expect(small.min).toEqual([-0.5, 0, -0.5]);
    expect(large.min).toEqual([-2, 0, -2]);
  });

  it("measures laid bounds through the rotation", () => {
    const unit = { source: "u", bounds: { min: [0, 0, 0], max: [1, 2, 3] }, rotation: [0, 0, 90] } as const;
    const box = unitBox(unit)!;
    expect(box.max[0] - box.min[0]).toBeCloseTo(2, 12);
    expect(box.max[1] - box.min[1]).toBeCloseTo(1, 12);
  });

  const rail = (range?: { min: [number, number, number]; max: [number, number, number] }) =>
    designBuildingCore(
      {
        groups: [{ id: "g", seed: 1 }],
        parts: [
          {
            id: "rail",
            group: "g",
            type: "rail",
            geometry: {
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
                          [3.3, 0, 0]
                        ]
                      }
                    }
                  }
                }
              }
            },
            algorithm: { type: "alongCurves" },
            unit: { source: "board", bounds: { min: [-0.5, -0.1, -0.1], max: [0.5, 0.1, 0.1] }, range }
          }
        ]
      },
      createBuildingRegistry()
    );

  it("stretches abutting units to fill a length when the range allows it", () => {
    const result = rail({ min: [0.9, 1, 1], max: [1.2, 1, 1] });
    expect(result.diagnostics).toEqual([]);
    const units = expandUnits(result.parts[0], createBuildingRegistry());
    expect(units).toHaveLength(3);
    for (const u of units) expect(u.stretch[0]).toBeCloseTo(1.1, 12);
    expect(units.map((u) => Math.round(u.matrix[12] * 1e9) / 1e9)).toEqual([0.55, 1.65, 2.75]);
  });

  it("keeps the nominal size when the range is fixed", () => {
    const units = expandUnits(rail().parts[0], createBuildingRegistry());
    expect(units.map((u) => u.stretch)).toEqual([
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1]
    ]);
    expect(units.map((u) => u.matrix[12])).toEqual([0.5, 1.5, 2.5]);
  });

  it("rejects an algorithm that stretches a unit outside its range", () => {
    const registry = createBuildingRegistry();
    registry.algorithms.register("greedy", {
      plan: () => ({ count: 1, data: null }),
      unitAt: ({ geometry }) => ({ key: "p", frame: geometry.point("p"), size: [2, 1, 1] })
    });
    const result = designBuildingCore(
      {
        groups: [{ id: "g", seed: 1 }],
        parts: [
          {
            id: "post",
            group: "g",
            type: "post",
            geometry: {
              generator: "elements",
              params: {
                elements: {
                  p: { kind: "point", frame: { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } }
                }
              }
            },
            algorithm: { type: "greedy" },
            unit: {
              source: "post",
              bounds: { min: [0, 0, 0], max: [1, 1, 1] },
              range: { min: [1, 1, 1], max: [1.5, 1, 1] }
            }
          }
        ]
      },
      registry
    );
    expect(result.diagnostics.map((d) => d.message)).toEqual(["Stretch 2, 1, 1 is outside the unit range: p"]);
    expect(result.parts[0].layout).toBeUndefined();
  });
});
