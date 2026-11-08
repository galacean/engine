import { describe, expect, it } from "vitest";
import {
  designBuildingCore,
  expandUnits,
  laidUnit,
  layingContext,
  type BuildingCoreDraft,
  type LaidUnit,
  resolveShared
} from "../../src/building/core";
import { houseDraft, testRegistry, unitsOf } from "./fixtures";

/** One straight wall of a given length with a window, from the test type layer. */
function wall(length: number): BuildingCoreDraft {
  const draft = houseDraft(2);
  return {
    ...draft,
    groups: [
      {
        ...draft.groups[0],
        shared: {
          ...draft.groups[0].shared,
          footprint: {
            points: [
              [0, 0, 0],
              [length, 0, 0]
            ]
          }
        }
      }
    ]
  };
}
const wallPart = (draft: BuildingCoreDraft) =>
  designBuildingCore(draft, testRegistry()).parts.find((p) => p.type === "wall")!;
const byKey = (units: readonly LaidUnit[]) => new Map(units.map((u) => [u.key, u]));

describe("Unit layouts", () => {
  it("stores a layout, not laid units", () => {
    const result = designBuildingCore(wall(8), testRegistry());
    for (const part of result.parts) expect(part).not.toHaveProperty("units");
    expect(JSON.stringify(result)).not.toContain('"matrix"');
  });

  it("keeps the layout the same size however many units it lays", () => {
    const small = wallPart(wall(8)),
      large = wallPart(wall(800));
    expect(unitsOf(large).length).toBeGreaterThan(unitsOf(small).length * 50);
    const size = (part: typeof small) => JSON.stringify(part.layout).length;
    expect(Math.abs(size(large) - size(small))).toBeLessThan(16);
  });

  it("computes every slot independently of the others", () => {
    const registry = testRegistry();
    const part = wallPart(wall(8));
    const algorithm = registry.algorithms.get(part.algorithm.type)!;
    const context = layingContext(part, part.unit!, part.layout!.params, registry, {});
    // Visit the slots in reverse order: no slot may depend on an earlier one.
    const backward: LaidUnit[] = [];
    for (let i = part.layout!.count - 1; i >= 0; i--) {
      const spec = algorithm.unitAt(context, part.layout!.data, i);
      if (spec) backward.push(laidUnit(context, spec));
    }
    expect(byKey(backward)).toEqual(byKey(expandUnits(part, registry)));
  });

  it("lays the same units after the layout crosses a Worker boundary", () => {
    const result = designBuildingCore(wall(8), testRegistry());
    const copied = JSON.parse(JSON.stringify(result)) as typeof result;
    result.parts.forEach((part, i) => expect(unitsOf(copied.parts[i])).toEqual(unitsOf(part)));
  });

  it("can skip validation without changing the layout", () => {
    const checked = designBuildingCore(wall(8), testRegistry());
    const unchecked = designBuildingCore(wall(8), testRegistry(), { validate: false });
    expect(JSON.stringify(unchecked)).toBe(JSON.stringify(checked));
  });

  it("reads units and algorithms from the group, with overrides", () => {
    const draft = houseDraft(2);
    const wall = draft.parts.find((p) => p.id === "wall")!;
    const shared = { ...draft.groups[0].shared, brick: wall.unit, grid: wall.algorithm };
    const byRef: BuildingCoreDraft = {
      ...draft,
      groups: [{ ...draft.groups[0], shared }],
      parts: draft.parts.map((p) =>
        p.id === "wall" ? { ...p, unit: { $shared: "brick" }, algorithm: { $shared: "grid" } } : p
      )
    };
    const inline = designBuildingCore(draft, testRegistry()).parts.find((p) => p.type === "wall")!;
    const shared_ = designBuildingCore(byRef, testRegistry()).parts.find((p) => p.type === "wall")!;
    expect(shared_.unit).toEqual(inline.unit);
    expect(unitsOf(shared_)).toEqual(unitsOf(inline));
    expect(resolveShared({ $shared: "a", y: 3 }, { a: { x: 1, y: 2 } })).toEqual({ x: 1, y: 3 });
    expect(() => resolveShared({ $shared: "n", y: 3 }, { n: 4 })).toThrow(/must be an object/);
    const missing = designBuildingCore(
      { ...byRef, parts: byRef.parts.map((p) => (p.id === "wall" ? { ...p, unit: { $shared: "none" } } : p)) },
      testRegistry()
    );
    expect(missing.diagnostics.some((d) => /Missing shared value "none" at unit/.test(d.message))).toBe(true);
  });
});
