import { describe, expect, it } from "vitest";
import { constructionGeometry } from "../../../packages/building/tests/fixtures/constructionGeometry";
import { initialBuildingDrafts } from "@galacean/engine-world-planning/masonry/BuildingInitialDraft.ts";
import { buildingGenerationPlan } from "../../demos/building-components/BuildingGenerationFixture";
describe("initial flat building authoring", () => {
  it.each([0, 1, 42])("keeps stable identities and leaves source planning unchanged for seed %s", (seed) => {
    const plan = structuredClone(buildingGenerationPlan);
    plan.parameters.seed = seed;
    const before = structuredClone(plan),
      result = initialBuildingDrafts(plan, constructionGeometry);
    expect(plan).toEqual(before);
    expect(result).toEqual(initialBuildingDrafts(plan, constructionGeometry));
    const groups = result.flatMap((g) => g.draft.groups),
      parts = result.flatMap((g) => g.draft.parts);
    expect(groups).toHaveLength(17);
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
    expect(parts.every((p) => !!p.support.generator && !!p.algorithm.type && !!p.unit)).toBe(true);
    for (const group of result)
      for (const relation of group.draft.relations) {
        expect(group.draft.parts.some((p) => p.id === relation.from.part)).toBe(true);
        expect(group.draft.parts.some((p) => p.id === relation.to.part)).toBe(true);
      }
    result[0].draft.parts[0].support.params.height = 100;
    expect(initialBuildingDrafts(plan, constructionGeometry)).not.toEqual(result);
    expect(plan).toEqual(before);
  });
});
