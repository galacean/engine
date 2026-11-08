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
import { compileCoreBuilding } from "../../src/building/render/CoreBuilding";

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

  it("draws the deck as paving and the parapet as masonry", async () => {
    const p = { id: "f", roof: { height: 0 } };
    const { result, decks, parapets } = house(p);
    const { renderInput: input } = await compileCoreBuilding(result, registry, {
      environment: { ground: flat },
      assets: nativeAssets
    });
    const platform = input.groups.find((g) => g.role === "platform" && g.binding_id === "f-roof")!;
    expect(platform.cells).toHaveLength(units(decks[0]).length);
    const parapet = input.groups.find((g) => g.role === "wall" && g.binding_id === "f-parapet")!;
    expect(parapet.cells).toHaveLength(units(parapets[0]).length);
    // The deck backs the roof; the parapet's merlons are solid and need no backing.
    expect(input.backingParts.map((b) => b.bindingId).sort()).toEqual(["f-roof", "f-wall"]);
  });

  it("paves a round flat roof inside its circle, with a round parapet", () => {
    const p: CoreHouseParameters = {
      id: "r",
      height: 6,
      circle: { center: [1, 2], radius: 3, phase: 0.4 },
      roof: { height: 0 }
    };
    const { result, decks, parapets, walls } = house(p);
    expect(result.diagnostics).toEqual([]);
    expect(decks).toHaveLength(1);
    expect(parapets).toHaveLength(1);
    const outer = 3 + chartOf(walls[0]).nominalOuter;
    const tiles = units(decks[0]);
    expect(tiles.length).toBeGreaterThan(100);
    for (const u of tiles) {
      // Every tile lies inside the circle, corners included.
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          const x = u.frame.origin[0] + (sx * u.size![0] * u.frame.x[0] + sy * u.size![1] * u.frame.y[0]) / 2 - 1,
            z = u.frame.origin[2] + (sx * u.size![0] * u.frame.x[2] + sy * u.size![1] * u.frame.y[2]) / 2 - 2;
          expect(Math.hypot(x, z)).toBeLessThanOrEqual(outer + 1e-6);
        }
    }
    expect(units(parapets[0]).length).toBeGreaterThan(30);
  });
});
