vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { createBuildingRegistry, designBuildingCore, expandUnits, type ResolvedPart } from "../../src/building/core";
import { registerHouseTypes, type WallChartParams } from "../../src/building/partTypes/House";
import { buildCoreHouse, type CoreHouseParameters } from "../../src/building/application/CoreEuropean";
import { coreHouseRenderInput } from "../../src/building/render/CoreHouseRender";

const flat = () => 0;
const registry = registerHouseTypes(createBuildingRegistry());
function house(p: CoreHouseParameters) {
  const result = designBuildingCore(buildCoreHouse(p), registry, { environment: { ground: flat } });
  const of = (type: string) => result.parts.filter((x) => x.type === type);
  return { result, decks: of("roofDeck"), parapets: of("parapet"), walls: of("wall") };
}
const units = (part: ResolvedPart) => expandUnits(part, registry, { environment: { ground: flat } });
const chartOf = (part: ResolvedPart) =>
  (part.original.elements.face as { surface: { params: WallChartParams } }).surface.params;

describe("Flat roofs", () => {
  it("lays a deck at the wall top and a parapet with battlements around it", () => {
    const { result, decks, parapets, walls } = house({ id: "f", roof: { height: 0 } });
    expect(result.diagnostics).toEqual([]);
    expect(decks).toHaveLength(1);
    expect(parapets).toHaveLength(1);
    const wallTop = Math.max(...chartOf(walls[0]).top);
    const tiles = units(decks[0]);
    expect(tiles.length).toBeGreaterThan(200);
    for (const u of tiles) {
      expect(u.frame.origin[1]).toBeCloseTo(wallTop, 9);
      expect(u.frame.z.map((v) => v + 0)).toEqual([0, 1, 0]);
    }
    const chart = chartOf(parapets[0]);
    expect(chart.minGround).toBeCloseTo(wallTop, 9);
    const bricks = units(parapets[0]);
    expect(bricks.length).toBeGreaterThan(50);
    // Bricks stay between the wall top and the roof base, and some reach the top: the merlons.
    let merlons = 0;
    for (const u of bricks) {
      const top = u.frame.origin[1] + u.size![1] / 2 + Math.max(0, ...(u.params!.deformation as number[]).slice(2));
      expect(top).toBeLessThanOrEqual(chart.topY + 1e-9);
      if (top > chart.topY - 0.05) merlons++;
    }
    expect(merlons).toBeGreaterThan(8);
  });

  it("leaves the crenels open", () => {
    const { parapets } = house({ id: "f", roof: { height: 0 } });
    const data = parapets[0].layout!.data as { crenels: number[][] };
    expect(data.crenels.length).toBeGreaterThan(8);
    for (const u of units(parapets[0])) {
      const [c] = u.params!.anchor_uv as number[];
      const w = u.size![0] / 2;
      const top = u.frame.origin[1] + u.size![1] / 2;
      for (const [u0, v0, u1] of data.crenels)
        if (c - w < u1 - 1e-6 && u0 + 1e-6 < c + w) expect(top).toBeLessThanOrEqual(v0 + 0.05);
    }
  });

  it("has no parapet without a rim", () => {
    const { result, decks, parapets } = house({ id: "f", roof: { height: 0, flat_rim: 1 } });
    expect(result.diagnostics).toEqual([]);
    expect(decks).toHaveLength(1);
    expect(parapets).toHaveLength(0);
  });

  it("draws the deck in the flat roof group and the parapet with the wall bricks", async () => {
    const p = { id: "f", roof: { height: 0 } };
    const { result, decks, parapets } = house(p);
    const input = await coreHouseRenderInput(result, registry, p, flat, nativeAssets);
    const platform = input.groups.find((g) => g.role === "platform" && g.binding_id === "f-roof/placement")!;
    expect(platform.cells).toHaveLength(units(decks[0]).length);
    expect(input.groups.some((g) => g.role === "platform-rim")).toBe(false);
    const wall = input.groups.find((g) => g.role === "wall" && g.binding_id === "f-wall/placement")!;
    expect(wall.cells.filter((c) => c.id.includes("/parapet-"))).toHaveLength(units(parapets[0]).length);
  });
});
