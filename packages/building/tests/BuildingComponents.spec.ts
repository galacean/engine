import { buildingPartKey, buildingGroupKey } from "../src/building/runtime/BuildingObjectIdentity";
import { nativeAssets } from "./fixtures/constructionAssets";
import { describe, expect, it } from "vitest";
import { appendDecorationRenderPackage } from "../src/building/runtime/ConstructionDecorationRender";
import type { ConstructionDecorationPart } from "../src/building/runtime/ConstructionDecorations";

function part(id: string, x: number): ConstructionDecorationPart {
  return {
    id: id + "/frame",
    ownerId: "house",
    decorationId: id,
    kind: "window",
    positions: [x, 0, 0, x + 1, 0, 0, x, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    colors: [1, 1, 1, 1, 1, 1, 1, 1, 1],
    emission: [0, 0, 0],
    indices: [0, 1, 2]
  };
}
describe("Batched decoration identities", () => {
  it("keeps two windows and multiple parts in one draw, with correct per-vertex identities", async () => {
    const result = appendDecorationRenderPackage(
      {
        package: { nativeAssets, programs: {}, draws: [] } as any,
        dynamicFiles: [],
        asset: async () => {
          throw Error("unexpected static asset");
        }
      },
      [part("left", 0), part("right", 2), { ...part("left", 0), id: "left/glass" }]
    );
    expect(result.package.draws).toHaveLength(1);
    const draw = result.package.draws[0];
    expect(draw.pickIds).toEqual([buildingPartKey("left"), buildingPartKey("right")]);
    const attribute = draw.attributes.find((a) => a.location === 9)!;
    expect([...new Float32Array(await result.asset(attribute.file))]).toEqual([0, 0, 0, 1, 1, 1, 0, 0, 0]);
    expect(draw.indexCount).toBe(9);
  });
  it("retains the building identity for procedural parts without an editable attachment", () => {
    const value = part("left", 0);
    delete value.decorationId;
    const result = appendDecorationRenderPackage(
      {
        package: { nativeAssets, programs: {}, draws: [] } as any,
        dynamicFiles: [],
        asset: async () => new ArrayBuffer(0)
      },
      [value]
    );
    expect(result.package.draws[0].pickIds).toEqual([buildingGroupKey("house")]);
  });
});

it("retains different geometries in one rigid draw with slot-specific bindings and conservative bounds", () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const poses = new Map([
    [buildingPartKey("left"), identity],
    [buildingPartKey("right"), identity]
  ]);
  const right = part("right", 2);
  right.positions[7] = 3;
  const result = appendDecorationRenderPackage(
    {
      package: { nativeAssets, programs: {}, draws: [] } as any,
      dynamicFiles: [],
      asset: async () => new ArrayBuffer(0)
    },
    [part("left", 0), right],
    poses
  );
  expect(result.package.draws).toHaveLength(1);
  const draw = result.package.draws[0];
  expect(draw.pickIds).toEqual([buildingPartKey("left"), buildingPartKey("right")]);
  expect(draw.rigidBindings!.map((b) => b.max[1])).toEqual([1, 3]);
  expect(draw.rigidBindings![0].min[0]).toBe(-0.03);
  expect(result.package.programs[draw.program].vert.source).toContain("renderer_DecorationMatrices");
  expect(() =>
    appendDecorationRenderPackage(
      {
        package: { nativeAssets, programs: {}, draws: [] } as any,
        dynamicFiles: [],
        asset: async () => new ArrayBuffer(0)
      },
      [part("missing", 0)],
      poses
    )
  ).toThrow("Missing rigid decoration binding");
});
