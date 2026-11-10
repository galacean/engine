// Walls of a thicker or thinner unit: what stands on them moves with their face, as online.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { createBuildingRegistry, designBuildingCore, ribbon } from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import { buildCoreHouse, type CoreHouseParameters } from "../../src/building/application/CoreEuropean";
import { European } from "../../src/building/application/European";
import {
  coreBuildingDecorations,
  coreBuildingEnvironment,
  coreBuildingLayout
} from "../../src/building/render/CoreBuilding";
import { baseline } from "./baseline";
import { constructionDecorationType } from "../../src/building/runtime/ConstructionDecorationCatalog";

const assets = nativeAssets.compilation;
const registry = registerHouseTypes(createBuildingRegistry());
const flat = () => 0;
const environment = coreBuildingEnvironment(flat, assets);
const at = (id: string, kind: string, type: string, rank: 1 | 2 | 3, u: number, bottom: number) => {
  const { width, height } = constructionDecorationType(assets.decorations, type)!.dimensions.find(
    (d) => d.rank === rank
  )!;
  return { id, kind, type, rank, u, bottom, width, height } as never;
};
const house = (depth: number, attachments: never[], extra: Partial<CoreHouseParameters> = {}): CoreHouseParameters => ({
  id: "h",
  seed: 7,
  height: 6,
  rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
  footprint: { width: 0.5, height: 0.25, depth },
  attachments,
  ...extra
});
const design = (p: CoreHouseParameters) => designBuildingCore(buildCoreHouse(p), registry, { environment });
const center = (positions: number[]) => {
  const out = [0, 0, 0];
  for (let i = 0; i < positions.length; i++) out[i % 3] += positions[i] / (positions.length / 3);
  return out;
};
/** Where online drew each decoration part, by case and wall depth: its id and mesh center. */
const ONLINE = baseline<{ id: string; center: number[] }[]>("CoreWallDepth");
const holes = (r: ReturnType<typeof design>) =>
  r.parts
    .filter((p) => p.type === "wall")
    .flatMap((w) => w.modifications.flatMap((m) => (m.op === "removeArea" ? [m.rect] : [])));

describe("Walls of other depths", () => {
  it.each([0.05, 0.15, 0.2, 0.3])("keeps a lamp on the face of a wall %f deep", (depth) => {
    expect(
      holes(design(house(depth, [at("l", "wall-lamp", "wall-lantern", 1, 0.1, 1.2)], { roof: { height: 0 } })))
    ).toEqual([]);
  });
  it.each([0.05, 0.2, 0.3])("needs no more rows for a Gothic window on a wall %f deep", (depth) => {
    const rows = holes(design(house(depth, [at("g", "window", "window-gothic", 3, 0.1, 1)], { roof: { height: 0 } })));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(4);
  });
  it.each([
    [
      "window and lamp",
      [at("w", "window", "window-cottage", 2, 0.05, 1), at("l", "wall-lamp", "wall-lantern", 1, 0.11, 1.2)]
    ],
    ["Gothic window with a hat", [at("g", "window", "window-gothic", 2, 0.1, 1)]],
    ["corner window", [at("c", "window", "window-cottage-corner", 2, 0.5, 1)]]
  ] as const)("%s stands where it does online", (name, attachments) => {
    for (const depth of [0.05, 0.2]) {
      const p = house(depth, [...attachments] as never[], { roof: { height: 0 } });
      const result = design(p);
      expect(result.diagnostics).toEqual([]);
      const ours = coreBuildingDecorations(coreBuildingLayout(result, registry, {}), assets).flatMap((d) => d.parts);
      const theirs = ONLINE[`${name} @ ${depth}`];
      expect(ours.map((x) => x.id).sort()).toEqual(theirs.map((x) => x.id).sort());
      for (const x of ours) {
        const o = theirs.find((y) => y.id === x.id)!;
        const [c, d] = [center(x.positions), o.center];
        for (let k = 0; k < 3; k++) expect(Math.abs(c[k] - d[k])).toBeLessThan(0.03);
      }
    }
  });
  it.each(["dormer-gothic-half", "dormer-cottage-half", "dormer-arrow-slit-half"])(
    "lets %s stand at the eave of every wall depth, in no more than four rows",
    (type) => {
      for (const depth of [0.05, 0.1, 0.2, 0.3]) {
        const rank = type === "dormer-arrow-slit-half" ? 3 : 2;
        const { height } = constructionDecorationType(assets.decorations, type)!.dimensions.find(
          (d) => d.rank === rank
        )!;
        const result = design(house(depth, [at("e", "window", type, rank, 0.11, 6 - height * 0.6)]));
        expect(result.diagnostics).toEqual([]);
        expect(holes(result).length).toBeLessThanOrEqual(4);
      }
    }
  );
  it.each([0.05, 0.2, 0.3])("keeps a pitched roof's tiles when the wall's bricks are %f deep", (depth) => {
    const thick = design(house(depth, []));
    expect(thick.diagnostics).toEqual([]);
    const tile = (r: ReturnType<typeof design>) => r.parts.find((p) => p.type === "roof")!.unit!.scale;
    expect(tile(thick)).toEqual(tile(design(house(0.1, []))));
  });
});

describe("Public entry and validation", () => {
  it("plasters a foundation through the European parameters", () => {
    const draft = European.buildHouses([
      {
        id: "a",
        height: 5,
        rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
        foundation: { height: 1, mode: "pillars", plaster: { wear: 0.3, color: 1 } }
      }
    ] as never);
    const result = designBuildingCore(draft as never, registry, { environment });
    expect(result.diagnostics).toEqual([]);
    expect(result.parts.filter((p) => p.type === "plaster")).toHaveLength(1);
  });
  const draft = (element: object, type: string, params: object) =>
    ({
      groups: [{ id: "g", seed: 1 }],
      parts: [
        {
          id: "p",
          group: "g",
          type: "t",
          geometry: { generator: "elements", params: { elements: { a: element } } },
          algorithm: { type, params },
          unit: { source: "b", bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] } }
        }
      ]
    }) as never;
  const line = ribbon({
    points: [
      [0, 0, 0],
      [2, 0, 0]
    ]
  });
  const plane = {
    kind: "surface",
    surface: { kind: "plane", params: { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 0, 1], size: [2, 2] } }
  };
  it("refuses a surface algorithm on a ribbon and a ribbon algorithm on a surface", () => {
    expect(designBuildingCore(draft(line, "surfaceGrid", { cell: [0.5, 0.5] }), registry).diagnostics[0].message).toBe(
      "surfaceGrid lays surface elements; this geometry has none"
    );
    expect(designBuildingCore(draft(plane, "alongCurves", { spacing: 0.5 }), registry).diagnostics[0].message).toBe(
      "alongCurves lays ribbon elements; this geometry has none"
    );
  });
});
