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
import * as geometryProducer from "../src/building/runtime/ConstructionDecorationGeometry";
import * as gothicPacker from "../src/building/runtime/RecoveredRoofPlacement";
import * as cottagePacker from "../src/building/runtime/RecoveredCottageDormerRoof";
import { constructionDecorationRecipe } from "../src/building/runtime/ConstructionDecorationRecipe";
import { constructionGeometry } from "./fixtures/constructionGeometry";

function fixture(type: string, rank: 1 | 2 | 3, circle = false, stone = false, seed = 17) {
  const recipe = constructionDecorationRecipe(constructionGeometry.decorations, type, rank)!;
  return European.buildHouses({
    id: "host",
    seed,
    height: 5,
    woodColor: 2,
    ...(circle
      ? { circle: { center: [0, 0] as [number, number], radius: 5, phase: 0 } }
      : { rectangle: { center: [0, 0] as [number, number], size: [10, 8] as [number, number], rotation: 0 } }),
    roof: { height: 0.9, ridge_length: 0.35, profile: 0.7, ridge_direction: 0, tip: [0, 0] },
    attachments: [
      {
        id: "half",
        kind: "window",
        type,
        rank,
        host: "wall",
        u: circle ? 0 : 1 / 9,
        bottom: 4.8 + recipe.bounds.min[1],
        width: recipe.installationSize[0],
        height: recipe.installationSize[1],
        ...(stone ? { frameMaterial: "wall" as const } : {})
      }
    ]
  });
}
const keys = [
  "parts",
  "frames",
  "stones",
  "roofUnits",
  "roofOpenings",
  "holes",
  "windowCuts",
  "diagnostics",
  "resolved"
] as const;
const variants = [
  ...[1, 2, 3].map((rank) => ({ type: "dormer-cottage-half", rank: rank as 1 | 2 | 3 })),
  ...[1, 2, 3].map((rank) => ({ type: "dormer-gothic-half", rank: rank as 1 | 2 | 3 })),
  ...[2, 3].map((rank) => ({ type: "dormer-arrow-slit-half", rank: rank as 2 | 3 }))
];
describe("half dormers share mount and roof placement execution", () => {
  for (const { type, rank } of variants)
    for (const circle of [false, true])
      it(`${type} ${rank} on ${circle ? "circle" : "rectangle"} preserves geometry, cuts and material records`, async () => {
        const draft = fixture(type, rank, circle, type !== "dormer-cottage-half");
        const mesh = vi.spyOn(geometryProducer, "decorationAssemblyGeometry"),
          roof = vi.spyOn(gothicPacker, "packRoof"),
          cottage = vi.spyOn(cottagePacker, "packCottageStrip64");
        let design: ReturnType<typeof designBuilding>;
        try {
          design = designBuilding(draft, () => 0, constructionGeometry);
          expect(mesh).not.toHaveBeenCalled();
          expect(roof).not.toHaveBeenCalled();
          expect(cottage).not.toHaveBeenCalled();
        } finally {
          mesh.mockRestore();
          roof.mockRestore();
          cottage.mockRestore();
        }
        expect(design!.diagnostics).toEqual([]);
        expect(design!.parts.filter((p) => p.publication?.format === "native-attachment/v1")).toHaveLength(1);
        expect(design!.parts.filter((p) => p.publication?.format === "dormer-roof/v1")).toHaveLength(1);
        expect(design!.prepared.decorations[0].parts).toEqual([]);
        expect(design!.prepared.decorations[0].frames).toEqual([]);
        expect(design!.prepared.decorations[0].stones).toEqual([]);
        expect(design!.prepared.decorations[0].roofUnits).toEqual([]);
        expect(() => structuredClone(design!.prepared.decorations[0])).not.toThrow();
        const actual = await prepareBuildingPublication(design!);

        expect(actual.prepared.decorations[0].roofUnits.length).toBeGreaterThan(0);
        const resolve = vi.spyOn(buildingPlacementAlgorithms, "resolve");
        try {
          await implementBuilding(design!, { publication: actual });
          expect(
            resolve.mock.calls.some(([name]) =>
              ["mountAttachment", "profiledDormerCourses", "cottageDormerCourses"].includes(String(name))
            )
          ).toBe(false);
        } finally {
          resolve.mockRestore();
        }
      });
  for (const type of ["dormer-cottage-half", "dormer-gothic-half", "dormer-arrow-slit-half"])
    it(`${type} executes a custom roof algorithm without changing its planned holes`, async () => {
      const draft = fixture(type, 2),
        source = draft.parts.find((p) => p.support.generator === "attachmentMount")!;
      const original = designBuilding(draft, () => 0, constructionGeometry),
        published = await prepareBuildingPublication(original);
      const base = buildingPlacementAlgorithms.resolve(
        original.parts.filter((p) => p.publication?.format === "dormer-roof/v1")[0].algorithm.type
      );
      const callback = vi.fn(async (...args: Parameters<typeof base>) => {
        const value = await base(...args);
        if (Array.isArray(value) || !("kind" in value) || value.kind !== "records")
          throw Error("Expected roof records");
        return { ...value, records: value.records.slice(1) };
      });
      const id = "test.half-roof." + type;
      buildingPlacementAlgorithms.register(id, callback);
      source.params.roofAlgorithm = id;
      const edited = designBuilding(draft, () => 0, constructionGeometry),
        actual = await prepareBuildingPublication(edited);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(actual.prepared.decorations[0].roofUnits).toHaveLength(
        published.prepared.decorations[0].roofUnits.length - 1
      );
      for (const key of ["parts", "frames", "stones", "holes", "windowCuts", "roofOpenings"] as const)
        expect(actual.prepared.decorations[0][key]).toEqual(published.prepared.decorations[0][key]);
    });
  it("rejects an overlapping half dormer without orphaned mounts or extra cuts", async () => {
    const draft = fixture("dormer-cottage-half", 2),
      source = draft.parts.find((p) => p.support.generator === "attachmentMount")!;
    const duplicate = structuredClone(source);
    duplicate.id += "-duplicate";
    duplicate.support.params.spec.id = "duplicate";
    draft.parts.push(duplicate);
    draft.relations.push(
      ...draft.relations
        .filter((r) => r.from.part === source.id)
        .map((r) => ({ ...r, id: r.id + "-duplicate", from: { ...r.from, part: duplicate.id } }))
    );
    const design = designBuilding(draft, () => 0, constructionGeometry),
      publication = await prepareBuildingPublication(design);
    expect(design.diagnostics.some((d) => d.id === duplicate.id && d.code === "OVERLAP")).toBe(true);
    expect(design.parts.filter((p) => p.publication?.format === "native-attachment/v1")).toHaveLength(1);
    expect(design.parts.filter((p) => p.publication?.format === "dormer-roof/v1")).toHaveLength(1);
  });
});
