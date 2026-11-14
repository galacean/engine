import { describe, expect, it } from "vitest";
import { initialBuildingDrafts } from "@galacean/engine-world-planning/masonry/BuildingInitialDraft.ts";
import { validateBuildingDraft } from "@galacean/engine-building/building/parts/architecture/BuildingCpu.ts";
import { buildingGenerationPlan } from "../../demos/building-components/BuildingGenerationFixture";
describe("initial flat building authoring", () => {
  it.each([0, 1, 42])("keeps stable identities and leaves source planning unchanged for seed %s", (seed) => {
    const plan = structuredClone(buildingGenerationPlan);
    plan.parameters.seed = seed;
    const before = structuredClone(plan),
      result = initialBuildingDrafts(plan);
    expect(plan).toEqual(before);
    expect(result).toEqual(initialBuildingDrafts(plan));
    const groups = result.flatMap((g) => g.draft.groups),
      parts = result.flatMap((g) => g.draft.parts);
    expect(groups).toHaveLength(17);
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
    expect(parts.every((p) => !!p.geometry.generator)).toBe(true);
    // Every connection names parts of its own draft.
    for (const group of result) expect(() => validateBuildingDraft(group.draft)).not.toThrow();
    (result[0].draft.groups[0] as { seed: number }).seed += 1;
    expect(initialBuildingDrafts(plan)).not.toEqual(result);
    expect(plan).toEqual(before);
  });
});
