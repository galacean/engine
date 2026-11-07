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
import { cottageDormerCourses } from "../src/building/parts/algorithms/CottageDormerCourses";
import * as meshProducer from "../src/building/runtime/ConstructionDecorationGeometry";
import * as roofProducer from "../src/building/runtime/RecoveredCottageDormerRoof";
import { constructionDecorationRecipe } from "../src/building/runtime/ConstructionDecorationRecipe";
import { constructionGeometry } from "./fixtures/constructionGeometry";

function fixture(rank: 1 | 2 | 3 = 1, circle = false) {
  const recipe = constructionDecorationRecipe(constructionGeometry.decorations, "dormer-cottage", rank)!;
  return European.buildHouses({
    id: "host",
    seed: 17,
    height: 5,
    woodColor: 2,
    ...(circle
      ? { circle: { center: [0, 0] as [number, number], radius: 5, phase: 0 } }
      : { rectangle: { center: [0, 0] as [number, number], size: [10, 8] as [number, number], rotation: 0 } }),
    roof: { height: 0.9, ridge_length: 0.35, profile: 0.7, ridge_direction: 0, tip: [0, 0] },
    attachments: [
      {
        id: "dormer",
        type: "dormer-cottage",
        kind: "window",
        rank,
        host: "roof",
        uv: [0.02, 0.5],
        bottom: 0,
        width: recipe.installationSize[0],
        height: recipe.installationSize[1]
      }
    ]
  });
}
describe("full Cottage dormer uses mounts and a derived roof support", () => {
  for (const circle of [false, true])
    for (const rank of [1, 2, 3] as const)
      it(`${circle ? "circle" : "rectangle"} rank ${rank} defers geometry until publication`, async () => {
        const draft = fixture(rank, circle),
          before = JSON.stringify(draft);
        const mesh = vi.spyOn(meshProducer, "decorationAssemblyGeometry"),
          roof = vi.spyOn(roofProducer, "assembleCottageDormerRoof");
        let design: ReturnType<typeof designBuilding>;
        try {
          design = designBuilding(draft, () => 0, constructionGeometry);
          expect(mesh).not.toHaveBeenCalled();
          expect(roof).not.toHaveBeenCalled();
        } finally {
          mesh.mockRestore();
          roof.mockRestore();
        }
        expect(design!.diagnostics).toEqual([]);
        expect(design!.parts.filter((p) => p.publication?.format === "native-attachment/v1")).toHaveLength(1);
        expect(design!.parts.filter((p) => p.publication?.format === "dormer-roof/v1")).toHaveLength(1);
        expect(design!.prepared.decorations[0].parts).toEqual([]);
        expect(design!.prepared.decorations[0].roofUnits).toEqual([]);
        expect(() => structuredClone(design!.prepared.decorations[0].mounts)).not.toThrow();
        const p = design!.parts.filter((p) => p.publication?.format === "dormer-roof/v1")[0];
        expect(p.unit).toBe("roof_tile");
        expect(design!.supports.get(buildingDesignKey(p.identity)).type).toBe("surface");
        const publication = await prepareBuildingPublication(design!);
        const actual = publication.prepared.decorations[0];

        expect(actual.parts.length).toBeGreaterThan(0);
        expect(actual.roofUnits.length).toBeGreaterThan(0);
        expect(publication.placedParts.has(buildingDesignKey(p.identity))).toBe(true);
        expect(JSON.stringify(draft)).toBe(before);
        const resolve = vi.spyOn(buildingPlacementAlgorithms, "resolve");
        try {
          await implementBuilding(design!, { publication });
          expect(resolve.mock.calls.some(([n]) => n === "mountAttachment" || n === "cottageDormerCourses")).toBe(false);
        } finally {
          resolve.mockRestore();
        }
      });
  it("executes an async replacement roof algorithm without moving the aperture or window", async () => {
    const draft = fixture(),
      base = await prepareBuildingPublication(designBuilding(draft, () => 0, constructionGeometry));
    const custom = vi.fn(async (s, p, c) => {
      const result = cottageDormerCourses(s, p, c);
      return { ...result, records: result.records.slice(1) };
    });
    buildingPlacementAlgorithms.register("test.dormer.courses", custom);
    draft.parts.find((p) => p.support.generator === "attachmentMount")!.params.roofAlgorithm = "test.dormer.courses";
    const result = await prepareBuildingPublication(designBuilding(draft, () => 0, constructionGeometry));
    expect(custom).toHaveBeenCalledTimes(1);
    expect(result.prepared.decorations[0].roofUnits).toEqual(base.prepared.decorations[0].roofUnits.slice(1));
    expect(result.prepared.decorations[0].parts).toEqual(base.prepared.decorations[0].parts);
    expect(result.prepared.decorations[0].roofOpenings).toEqual(base.prepared.decorations[0].roofOpenings);
  });
  it("allows author names matching derived roofs and rejects wrong record format", async () => {
    const draft = fixture(),
      source = draft.parts.find((p) => p.support.generator === "attachmentMount")!;
    draft.parts.push({
      ...draft.parts[0],
      id: source.id + "/roof",
      support: { generator: "point", params: {} },
      unit: "brick",
      algorithm: { type: "placeAtPoint" }
    });
    expect(() => designBuilding(draft, () => 0, constructionGeometry)).not.toThrow();
    draft.parts.pop();
    buildingPlacementAlgorithms.register("test.dormer.invalid", () => []);
    source.params.roofAlgorithm = "test.dormer.invalid";
    await expect(prepareBuildingPublication(designBuilding(draft, () => 0, constructionGeometry))).rejects.toThrow(
      "dormer-roof/v1"
    );
  });
});
