import {
  buildingAuthorKey,
  buildingDesignKey
} from "../src/building/parts/architecture/BuildingDesignIdentity";
import { describe, expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { European } from "../src/building/parts/architecture/European";
import { designBuilding } from "../src/building/parts/architecture/BuildingDesign";
import { prepareBuildingPublication } from "../src/building/parts/architecture/BuildingPublication";
import { implementBuilding } from "../src/building/parts/architecture/BuildingImplementation";
import { buildingPlacementAlgorithms } from "../src/building/parts/BuildingAlgorithms";
import { BuildingPath } from "../src/building/parts/BuildingLayout";
import { stoneArchCourses } from "../src/building/parts/algorithms/ArchMembers";
import { constructionGeometry } from "./fixtures/constructionGeometry";

function fixture(wood = false) {
  return European.buildHouses({
    id: "arch-house",
    seed: 17,
    height: 5,
    rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
    ...(wood ? { wall: { unit: "wooden_plank", algorithm: { type: "horizontal_rows" } } } : {}),
    attachments: [
      {
        id: "arch",
        kind: "opening",
        type: "opening-arch",
        host: "wall",
        u: 0.15,
        bottom: 0,
        width: 2.8,
        height: 2.8,
        rank: 1,
        seed: 0
      }
    ]
  });
}

describe("arches separate geometric cuts from registered member placement", () => {
  it.each([false, true])("publishes openings and member bytes (wood=%s)", async (wood) => {
    const draft = fixture(wood),
      design = designBuilding(draft, () => 0, constructionGeometry);
    expect(design.diagnostics).toEqual([]);
    expect(
      design.parts.filter((p) => ["stone-arch/v1", "wood-arch/v1"].includes(p.publication?.format ?? ""))
    ).toHaveLength(1);
    const planned = design.prepared.decorations[0];
    expect(planned.wallProfile).toBeDefined();
    expect(planned.archOpenings).toHaveLength(1);
    expect(planned.archInstances).toBeUndefined();
    expect(planned.woodArchFrames).toBeUndefined();
    expect(planned.woodArchPillars).toBeUndefined();
    expect(
      design.supports.get(
        buildingDesignKey(
          design.parts.filter((p) => ["stone-arch/v1", "wood-arch/v1"].includes(p.publication?.format ?? ""))[0]
            .identity
        )
      ).type
    ).toBe("path");
    const publication = await prepareBuildingPublication(design);

    const actual = publication.prepared.decorations[0];

    expect(wood ? actual.woodArchFrames!.length : actual.archInstances!.length).toBeGreaterThan(0);
    const resolve = vi.spyOn(buildingPlacementAlgorithms, "resolve");
    try {
      const built = await implementBuilding(design, { publication });
      expect(
        resolve.mock.calls.some(
          ([id]) =>
            id ===
            design.parts.filter((p) => ["stone-arch/v1", "wood-arch/v1"].includes(p.publication?.format ?? ""))[0]
              .algorithm.type
        )
      ).toBe(false);
      expect(built.instanceParts).toHaveLength(0);
      expect(built.construction.decorations[0]).toBe(actual);
    } finally {
      resolve.mockRestore();
    }
  });

  it("publishes only accepted arches when openings overlap", async () => {
    const draft = fixture();
    const attachment = draft.parts.find((p) => p.support.generator === "attachmentMount")!;
    const duplicate = structuredClone(attachment);
    duplicate.id += "-overlap";
    duplicate.support.params.spec.id += "-overlap";
    draft.parts.push(duplicate);
    const relation = structuredClone(draft.relations.find((r) => r.from.part === attachment.id)!);
    relation.id += "-overlap";
    relation.from.part = duplicate.id;
    draft.relations.push(relation);
    const design = designBuilding(draft, () => 0, constructionGeometry);
    expect(
      design.parts.filter((p) => ["stone-arch/v1", "wood-arch/v1"].includes(p.publication?.format ?? ""))
    ).toHaveLength(1);
    expect(design.prepared.decorations[0].archOpenings).toHaveLength(1);
    const publication = await prepareBuildingPublication(design);
    const baseline = await prepareBuildingPublication(designBuilding(fixture(), () => 0, constructionGeometry));
    expect(publication.prepared.decorations[0].archInstances).toEqual(baseline.prepared.decorations[0].archInstances);
  });

  it("consumes the derived Path and an async replacement without changing the solved opening", async () => {
    const design = designBuilding(fixture(), () => 0, constructionGeometry),
      part = design.parts.filter((p) => ["stone-arch/v1", "wood-arch/v1"].includes(p.publication?.format ?? ""))[0];
    const initial = await prepareBuildingPublication(design);
    const points = design.supports.get(buildingDesignKey(part.identity)).path.controlPoints;
    design.supports.set(buildingDesignKey(part.identity), {
      type: "path",
      path: new BuildingPath(points.map(([x, y, z]: number[]) => [x + 2, y, z]))
    });
    const custom = vi.fn(async (support, params, context) =>
      stoneArchCourses(support, { ...params, depthScale: 1.3 }, context)
    );
    buildingPlacementAlgorithms.register("test.arch.custom", custom);
    part.algorithm.type = "test.arch.custom";
    const next = await prepareBuildingPublication(design);
    expect(custom).toHaveBeenCalledTimes(1);
    expect(next.prepared.decorations[0].archInstances).not.toEqual(initial.prepared.decorations[0].archInstances);
    expect(next.prepared.decorations[0].wallProfile).toBe(initial.prepared.decorations[0].wallProfile);
    expect(design.prepared.decorations[0].archInstances).toBeUndefined();
  });
});
