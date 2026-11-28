import { expect, it } from "vitest";
import { samePlanningRenderState } from "@galacean/engine-world-planning/spatial/PlanningRenderState";
function legacy(plan: any) {
  return JSON.stringify({
    ...plan,
    planning: plan.planning ? { ...plan.planning, checks: [], changedIds: [] } : plan.planning,
    spatialLayout: plan.spatialLayout && {
      ...plan.spatialLayout,
      instanceInputSignature: undefined,
      revealInputSignature: undefined
    }
  });
}
it("preserves exact JSON comparison including diagnostics, tiny edits, omissions and property order", () => {
  const base: any = {
    waters: [{ height: 1 }],
    routes: [],
    planning: { checks: [1], changedIds: ["a"], profiles: [1] },
    spatialLayout: { groups: [1], instanceInputSignature: "a" }
  };
  const cases = [
    structuredClone(base),
    { ...base, routes: [1] },
    { ...base, waters: [{ height: 1 + Number.EPSILON }] },
    { ...base, optional: undefined },
    { ...base, planning: { ...base.planning, checks: [2], changedIds: ["b"] } },
    { ...base, spatialLayout: { ...base.spatialLayout, instanceInputSignature: "b", revealInputSignature: "c" } },
    { routes: [], waters: base.waters, planning: base.planning, spatialLayout: base.spatialLayout }
  ];
  for (const candidate of cases)
    expect(samePlanningRenderState(base, candidate)).toBe(legacy(base) === legacy(candidate));
});
it("does not serialize the layout cache once a physical water difference is known", () => {
  let reads = 0;
  const spatialLayout: any = {
    groups: {
      toJSON: () => {
        reads++;
        return [];
      }
    }
  };
  expect(samePlanningRenderState({ waters: [1], spatialLayout } as any, { waters: [2], spatialLayout } as any)).toBe(
    false
  );
  expect(reads).toBe(0);
});
