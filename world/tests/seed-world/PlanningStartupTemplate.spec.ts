import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.resetModules());

it("initializes a selected template only when no saved world exists", async () => {
  const { initialPlanningTemplate } = await import("../../demos/seed-world/src/planning/spatial/PlanningStartupTemplate.ts");
  expect(initialPlanningTemplate("?template=titan-wasteland", 1)).toBe("titan-wasteland");
  expect(initialPlanningTemplate("?template=original", 1)).toBe("");
  expect(initialPlanningTemplate("?template=titan-wasteland", 1, "titan-wasteland")).toBeUndefined();
  // A saved world may have changed theme in the editor after the URL was created.
  expect(initialPlanningTemplate("?template=titan-wasteland", 1, "sakura-pearl")).toBeUndefined();
});

it("honors an explicit launch choice without replacing matching saved authoring", async () => {
  const { initialPlanningTemplate, selectPlanningStartupTemplate } = await import("../../demos/seed-world/src/planning/spatial/PlanningStartupTemplate.ts");
  selectPlanningStartupTemplate("titan-wasteland", 2);
  expect(initialPlanningTemplate("", 2, "")).toBe("titan-wasteland");
  expect(initialPlanningTemplate("", 2, "titan-wasteland")).toBeUndefined();
  expect(initialPlanningTemplate("", 3, "")).toBeUndefined();
  selectPlanningStartupTemplate("", 2);
  expect(initialPlanningTemplate("", 2, "titan-wasteland")).toBe("");
});

it("rejects an unknown new template before any planning", async () => {
  const { initialPlanningTemplate } = await import("../../demos/seed-world/src/planning/spatial/PlanningStartupTemplate.ts");
  expect(() => initialPlanningTemplate("?template=missing", 1)).toThrow("未知世界风格");
});
