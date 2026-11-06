import { describe, expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { European } from "../src/tiny-glade/parts/architecture/European";
import { designBuilding } from "../src/tiny-glade/parts/architecture/BuildingDesign";
import { prepareBuildingPublication } from "../src/tiny-glade/parts/architecture/BuildingPublication";
import { implementBuilding } from "../src/tiny-glade/parts/architecture/BuildingImplementation";
import { buildingPlacementAlgorithms } from "../src/tiny-glade/parts/BuildingAlgorithms";
import { profiledDormerCourses } from "../src/tiny-glade/parts/algorithms/ProfiledDormerCourses";
import * as meshProducer from "../src/tiny-glade/runtime/ConstructionDecorationGeometry";
import * as tileProducer from "../src/tiny-glade/runtime/GothicRoofTiles";
import * as packer from "../src/tiny-glade/runtime/RecoveredRoofPlacement";
import { constructionDecorationRecipe } from "../src/tiny-glade/runtime/ConstructionDecorationRecipe";
import { constructionGeometry } from "./fixtures/constructionGeometry";
import type { ConstructionDecorationSpec } from "../src/tiny-glade/runtime/ConstructionDecorations";

function fixture(rank: 1 | 2 | 3 = 1, circle = false, stoneFrame = false, resized = false) {
  const recipe = constructionDecorationRecipe(constructionGeometry.decorations, "dormer-gothic", rank)!;
  return European.buildHouses({
    id: "host",
    seed: 17,
    height: 5,
    woodColor: 2,
    ...(circle
      ? { circle: { center: [0, 0] as [number, number], radius: 5, phase: 0 } }
      : { rectangle: { center: [0, 0] as [number, number], size: [10, 8] as [number, number], rotation: 0 } }),
    roof: { height: 0.9, ridge_length: 0.35, profile: 0.7, ridge_direction: 0, tip: [0, 0] },
    ...(resized ? { roofStyle: { footprint: { width: 0.65, height: 0.32, depth: 0.08 }, seed: 71 } } : {}),
    attachments: [
      {
        id: "dormer",
        type: "dormer-gothic",
        kind: "window",
        rank,
        host: "roof",
        uv: [0.02, 0.5],
        bottom: 0,
        ...(stoneFrame ? { frameMaterial: "wall" as const } : {}),
        width: recipe.installationSize[0] * (resized ? 0.75 : 1),
        height: recipe.installationSize[1] * (resized ? 0.5 : 1)
      }
    ]
  });
}
const keys = [
  "parts",
  "frames",
  "roofUnits",
  "roofOpenings",
  "holes",
  "windowCuts",
  "diagnostics",
  "resolved"
] as const;
async function publish(draft: ReturnType<typeof fixture>) {
  const design = designBuilding(draft, () => 0, constructionGeometry);
  const publication = await prepareBuildingPublication(design);

  return { design, publication };
}
describe("Gothic dormer mount, surface and registered placement", () => {
  for (const circle of [false, true])
    for (const rank of [1, 2, 3] as const)
      for (const stoneFrame of [false, true])
        it(`${circle ? "circle" : "rectangle"} rank ${rank} ${stoneFrame ? "stone" : "wood"} frame publishes the selected frame`, async () => {
          const draft = fixture(rank, circle, stoneFrame),
            before = JSON.stringify(draft);
          const mesh = vi.spyOn(meshProducer, "decorationAssemblyGeometry"),
            tiles = vi.spyOn(tileProducer, "gothicRoofTilesFromProfiles"),
            packed = vi.spyOn(packer, "packRoof"),
            sample = vi.spyOn(tileProducer, "visitGothicRoofLayout");
          let design: ReturnType<typeof designBuilding>;
          try {
            design = designBuilding(draft, () => 0, constructionGeometry);
            expect(sample).toHaveBeenCalledTimes(1); // Exact reservation must still sample physical strip bounds.
            expect(mesh).not.toHaveBeenCalled();
            expect(tiles).not.toHaveBeenCalled();
            expect(packed).not.toHaveBeenCalled();
          } finally {
            mesh.mockRestore();
            tiles.mockRestore();
            packed.mockRestore();
            sample.mockRestore();
          }
          expect(design!.diagnostics).toEqual([]);
          expect(design!.parts.filter((p) => p.publication?.format === "native-attachment/v1")).toHaveLength(1);
          expect(design!.parts.filter((p) => p.publication?.format === "dormer-roof/v1")).toHaveLength(1);
          expect(design!.prepared.decorations[0].parts).toEqual([]);
          expect(design!.prepared.decorations[0].roofUnits).toEqual([]);
          expect(design!.parts.filter((p) => p.publication?.format === "dormer-roof/v1")[0].support.generator).toBe(
            "profiledDormerRoof"
          );
          expect(design!.parts.filter((p) => p.publication?.format === "dormer-roof/v1")[0].algorithm.type).toBe(
            "profiledDormerCourses"
          );
          expect(() => structuredClone(design!.prepared.decorations[0])).not.toThrow();
          const publication = await prepareBuildingPublication(design!);

          expect(publication.prepared.decorations[0].roofUnits.length).toBeGreaterThan(0);
          const resolve = vi.spyOn(buildingPlacementAlgorithms, "resolve");
          try {
            await implementBuilding(design!, { publication });
            expect(resolve.mock.calls.some(([n]) => n === "profiledDormerCourses" || n === "mountAttachment")).toBe(
              false
            );
          } finally {
            resolve.mockRestore();
          }
          expect(JSON.stringify(draft)).toBe(before);
        });
  it.each([1, 2, 3] as const)("rank %i preserves resized openings and target footprints", async (rank) => {
    const { publication } = await publish(fixture(rank, true, true, true));
    expect(publication.prepared.decorations[0].roofUnits.length).toBeGreaterThan(0);
  });
  it("keeps mixed-attachment overlap decisions, accepted ordering and orphan-free apertures", async () => {
    const base = fixture(2),
      first = base.parts.find((p) => p.support.generator === "attachmentMount")!;
    const full = first.support.params.spec;
    const recipe = constructionDecorationRecipe(constructionGeometry.decorations, "dormer-cottage", 1)!;
    const draft = European.buildHouses({
      id: "host",
      height: 5,
      seed: 17,
      rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
      roof: { height: 0.9, ridge_length: 0.35, profile: 0.7, ridge_direction: 0, tip: [0, 0] },
      attachments: [
        { ...full, ...(first.unit as { nativeAttachment: object }).nativeAttachment } as ConstructionDecorationSpec,
        { ...full, id: "duplicate", type: "dormer-gothic", kind: "window", rank: 2 } as ConstructionDecorationSpec,
        {
          id: "cottage-overlap",
          type: "dormer-cottage",
          kind: "window",
          rank: 1,
          host: "roof",
          uv: [0.021, 0.5],
          bottom: 0,
          width: recipe.installationSize[0],
          height: recipe.installationSize[1]
        },
        {
          ...full,
          id: "separate",
          type: "dormer-gothic",
          kind: "window",
          rank: 2,
          uv: [0.25, 0.5]
        } as ConstructionDecorationSpec
      ]
    });
    const { design, publication } = await publish(draft);
    expect(design.diagnostics.some((d) => d.id === draft.parts.find(p => p.support.params.spec?.id === "duplicate")!.id && d.code === "OVERLAP")).toBe(true);
    expect(publication.prepared.decorations[0].roofOpenings.some((p) => p.id.startsWith(draft.parts.find(p => p.support.params.spec?.id === "duplicate")!.id + "/"))).toBe(false);
  });
  it("executes an async custom roof function and keeps design apertures independent", async () => {
    const draft = fixture(),
      base = await prepareBuildingPublication(designBuilding(draft, () => 0, constructionGeometry));
    const custom = vi.fn(async (s, p, c) => {
      const result = profiledDormerCourses(s, p, c);
      return { ...result, records: result.records.slice(1) };
    });
    buildingPlacementAlgorithms.register("test.gothic.courses", custom);
    draft.parts.find((p) => p.support.generator === "attachmentMount")!.params.roofAlgorithm = "test.gothic.courses";
    const next = await prepareBuildingPublication(designBuilding(draft, () => 0, constructionGeometry));
    expect(custom).toHaveBeenCalledTimes(1);
    expect(next.prepared.decorations[0].roofUnits).toEqual(base.prepared.decorations[0].roofUnits.slice(1));
    expect(next.prepared.decorations[0].parts).toEqual(base.prepared.decorations[0].parts);
    expect(next.prepared.decorations[0].roofOpenings).toEqual(base.prepared.decorations[0].roofOpenings);
  });
});
