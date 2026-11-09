// Corner windows: a Cottage frame and glass across a wall corner, with two lintels.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { createBuildingRegistry, designBuildingCore, expandUnits, type ResolvedPart } from "../../src/building/core";
import { registerHouseTypes, wallChartSampler, type WallChartParams } from "../../src/building/partTypes/House";
import {
  buildCoreHouse,
  type CoreHouseParameters,
  type CoreWallAttachment
} from "../../src/building/application/CoreEuropean";
import { European } from "../../src/building/application/European";
import {
  coreBuildingDecorations,
  coreBuildingEnvironment,
  coreBuildingLayout
} from "../../src/building/render/CoreBuilding";
import { European as OnlineEuropean } from "../../src/building/parts/architecture/European";
import { designBuilding } from "../../src/building/parts/architecture/BuildingDesign";
import {
  buildingPreviewInput,
  prepareBuildingPublication
} from "../../src/building/parts/architecture/BuildingPublication";
import { profilePreview } from "../../src/building/runtime/ProfilePreview";
import { constructionDecorationType } from "../../src/building/runtime/ConstructionDecorationCatalog";

const registry = registerHouseTypes(createBuildingRegistry());
const flat = () => 0;
const assets = nativeAssets.compilation;
const environment = coreBuildingEnvironment(flat, assets);
const design = (p: CoreHouseParameters) => designBuildingCore(buildCoreHouse(p), registry, { environment });
const at = (rank: 1 | 2 | 3, u: number, extra: Partial<CoreWallAttachment> = {}): CoreWallAttachment => {
  const size = constructionDecorationType(assets.decorations, "window-cottage-corner")!.dimensions.find(
    (d) => d.rank === rank
  )!;
  return {
    id: `c${rank}`,
    kind: "window",
    type: "window-cottage-corner",
    rank,
    u,
    bottom: 1,
    width: size.width,
    height: size.height,
    ...extra
  };
};
const house = (a: CoreWallAttachment[], extra: Partial<CoreHouseParameters> = {}): CoreHouseParameters => ({
  id: "h",
  height: 4,
  rectangle: { center: [0, 0], size: [10, 8], rotation: 0.3 },
  attachments: a,
  ...extra
});
const parts = (r: ReturnType<typeof design>) =>
  coreBuildingDecorations(coreBuildingLayout(r, registry, {}), assets).flatMap((d) => d.parts);
const online = async (p: CoreHouseParameters) => {
  const planned = designBuilding(OnlineEuropean.buildHouses(p as never) as never, flat as never, assets);
  return profilePreview(
    buildingPreviewInput(planned, await prepareBuildingPublication(planned)),
    flat as never,
    {
      assets,
      retainDecorationParts: true
    } as never
  ).decorationParts;
};
const center = (positions: number[]) => {
  const out = [0, 0, 0];
  for (let i = 0; i < positions.length; i++) out[i % 3] += positions[i] / (positions.length / 3);
  return out;
};

const chartOf = (p: ResolvedPart) =>
  (p.original.elements.face as { surface: { params: WallChartParams } }).surface.params;
const openingsOf = (r: ReturnType<typeof design>) =>
  Object.values(r.parts.find((p) => p.type === "window")!.original.elements).flatMap((e) =>
    e.kind === "surface" && e.surface.kind === "wallOpening"
      ? [(e.surface.params as { perimeter: number[] }).perimeter]
      : []
  );

describe("Corner windows against the online path", () => {
  it.each([
    [1, 0.5],
    [2, 0.5],
    [3, 0.5],
    [2, 0]
  ] as [1 | 2 | 3, number][])("rank %i at u = %f: the same meshes at the same place", async (rank, u) => {
    const p = house([at(rank, u)]);
    const result = design(p);
    expect(result.diagnostics).toEqual([]);
    const ours = parts(result),
      theirs = await online(p);
    expect(ours.map((x) => x.id).sort()).toEqual(theirs.map((x) => x.id).sort());
    for (const x of ours) {
      const o = theirs.find((y) => y.id === x.id)!;
      expect(x.positions.length).toBe(o.positions.length);
      const [c, d] = [center(x.positions), center(o.positions)];
      for (let k = 0; k < 3; k++) expect(Math.abs(c[k] - d[k])).toBeLessThan(0.03);
    }
  });

  it("opens both walls at the corner", () => {
    const result = design(house([at(2, 0.5)]));
    const walls = result.parts.filter((p) => p.type === "wall" && p.modifications.some((m) => m.op === "removeArea"));
    expect(walls).toHaveLength(2);
  });

  it.each([
    [0.5, 2],
    [8 / 36, 1],
    [0, 0]
  ] as const)("keeps its corner stones out of its openings at u = %f", (u) => {
    const result = design(house([at(2, u)]));
    const perimeter = result.parts
      .filter((p) => p.type === "wall")
      .reduce((n, p) => n + wallChartSampler(chartOf(p)).length, 0);
    const openings = openingsOf(result);
    const stones = result.parts
      .filter((p) => p.type === "cornerStone")
      .flatMap((p) => expandUnits(p, registry, { environment }));
    expect(stones.length).toBeGreaterThan(0);
    for (const stone of stones) {
      const [u0, u1] = stone.params!.wallU as number[];
      const [lo, hi] = [stone.frame.origin[1] - stone.size![1] / 2, stone.frame.origin[1] + stone.size![1] / 2];
      for (const [a, b, c, d] of openings)
        for (const k of [-perimeter, 0, perimeter])
          expect(u0 < c + k - 1e-6 && a + k + 1e-6 < u1 && lo < d - 1e-6 && b + 1e-6 < hi).toBe(false);
    }
  });

  it("keeps the corner's angle when it is resized", () => {
    const part = (p: CoreHouseParameters) => {
      const r = design(p);
      expect(r.diagnostics).toEqual([]);
      return parts(r).find((x) => x.id.endsWith("/frame"))!;
    };
    const natural = at(2, 0.5);
    const a = part(house([natural]));
    const b = part(house([at(2, 0.5, { width: natural.width * 1.3, height: natural.height })]));
    const extent = (positions: number[], k: number) => {
      const v = positions.filter((_, i) => i % 3 === k);
      return Math.max(...v) - Math.min(...v);
    };
    expect(extent(b.positions, 0) / extent(a.positions, 0)).toBeCloseTo(1.3, 1);
    expect(extent(b.positions, 2) / extent(a.positions, 2)).toBeCloseTo(1.3, 1);
    expect(extent(b.positions, 1) / extent(a.positions, 1)).toBeCloseTo(1, 3);
  });

  it("is an error away from a corner, on a round wall, or above the wall", () => {
    const messages = (p: CoreHouseParameters) => design(p).diagnostics.map((d) => d.message);
    expect(messages(house([at(2, 0.1)])).join()).toContain("needs a corner");
    expect(
      messages(house([at(2, 0.3)], { rectangle: undefined, circle: { center: [0, 0], radius: 4 } })).join()
    ).toContain("needs a corner");
    expect(messages(house([at(2, 0.5, { bottom: 3 })])).join()).toContain("reaches above its walls");
  });

  it("treats a rounded position as the corner it is meant for", () => {
    const exact = design(house([at(2, 8 / 36)]));
    const rounded = design(house([at(2, 0.2222)]));
    expect(rounded.diagnostics).toEqual([]);
    const mount = (r: ReturnType<typeof design>) => {
      const e = r.parts.find((p) => p.type === "window")!.original.elements.mount;
      if (e.kind !== "point") throw Error("no mount");
      return e.frame.origin;
    };
    expect(mount(rounded)).toEqual(mount(exact));
    const stones = (r: ReturnType<typeof design>) =>
      r.parts.filter((p) => p.type === "cornerStone").flatMap((p) => expandUnits(p, registry, { environment })).length;
    expect(stones(rounded)).toBe(stones(exact));
  });

  it("follows an edit of the saved definition, as it follows the generator", () => {
    const edited = (u: number) => {
      const draft = structuredClone(buildCoreHouse(house([at(2, 0.5)]))) as any;
      draft.parts.find((p: any) => p.type === "window").geometry.params.u = u;
      return designBuildingCore(draft, registry, { environment });
    };
    const rows = (r: ReturnType<typeof design>) =>
      r.parts.filter((p) => p.type === "cornerStone").map((p) => expandUnits(p, registry, { environment }).length);
    const generated = (u: number) => design(house([at(2, u)]));
    // A rounded edit means the same corner.
    expect(edited(0.4999).diagnostics).toEqual([]);
    expect(rows(edited(0.4999))).toEqual(rows(generated(0.5)));
    // Moved to another corner, the stones make room there and come back at the old one.
    expect(edited(0).diagnostics).toEqual([]);
    expect(rows(edited(0))).toEqual(rows(generated(0)));
    expect(rows(edited(0))).not.toEqual(rows(generated(0.5)));
  });

  it("is an error more than 1 cm from a corner", () => {
    const messages = design(house([at(2, 8 / 36 + 0.02 / 36)])).diagnostics.map((d) => d.message);
    expect(messages.join()).toContain("needs a corner");
  });

  it("needs wall on both sides of its corner, as far as it reaches", () => {
    const narrow = (side: number) =>
      design(house([at(3, 0.5)], { rectangle: { center: [0, 0], size: [10, side], rotation: 0 } })).diagnostics.map(
        (d) => d.message
      );
    expect(narrow(1).join()).toContain("of wall on both sides");
    expect(narrow(3)).toEqual([]);
  });

  it("comes from the European parameters", () => {
    const a = {
      id: "c",
      kind: "window" as const,
      type: "window-cottage-corner",
      rank: 1 as const,
      u: 0.5,
      bottom: 1,
      width: 1,
      height: 1.6
    };
    const draft = European.buildHouses({ id: "e", attachments: [a] });
    expect(draft.parts.find((p) => p.type === "window")!.geometry!.generator).toBe("houseCornerMount");
  });

  it("leaves what it does not cover of the corner stones, under and beside it", () => {
    let besides = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const result = design(house([at(1, 0.5)], { seed }));
      const [opening] = openingsOf(result);
      const corner = opening[2];
      const near = result.parts
        .filter((p) => p.type === "cornerStone")
        .flatMap((p) => expandUnits(p, registry, { environment }))
        .filter((u) => {
          const [u0, u1] = u.params!.wallU as number[];
          return u0 < corner + 1.5 && u1 > corner - 1.5;
        });
      const height = (u: (typeof near)[number]) => u.frame.origin[1];
      // A whole stone stands under the sill; a wider one leaves a piece beside the window.
      expect(near.some((u) => height(u) < opening[1])).toBe(true);
      const beside = near.filter((u) => height(u) > opening[1] && height(u) < opening[3]);
      besides += beside.length;
      for (const u of beside) {
        const [u0, u1] = u.params!.wallU as number[];
        expect(u0 < corner && u1 > corner).toBe(false);
      }
    }
    expect(besides).toBeGreaterThan(0);
  });
});
