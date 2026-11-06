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
import { designBuilding } from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingDesign.ts";
import type { BuildingBasePart } from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingDraft.ts";

it("keeps accepted facade installations when the initial plan is saved as native author Source", async () => {
  const plan = structuredClone(buildingGenerationPlan);
  const expected = new Set<string>();
  const rejected = new Set<string>();
  for (const group of initialBuildingDrafts(plan, constructionGeometry)) {
    const design = designBuilding(group.draft, () => 0, constructionGeometry);
    for (const diagnostic of design.diagnostics) rejected.add(diagnostic.part);
    for (const decoration of design.prepared.decorations)
      for (const mount of decoration.mounts) expected.add(mount.decorationId);
  }
  expect(expected.size).toBeGreaterThan(0);
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
    .map((c) => c.props!.definition as unknown as BuildingBasePart);
  const saved = new Set(parts.filter((p) => p.support.generator === "attachmentMount").map((p) => p.id));
  for (const id of expected) expect(saved.has(id), `Accepted installation lost from Source: ${id}`).toBe(true);
  for (const id of rejected) expect(saved.has(id), `Rejected installation persisted: ${id}`).toBe(false);
  expect(parts.some((p) => p.type === "window")).toBe(true);
  expect(parts.some((p) => p.type === "door")).toBe(true);
});
