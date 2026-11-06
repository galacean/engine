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
import { implementBuilding } from "../src/building/parts/architecture/BuildingImplementation";
import { prepareBuildingPublication } from "../src/building/parts/architecture/BuildingPublication";
import {
  buildingPlacementAlgorithms,
  executeBuildingPlacement
} from "../src/building/parts/BuildingAlgorithms";
import { BuildingPath } from "../src/building/parts/BuildingLayout";
import { roofMerlons } from "../src/building/parts/algorithms/RoofMerlons";
import { wallStitches } from "../src/building/parts/algorithms/WallStitches";
import { placeProfileContacts } from "../src/building/runtime/ProfileContacts";
import { constructionGeometry } from "./fixtures/constructionGeometry";

function joined() {
  return designBuilding(
    European.buildHouses([
      { id: "one", seed: 17, height: 5 },
      { id: "two", seed: 19, height: 4, rectangle: { center: [5, 0], size: [8, 6], rotation: Math.PI / 2 } },
      {
        id: "wood",
        seed: 23,
        height: 5,
        rectangle: { center: [0, 4], size: [6, 8], rotation: 0 },
        wall: { unit: "wooden_plank", algorithm: { type: "horizontal_rows" } }
      }
    ]),
    () => 0,
    constructionGeometry
  );
}

describe("derived junctions use registered placement algorithms", () => {
  it("preserves global brick/beam packing order and reuses early placements for detail", async () => {
    const design = joined();
    const expected = placeProfileContacts(design.prepared, design.contacts);
    expect(expected.connections.bricks.length).toBeGreaterThan(0);
    expect(expected.connections.beams.length).toBeGreaterThan(0);
    expect(design.parts.filter((p) => p.publication?.format === "wall-stitch/v1").length).toBeGreaterThan(2);
    const resolve = vi.spyOn(buildingPlacementAlgorithms, "resolve");
    try {
      const publication = await prepareBuildingPublication(design);
      expect(resolve.mock.calls.map(([name]) => name)).toEqual(
        design.parts.filter((p) => p.publication?.format === "wall-stitch/v1").map((p) => p.algorithm.type)
      );
      expect(publication.prepared.connections).toEqual(expected.connections);
      expect(publication.prepared.merlons).toEqual(expected.merlons);
      const seamCalls = resolve.mock.calls.length;
      const result = await implementBuilding(design, { publication });
      expect(resolve.mock.calls.filter(([name]) => name === "wallStitches")).toHaveLength(seamCalls);
      expect(result.construction.connections).toBe(publication.prepared.connections);
      expect(result.instanceParts).toHaveLength(0);
    } finally {
      resolve.mockRestore();
    }
  });

  it("consumes the resolved Path endpoints and a custom async algorithm, without name matching", async () => {
    const design = joined();
    const part = design.parts
      .filter((p) => p.publication?.format === "wall-stitch/v1")
      .find((p) => p.unit === "brick")!;
    const original = await prepareBuildingPublication(design);
    const points = design.supports.get(buildingDesignKey(part.identity))!.path.controlPoints;
    const next = new BuildingPath([
      [points[0][0] + 2, points[0][1] + 0.3, points[0][2]],
      [points[1][0] + 2, points[1][1], points[1][2]]
    ]);
    design.supports.set(buildingDesignKey(part.identity), { type: "path", path: next });
    const custom = vi.fn(async (support, params, context) => {
      await Promise.resolve();
      const output = wallStitches(support, params, context);
      return {
        ...output,
        records: output.records.map((p) => ({ ...p, scale: [p.scale[0] * 0.8, ...p.scale.slice(1)] }))
      };
    });
    buildingPlacementAlgorithms.register("test.junction.narrow", custom);
    part.algorithm.type = "test.junction.narrow";
    const publication = await prepareBuildingPublication(design);
    expect(custom).toHaveBeenCalledTimes(1);
    const index = design.parts.filter((p) => p.publication?.format === "wall-stitch/v1").indexOf(part);
    const changed = publication.prepared.connections.placements.filter((p) => p.sourceCandidate === index);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((p) => p.position[0] === points[0][0] + 2)).toBe(true);
    expect(publication.prepared.connections.bricks).not.toEqual(original.prepared.connections.bricks);
    expect(publication.prepared.contactHoles).toEqual(original.prepared.contactHoles);
  });

  it("cancels an awaited seam placement before publication", async () => {
    const design = joined();
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const abort = new AbortController();
    buildingPlacementAlgorithms.register("test.junction.pending", async (support, params, context) => {
      expect(context.signal).toBe(abort.signal);
      entered();
      await pending;
      return wallStitches(support, params, context);
    });
    design.parts.filter((p) => p.publication?.format === "wall-stitch/v1")[0].algorithm.type = "test.junction.pending";
    const result = prepareBuildingPublication(design, { signal: abort.signal });
    await started;
    abort.abort();
    release();
    await expect(result).rejects.toThrow();
  });

  it("rejects incompatible paths, output formats and Unit substitutions", async () => {
    const design = joined();
    const part = design.parts.filter((p) => p.publication?.format === "wall-stitch/v1")[0];
    await expect(
      executeBuildingPlacement(
        "wallStitches",
        {
          type: "path",
          path: new BuildingPath([
            [0, 0, 0],
            [1, 1, 0]
          ])
        },
        part.params
      )
    ).rejects.toThrow("vertical Path");
    buildingPlacementAlgorithms.register("test.junction.wrong-output", () => []);
    part.algorithm.type = "test.junction.wrong-output";
    await expect(prepareBuildingPublication(design)).rejects.toThrow("wall-stitch/v1");
    part.algorithm.type = "wallStitches";
    part.unit = "roof_tile";
    await expect(prepareBuildingPublication(design)).rejects.toThrow("does not match its Unit");
  });
});

function roofJoined(wood = false) {
  return designBuilding(
    European.buildHouses([
      {
        id: "flat",
        seed: 17,
        height: 5,
        rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
        roof: { height: 0 },
        ...(wood ? { wall: { unit: "wooden_plank" as const, algorithm: { type: "horizontal_rows" } } } : {})
      },
      {
        id: "pitched",
        seed: 19,
        height: 3,
        rectangle: { center: [4, 0], size: [8, 6], rotation: Math.PI / 2 },
        roof: { height: 0.7 }
      }
    ]),
    () => 0,
    constructionGeometry
  );
}

describe("roof junction Path placement", () => {
  it.each([false, true])("preserves complete native courses and packed buffers (wood=%s)", async (wood) => {
    const design = roofJoined(wood);
    const expected = placeProfileContacts(design.prepared, design.contacts);
    expect(design.parts.filter((p) => p.publication?.format === "roof-merlon-course/v1").length).toBeGreaterThan(0);
    expect(wood ? expected.merlons.beams.length : expected.merlons.bricks.length).toBeGreaterThan(0);
    const publication = await prepareBuildingPublication(design);
    expect(publication.prepared.merlons).toEqual(expected.merlons);
    for (const part of design.parts.filter((p) => p.publication?.format === "roof-merlon-course/v1")) {
      expect(design.parts).toContain(part);
      expect(publication.placedParts.has(buildingDesignKey(part.identity))).toBe(true);
    }
    const resolve = vi.spyOn(buildingPlacementAlgorithms, "resolve");
    try {
      await implementBuilding(design, { publication });
      expect(resolve.mock.calls.some(([name]) => name === "roofMerlons")).toBe(false);
    } finally {
      resolve.mockRestore();
    }
  });

  it("uses edited path geometry and a registered asynchronous replacement", async () => {
    const design = roofJoined();
    const part = design.parts.filter((p) => p.publication?.format === "roof-merlon-course/v1")[0];
    const old = await prepareBuildingPublication(design);
    const points = design.supports.get(buildingDesignKey(part.identity))!.path.controlPoints;
    design.supports.set(buildingDesignKey(part.identity), {
      type: "path",
      path: new BuildingPath(points.map(([x, y, z]: number[]) => [x + 2, y + 1, z]))
    });
    const algorithm = vi.fn(async (support, params, context) => roofMerlons(support, params, context));
    buildingPlacementAlgorithms.register("test.roof-junction.custom", algorithm);
    part.algorithm.type = "test.roof-junction.custom";
    const next = await prepareBuildingPublication(design);
    expect(algorithm).toHaveBeenCalledTimes(1);
    expect(next.prepared.merlons.groups[0].placements.length).toBe(old.prepared.merlons.groups[0].placements.length);
    next.prepared.merlons.groups[0].placements.forEach((p, i) => {
      expect(p.position[0]).toBeCloseTo(old.prepared.merlons.groups[0].placements[i].position[0] + 2, 5);
      expect(p.position[1]).toBeCloseTo(old.prepared.merlons.groups[0].placements[i].position[1] + 1, 5);
    });
    expect(next.prepared.merlons.bricks).not.toEqual(old.prepared.merlons.bricks);
  });
});
