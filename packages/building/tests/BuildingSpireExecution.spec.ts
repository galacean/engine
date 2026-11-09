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
import {
  prepareBuildingPublication,
  buildingPreviewInput
} from "../src/building/parts/architecture/BuildingPublication";
import { implementBuilding } from "../src/building/parts/architecture/BuildingImplementation";
import { buildingPlacementAlgorithms } from "../src/building/parts/BuildingAlgorithms";
import { placeRoofSpire, roofSpireRecordFormat } from "../src/building/parts/algorithms/RoofSpire";
import { buildingPose } from "../src/building/parts/BuildingLayout";
import { profilePreview } from "../src/building/runtime/ProfilePreview";
import * as spireGeometry from "../src/building/runtime/ProfileRoofSpire";
import { constructionGeometry } from "./fixtures/constructionGeometry";

function fixture(circle = true, profile = 0.4, ridge = 0, height = 0.7) {
  return European.buildHouses({
    id: "spire",
    height: 5,
    seed: 17,
    ...(circle
      ? { circle: { center: [2, 4] as [number, number], radius: 3, phase: 0.3 } }
      : { rectangle: { center: [2, 4] as [number, number], size: [8, 6] as [number, number], rotation: 0.4 } }),
    roof: { height, profile, ridge_length: ridge, tip: circle ? [0.2, -0.3] : [0, 0] }
  });
}
const build = async (draft: ReturnType<typeof fixture>) =>
  implementBuilding(designBuilding(draft, () => 0, constructionGeometry));
describe("roof finials are derived Point + mesh + registered placement", () => {
  for (const circle of [false, true])
    for (const profile of [0, 0.4, 1])
      it(`${circle ? "round" : "square"} profile ${profile} executes geometry only at publication`, async () => {
        const draft = fixture(circle, profile),
          before = JSON.stringify(draft),
          asset = structuredClone(constructionGeometry.roofSpire);
        const generate = vi.spyOn(spireGeometry, "placeProfileRoofSpire");
        try {
          const design = designBuilding(draft, () => 0, constructionGeometry);
          expect(generate).not.toHaveBeenCalled();
          expect(design.parts.filter((p) => p.publication?.format === "roof-spire/v1")).toHaveLength(1);
          expect(design.parts.filter((p) => p.publication?.format === "roof-spire/v1")[0]).toMatchObject({
            type: "roof-spire",
            support: { generator: "point" },
            unit: { libraryMesh: "roofSpire" },
            algorithm: { type: "placeRoofSpire" }
          });
          expect(design.prepared).not.toHaveProperty("spires");
          const publication = await prepareBuildingPublication(design);
          expect(generate).toHaveBeenCalledTimes(1);

          const preview = profilePreview(buildingPreviewInput(design, publication), () => 0, {
            assets: constructionGeometry
          });
          const result = await implementBuilding(design, { publication });
          expect(generate).toHaveBeenCalledTimes(1);

          expect(publication.prepared.spires).toHaveLength(1);
          expect(result.preview.parts.filter((p) => p.roofSpire)).toEqual(preview.parts.filter((p) => p.roofSpire));
          expect(JSON.stringify(draft)).toBe(before);
          expect(constructionGeometry.roofSpire).toEqual(asset);
        } finally {
          generate.mockRestore();
        }
      });
  it("does not schedule a finial on flat or extended-ridge roofs", async () => {
    for (const draft of [fixture(false, 0.4, 0, 0), fixture(true, 0.4, 0, 0), fixture(false, 0.4, 0.2)]) {
      const design = designBuilding(draft, () => 0, constructionGeometry);
      expect(design.parts.filter((p) => p.publication?.format === "roof-spire/v1")).toEqual([]);
      expect((await implementBuilding(design)).preview.parts.some((p) => p.roofSpire)).toBe(false);
    }
  });
  it("a custom async placer can suppress the ornament without preview regenerating it", async () => {
    const custom = vi.fn(async () => ({ kind: "records" as const, format: roofSpireRecordFormat, records: [] }));
    buildingPlacementAlgorithms.register("test.no-finial", custom);
    const draft = fixture();
    draft.parts.find((p) => p.type === "roof")!.params.spireAlgorithm = "test.no-finial";
    const actual = await build(draft);
    expect(custom).toHaveBeenCalledTimes(1);
    expect(actual.construction.spires).toEqual([]);
    expect(actual.preview.parts.some((p) => p.roofSpire)).toBe(false);
  });
  it("consecutive UV hide and restore edits preserve the actual published finial", async () => {
    const draft = fixture(),
      roof = draft.parts.find((p) => p.type === "roof")!;
    const original = (await build(draft)).preview.parts.find((p) => p.roofSpire)!;
    roof.regions = [
      {
        id: "hide-top",
        region: {
          space: "surface_uv",
          polygon: [
            [-100, -100],
            [100, -100],
            [100, 100],
            [-100, 100]
          ]
        },
        effect: { hidden: true }
      }
    ];
    expect((await build(draft)).preview.parts.some((p) => p.roofSpire)).toBe(false);
    roof.regions = [];
    expect((await build(draft)).preview.parts.find((p) => p.roofSpire)).toEqual(original);
  });
  it("uses the selected source mesh and honors Point orientation without mutating the asset", async () => {
    const params = { ownerId: "unit", radius: 0.25, profile: 0.4, mesh: constructionGeometry.roofSpire };
    const source = structuredClone(params.mesh),
      position: [number, number, number] = [2, 7, 4];
    const a = await placeRoofSpire({ type: "point", pose: buildingPose(position, [1, 0, 0], [0, 1, 0]) }, params, {});
    const b = await placeRoofSpire({ type: "point", pose: buildingPose(position, [0, 1, 0], [-1, 0, 0]) }, params, {});
    for (let i = 0; i < a.records[0].part.positions.length; i += 3) {
      const p = a.records[0].part.positions.slice(i, i + 3),
        q = b.records[0].part.positions.slice(i, i + 3);
      const expected = [position[0] - (p[1] - position[1]), position[1] + (p[0] - position[0]), p[2]];
      q.forEach((v, k) => expect(v).toBeCloseTo(expected[k], 12));
    }
    const changed = structuredClone(params.mesh);
    changed.color = [1, 0, 0];
    const c = await placeRoofSpire(
      { type: "point", pose: buildingPose(position, [1, 0, 0], [0, 1, 0]) },
      { ...params, mesh: changed },
      {}
    );
    expect(c.records[0].part.positions).toEqual(a.records[0].part.positions);
    expect(c.records[0].part.colors).not.toEqual(a.records[0].part.colors);
    expect(params.mesh).toEqual(source);
  });
  it("allows author names matching derived roles and rejects incompatible placement records", async () => {
    const draft = fixture(),
      roof = draft.parts.find((p) => p.type === "roof")!;
    draft.parts.push({
      ...structuredClone(roof),
      id: roof.id + "/spire",
      type: "other",
      support: { generator: "point", params: {} },
      algorithm: { type: "placeAtPoint" }
    });
    expect(() => designBuilding(draft, () => 0, constructionGeometry)).not.toThrow();
    const clean = fixture();
    buildingPlacementAlgorithms.register("test.bad-finial", () => []);
    clean.parts.find((p) => p.type === "roof")!.params.spireAlgorithm = "test.bad-finial";
    await expect(build(clean)).rejects.toThrow(/roof-spire\/v1/);
  });
});
