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
import { mountAttachment } from "../src/building/parts/algorithms/MountAttachment";
import { constructionDecorationAssembly } from "../src/building/runtime/ConstructionDecorationAssembly";
import { constructionDecorationLights } from "../src/building/runtime/ConstructionDecorationLightPolicy";
import * as geometryProducer from "../src/building/runtime/ConstructionDecorationGeometry";
import { shapeCurve } from "../src/building/runtime/RecoveredWallConnectionHoles";
import { profileShape } from "../src/building/runtime/ProfileGeometry";
import { normalizeProfileFootprint } from "../src/building/runtime/ProfileParameters";
import { constructionGeometry } from "./fixtures/constructionGeometry";

function fixture(type = "window-cottage", frameMaterial: "wood" | "wall" = "wood") {
  const assembly = constructionDecorationAssembly(constructionGeometry.decorations, type, 1)!;
  const roof = type.startsWith("hatch-") || type === "roof-lantern";
  return European.buildHouses({
    id: "host",
    height: 7,
    seed: 17,
    rectangle: { center: [0, 0], size: [12, 10], rotation: 0.2 },
    roof: { height: roof ? 0 : 0.5 },
    attachments: [
      {
        id: "attachment",
        kind: type.includes("lantern") ? "lantern" : type.startsWith("door") ? "door" : "window",
        type,
        host: roof ? "roof" : "wall",
        ...(roof ? { uv: [0.5, 0.5] as [number, number] } : { u: 0.35 }),
        bottom: roof ? 0 : 1,
        width: assembly.bounds.max[0] - assembly.bounds.min[0],
        height: assembly.bounds.max[1] - assembly.bounds.min[1],
        rank: 1,
        ...(type.startsWith("window") ? { frameMaterial } : {}),
        ...(roof ? {} : { seed: 0 })
      }
    ]
  });
}
describe("native attachments execute the declared placement algorithm", () => {
  it.each([
    "window-cottage",
    "window-gothic",
    "window-arrow-slit",
    "door-cottage",
    "door-gothic",
    "wall-lantern",
    "hatch-cottage",
    "hatch-gothic",
    "roof-lantern"
  ])("separates %s openings/mounts from mesh publication", async (type) => {
    const draft = fixture(type, type === "window-gothic" || type === "window-arrow-slit" ? "wall" : "wood");
    const design = designBuilding(draft, () => 0, constructionGeometry);
    expect(design.diagnostics).toEqual([]);
    expect(design.parts.filter((p) => p.publication?.format === "native-attachment/v1")).toHaveLength(1);
    const planned = design.prepared.decorations[0];
    expect(planned.parts).toHaveLength(0);
    expect(planned.frames).toHaveLength(0);
    expect(planned.stones).toHaveLength(0);
    expect(
      design.supports.get(
        buildingDesignKey(design.parts.filter((p) => p.publication?.format === "native-attachment/v1")[0].identity)
      ).type
    ).toBe("point");
    expect(() => structuredClone(planned.mounts)).not.toThrow();
    const publication = await prepareBuildingPublication(design);

    const actual = publication.prepared.decorations[0];

    expect(actual.parts.length + actual.frames.length + actual.stones.length).toBeGreaterThan(0);
    expect(actual).not.toHaveProperty("mounts");
    if (type.includes("lantern")) expect(constructionDecorationLights(actual.parts).length).toBeGreaterThan(0);

    const resolve = vi.spyOn(buildingPlacementAlgorithms, "resolve");
    try {
      await implementBuilding(design, { publication });
      expect(resolve.mock.calls.some(([name]) => name === "mountAttachment")).toBe(false);
    } finally {
      resolve.mockRestore();
    }
  });
  it("keeps a flat hatch cut assigned to its host in a multi-group design", async () => {
    const first = European.buildHouses({
      id: "first",
      height: 7,
      rectangle: { center: [-20, 0], size: [12, 10], rotation: 0 },
      roof: { height: 0 }
    });
    const second = fixture("hatch-cottage");
    const draft = {
      groups: [...first.groups, ...second.groups],
      parts: [...first.parts, ...second.parts],
      relations: [...first.relations, ...second.relations]
    };
    const design = designBuilding(draft, () => 0, constructionGeometry),
      publication = await prepareBuildingPublication(design);
    const cuts = publication.prepared.decorations.find((d) => d.owner === "host")!.roofOpenings;
    expect(cuts).toHaveLength(1);
    expect(new DataView(cuts[0].raw48.buffer, cuts[0].raw48.byteOffset).getUint32(12, true)).toBe(1);
  });
  it("calls an async replacement on the solved mount without replanning the wall opening", async () => {
    const draft = fixture();
    const attachment = draft.parts.find((p) => p.support.generator === "attachmentMount")!;
    const custom = vi.fn(async (support, params, context) =>
      mountAttachment(
        {
          ...support,
          attachment: {
            ...support.attachment,
            origin: support.attachment.origin.map((v: number, i: number) => v + (i === 0 ? 2 : 0)),
            glassOrigin: support.attachment.glassOrigin?.map((v: number, i: number) => v + (i === 0 ? 2 : 0))
          }
        },
        params,
        context
      )
    );
    buildingPlacementAlgorithms.register("test.attachment.shift", custom);
    attachment.algorithm.type = "test.attachment.shift";
    const design = designBuilding(draft, () => 0, constructionGeometry),
      holes = structuredClone(design.prepared.decorations[0].holes);
    const publication = await prepareBuildingPublication(design);
    expect(custom).toHaveBeenCalledTimes(1);
    expect(publication.prepared.decorations[0].holes).toEqual(holes);
    const baseline = await prepareBuildingPublication(designBuilding(fixture(), () => 0, constructionGeometry));
    const shifted = publication.prepared.decorations[0].parts[0].positions,
      original = baseline.prepared.decorations[0].parts[0].positions;
    for (let i = 0; i < shifted.length; i++) expect(shifted[i]).toBeCloseTo(original[i] + (i % 3 === 0 ? 2 : 0), 12);
    expect(design.prepared.decorations[0].parts).toHaveLength(0);
  });
  it("never schedules rejected overlapping attachments", async () => {
    const draft = fixture();
    const a = draft.parts.find((p) => p.support.generator === "attachmentMount")!;
    const duplicate = structuredClone(a);
    duplicate.id += "-overlap";
    duplicate.support.params.spec.id += "-overlap";
    draft.parts.push(duplicate);
    const relation = structuredClone(draft.relations.find((r) => r.from.part === a.id)!);
    relation.id += "-overlap";
    relation.from.part = duplicate.id;
    draft.relations.push(relation);
    const design = designBuilding(draft, () => 0, constructionGeometry);
    expect(design.parts.filter((p) => p.publication?.format === "native-attachment/v1")).toHaveLength(1);
    expect(design.diagnostics).toHaveLength(1);
    expect(design.diagnostics[0].code).toBe("OVERLAP");
    const publication = await prepareBuildingPublication(design);
    expect(publication.placedParts.has(buildingAuthorKey(a.id))).toBe(true);
    expect(publication.placedParts.has(buildingAuthorKey(duplicate.id))).toBe(false);
  });
  it("rejects the wrong result format and honors cancellation before geometry publication", async () => {
    const design = designBuilding(fixture(), () => 0, constructionGeometry),
      part = design.parts.filter((p) => p.publication?.format === "native-attachment/v1")[0];
    buildingPlacementAlgorithms.register("test.attachment.invalid", () => []);
    part.algorithm.type = "test.attachment.invalid";
    await expect(prepareBuildingPublication(design)).rejects.toThrow("native-attachment/v1");
    part.algorithm.type = "mountAttachment";
    const controller = new AbortController();
    controller.abort();
    await expect(prepareBuildingPublication(design, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError"
    });
    expect(design.prepared.decorations[0].parts).toHaveLength(0);
  });
});

describe("corner attachment planning and registered placement", () => {
  function cornerDraft(rank: 1 | 2 | 3 = 1, corner = 0, timber = false) {
    const a = constructionDecorationAssembly(constructionGeometry.decorations, "window-cottage-corner", rank)!;
    const rectangle = { center: [2, 3] as [number, number], size: [10, 8] as [number, number], rotation: 0.3 };
    const curve = shapeCurve(profileShape(normalizeProfileFootprint({ rectangle })), 0.5);
    return European.buildHouses({
      id: "corner-host",
      height: 6,
      seed: 17,
      rectangle,
      roof: { height: 0.4, ridge_length: 0.6, eave: 0.3, color: 2 },
      ...(timber ? { wall: { unit: "wooden_plank" as const, algorithm: { type: "horizontal_rows" } } } : {}),
      attachments: [
        {
          id: "corner",
          kind: "window",
          type: "window-cottage-corner",
          rank,
          u: curve.knots[corner],
          bottom: 0.7,
          width: (a.bounds.max[0] - a.bounds.min[0]) * 1.15,
          height: (a.bounds.max[1] - a.bounds.min[1]) * 0.8,
          woodColor: 4,
          lightIntensity: 0.2
        }
      ]
    });
  }
  for (const timber of [false, true])
    for (const rank of [1, 2, 3] as const)
      it(`places rank ${rank} on all corners of ${timber ? "timber" : "masonry"} through solved mounts`, async () => {
        for (const corner of [0, 1, 2, 3]) {
          const draft = cornerDraft(rank, corner, timber);
          const produce = vi.spyOn(geometryProducer, "decorationAssemblyGeometry");
          let design: ReturnType<typeof designBuilding>;
          try {
            design = designBuilding(draft, () => 0, constructionGeometry);
            expect(produce).not.toHaveBeenCalled();
          } finally {
            produce.mockRestore();
          }
          expect(design!.diagnostics).toEqual([]);
          expect(design!.prepared.decorations[0].parts).toEqual([]);
          expect(design!.parts.filter((p) => p.publication?.format === "native-attachment/v1")).toHaveLength(1);
          const point = design!.supports.get(
            buildingDesignKey(design!.parts.filter((p) => p.publication?.format === "native-attachment/v1")[0].identity)
          );
          expect(point.type).toBe("point");
          expect(Object.keys(point.attachment.partMounts)).toEqual(["lintel-0", "lintel-1"]);
          expect(() => structuredClone(point)).not.toThrow();
          const publication = await prepareBuildingPublication(design!);

          const actual = publication.prepared.decorations[0];

          expect(actual.parts.map((p) => p.id)).toEqual(
            ["frame", "glass", "lintel-0", "lintel-1"].map((s) => "corner-host/corner-host/corner/" + s)
          );
        }
      });
  it("executes a replacement algorithm for the window and both lintels", async () => {
    const draft = cornerDraft(),
      part = draft.parts.find((p) => p.support.generator === "attachmentMount")!;
    const baseline = await prepareBuildingPublication(designBuilding(draft, () => 0, constructionGeometry));
    const custom = vi.fn((support, params, context) => {
      const shifted = structuredClone(support);
      shifted.attachment.origin[0] += 2;
      for (const frame of Object.values(shifted.attachment.partMounts) as { origin: number[] }[]) frame.origin[0] += 2;
      return mountAttachment(shifted, params, context);
    });
    buildingPlacementAlgorithms.register("test.corner.shift", custom);
    part.algorithm.type = "test.corner.shift";
    const design = designBuilding(draft, () => 0, constructionGeometry);
    const result = await prepareBuildingPublication(design);
    expect(custom).toHaveBeenCalledTimes(1);
    expect(result.prepared.decorations[0].holes).toEqual(baseline.prepared.decorations[0].holes);
    const actual = result.prepared.decorations[0].parts,
      expected = baseline.prepared.decorations[0].parts;
    expect(actual).toHaveLength(4);
    actual.forEach((p, j) =>
      p.positions.forEach((v, i) => expect(v).toBeCloseTo(expected[j].positions[i] + (i % 3 === 0 ? 2 : 0), 12))
    );
  });
  it("rejects invalid fits before scheduling a mount and preserves opening diagnostics", async () => {
    for (const patch of [{ u: 0.1 }, { width: 30 }, { bottom: 5.5 }]) {
      const draft = cornerDraft();
      Object.assign(draft.parts.find((p) => p.support.generator === "attachmentMount")!.support.params.spec, patch);
      const design = designBuilding(draft, () => 0, constructionGeometry);
      expect(design.parts.filter((p) => p.publication?.format === "native-attachment/v1")).toEqual([]);
      expect(design.prepared.decorations[0].parts).toEqual([]);

      expect(design.diagnostics).toHaveLength(1);
    }
  });
});
