import { expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { constructionGeometry } from "../../../packages/building/tests/fixtures/constructionGeometry";
import { buildingGenerationPlan } from "../../demos/building-components/BuildingGenerationFixture";
import { initialBuildingDrafts } from "@galacean/engine-world-planning/masonry/BuildingInitialDraft.ts";
import { initialBuildingSource } from "@galacean/engine-world-planning/masonry/BuildingInitialSource.ts";
import {
  designBuildingCore,
  expandUnits,
  type BuildingPartDef
} from "@galacean/engine-building/building/core/index.ts";
import { createBuildingTypeRegistry, MOUNTED_PART_TYPES } from "@galacean/engine-building/building/partTypes/index.ts";
import { coreBuildingEnvironment } from "@galacean/engine-building/building/render/CoreBuilding.ts";

it("keeps the mounted parts the design lays when the initial plan is saved as native author Source", async () => {
  const plan = structuredClone(buildingGenerationPlan);
  const registry = createBuildingTypeRegistry(),
    environment = coreBuildingEnvironment(() => 0, constructionGeometry);
  const laid = new Set<string>(),
    rejected = new Set<string>();
  for (const group of initialBuildingDrafts(plan)) {
    const design = designBuildingCore(group.draft, registry, { environment });
    for (const part of design.parts)
      if (part.identity.kind === "author" && MOUNTED_PART_TYPES.includes(part.type))
        if (expandUnits(part, registry, { environment }).length) laid.add(part.identity.id);
    // A mounted part the design does not lay, including one whose geometry failed.
    for (const part of group.draft.parts)
      if (MOUNTED_PART_TYPES.includes(part.type) && !laid.has(part.id)) rejected.add(part.id);
  }
  expect(laid.size).toBeGreaterThan(0);
  const source = await initialBuildingSource(
    plan,
    {
      samples: new Uint16Array(4),
      resolution: 2,
      origin: [-1000, -1000],
      size: 2000,
      decode: { offset: 0, scale: 1 }
    },
    constructionGeometry,
    "Building/Units/building-kit.prefab"
  );
  const restored = JSON.parse(JSON.stringify(source)) as typeof source;
  const parts = restored.components
    .filter((c) => c.type === "BuildingPartComponent")
    .map((c) => c.props!.definition as unknown as BuildingPartDef);
  const saved = new Set(parts.map((p) => p.id));
  for (const id of laid) expect(saved.has(id), `Laid installation lost from Source: ${id}`).toBe(true);
  for (const id of rejected) expect(saved.has(id), `Rejected installation persisted: ${id}`).toBe(false);
  expect(parts.some((p) => p.type === "window")).toBe(true);
  expect(parts.some((p) => p.type === "door")).toBe(true);
  // Some houses carry a Gothic dormer on their roof.
  expect(parts.some((p) => p.type === "dormer")).toBe(true);
});
