vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { createBuildingRegistry, designBuildingCore, expandUnits, type ResolvedPart } from "../../src/building/core";
import { registerHouseTypes, type WallChartParams } from "../../src/building/partTypes/House";
import { buildCoreHouse, buildCoreHouses, type CoreHouseParameters } from "../../src/building/application/CoreEuropean";
import {
  compileCoreBuilding,
  coreBuildingEnvironment,
  coreBuildingGrounding,
  prepareCoreBuilding
} from "../../src/building/render/CoreBuilding";
import { buildBuildingRenderPackage } from "../../src/building/runtime/BuildingRenderPackage";
import { buildingGlobals } from "../../src/building/runtime/BuildingGlobals";
import { European } from "../../src/building/application/European";
import { constructionDecorationRecipe } from "../../src/building/runtime/ConstructionDecorationRecipe";

const flat = () => 0;
const coreEnvironment = coreBuildingEnvironment(flat, nativeAssets.compilation);
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
    const { result, decks, parapets, walls } = house({ id: "f", roof: { height: 0 }, roofUnit: "roof_tile" });
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

  it("lays every planned stone of a short parapet", () => {
    for (const size of [
      [1.6, 1.6],
      [2.4, 2.4]
    ] as [number, number][])
      for (let seed = 1; seed <= 40; seed++) {
        const { parapets } = house({
          id: "s",
          seed,
          rectangle: { center: [0, 0], size, rotation: 0 },
          roof: { height: 0 }
        });
        expect(units(parapets[0])).toHaveLength((parapets[0].layout!.data as { stones: unknown[] }).stones.length);
      }
  });

  it("builds the default stone deck into draws and grounding", async () => {
    const p: CoreHouseParameters = {
      id: "s",
      rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
      roof: { height: 0 }
    };
    const result = designBuildingCore(buildCoreHouse(p), registry, { environment: coreEnvironment });
    const prepared = prepareCoreBuilding(result, registry, {
      environment: coreEnvironment,
      assets: nativeAssets.compilation
    });
    const ground = { grounding: { originY: 0, renderPosition: [0, 0, 0] as [number, number, number] }, height: flat };
    expect(coreBuildingGrounding(prepared.layout, prepared.preview, ground).supports).toHaveLength(1);
    const { renderInput: input } = await compileCoreBuilding(result, registry, {
      environment: { ground: flat },
      assets: nativeAssets
    });
    const built = buildBuildingRenderPackage(
      input,
      nativeAssets,
      buildingGlobals(input.paletteSlots, nativeAssets.frame),
      true
    );
    expect(built.package.draws.filter((d: { family?: string }) => d.family === "stone-floor")).toHaveLength(1);
  });

  it("leaves out a merlon that another house cuts", () => {
    const stones = designBuildingCore(
      buildCoreHouses([
        { id: "a", height: 4, rectangle: { center: [-1.5, 0], size: [7, 5], rotation: 0 }, roof: { height: 0 } },
        { id: "b", height: 4.5, rectangle: { center: [2.5, 1.5], size: [5, 6], rotation: 0.5 }, roof: { height: 0 } }
      ]),
      registry,
      { environment: { ground: flat } }
    ).parts.find((p) => p.key.includes("a-parapet"))!;
    const removed = stones.modifications.flatMap((m) => (m.op === "removeArea" ? [m.rect] : []));
    expect(removed.length).toBeGreaterThan(0);
    for (const u of units(stones).filter((x) => !x.key.startsWith("foot"))) {
      const [c] = u.params!.anchor_uv as number[];
      const w = u.size![0] / 2;
      for (const [a, , b] of removed) expect(c + w <= a + 1e-6 || c - w >= b - 1e-6).toBe(true);
    }
  });

  it("stands one stone on each corner of a parapet, the slots between them even", () => {
    const { parapets } = house({ id: "f", roof: { height: 0 }, roofUnit: "roof_tile" });
    const data = parapets[0].layout!.data as { crenels: number[][]; runs: { u: number; l: number }[] };
    expect(data.runs.length).toBe(4);
    for (const run of data.runs) {
      const inRun = data.crenels.filter((c) => c[0] >= run.u - 1e-6 && c[2] <= run.u + run.l + 1e-6);
      expect(inRun.length).toBeGreaterThan(0);
      expect(Math.min(...inRun.map((c) => c[0]))).toBeGreaterThan(run.u + 0.1);
      expect(Math.max(...inRun.map((c) => c[2]))).toBeLessThan(run.u + run.l - 0.1);
    }
    // A round parapet is a ring, with no ends to finish: it starts on a crenel.
    const round = house({ id: "r", circle: { center: [0, 0], radius: 3, phase: 0 }, roof: { height: 0 } });
    const ring = round.parapets[0].layout!.data as { crenels: number[][]; runs: unknown[] };
    expect(ring.runs.length).toBe(1);
    expect(ring.crenels[0][0]).toBeCloseTo(0, 6);
  });

  it("lays one big stone per merlon, on a course of long stones", () => {
    const { parapets } = house({ id: "f", roof: { height: 0 }, roofUnit: "roof_tile" });
    const data = parapets[0].layout!.data as { crenels: number[][]; stones: { key: string }[] };
    const laid = units(parapets[0]);
    const merlons = laid.filter((u) => u.key.startsWith("merlon")),
      corners = laid.filter((u) => u.key.startsWith("corner")),
      foot = laid.filter((u) => u.key.startsWith("foot"));
    // Each side starts and ends on a crenel, between the stones on its corners.
    expect(corners).toHaveLength(4);
    expect(merlons.length).toBe(data.crenels.length - 4);
    for (const u of merlons) expect(u.size![0]).toBeGreaterThan(0.5);
    // Each stone reads its colour at one place along the wall.
    for (const u of laid) {
      const [a, b] = u.params!.wallU as number[];
      expect(a).toBe(b);
    }
    expect(foot.reduce((n, u) => n + u.size![0], 0) / foot.length).toBeGreaterThan(0.55);
  });

  it("draws each big stone of a parapet in one colour", () => {
    const { parapets } = house({ id: "f", roof: { height: 0 } });
    for (const u of units(parapets[0])) expect((u.params!.flags as number) & 1024).toBe(1024);
    // Every brick shader honours the flag: without it the stone shows the colour map's bands.
    const shaders = resolve(__dirname, "../../src/building/assets/native/Shaders");
    for (const name of ["brick", "brick_roof", "sdf-brick", "sdf-brick_clip", "sdf-brick_roof", "sdf-brick_roof_clip"])
      expect(readFileSync(resolve(shaders, `${name}.shaderc`), "utf8")).toContain("& 1024) != 0) ? 0.0 :");
  });

  it("leaves the crenels open", () => {
    const { parapets } = house({ id: "f", roof: { height: 0 }, roofUnit: "roof_tile" });
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

  it("stops the paving inside the wall behind a parapet, and covers the wall without one", () => {
    const reach = (rim: number) => {
      const { decks } = house({ id: "a", roof: { height: 0, flat_rim: rim }, roofUnit: "roof_tile" });
      const deck = (decks[0].original.elements.deck as { surface: { params: { size: number[]; unpaved?: number } } })
        .surface.params;
      const outer = Math.max(
        ...units(decks[0]).map((u) => Math.abs((u.params!.uv as number[])[0] - deck.size[0] / 2) + u.size![0] / 2)
      );
      return deck.size[0] / 2 - outer;
    };
    expect(reach(0)).toBeGreaterThan(0.1);
    expect(reach(1)).toBeCloseTo(0, 5);
  });

  describe("stone paving", () => {
    const deckOf = (p: CoreHouseParameters) => house(p).decks[0];
    it("is the default of a masonry house, one continuous surface", () => {
      const deck = deckOf({ id: "s", roof: { height: 0 } });
      expect(deck.unit?.source).toBe("stone_floor");
      expect(units(deck)).toHaveLength(1);
    });
    it("gives way to a chosen unit, and to timber walls", () => {
      expect(deckOf({ id: "s", roof: { height: 0 }, roofUnit: "roof_tile" }).unit?.source).toBe("roof_tile");
      expect(deckOf({ id: "s", roof: { height: 0 }, walls: "timber" }).unit?.source).toBe("roof_tile");
    });
    it("comes from brick on a flat roof, unless the brick has its own rule", () => {
      const of = (algorithm?: { type: string }) => {
        return European.buildHouses({
          id: "b",
          roof: { height: 0 },
          roofStyle: { unit: "brick", algorithm }
        } as never);
      };
      const unitOf = (d: unknown) =>
        (JSON.stringify(d).includes('"source":"stone_floor"') ? "stone" : "rows") as "stone" | "rows";
      expect(unitOf(of())).toBe("stone");
      expect(unitOf(of({ type: "staggered_rows" }))).toBe("rows");
      // On a timber house too: the author chose brick, and it must not turn into tiles.
      const timber = European.buildHouses({
        id: "b",
        wallStructure: "timber",
        wall: { unit: "wooden_plank", algorithm: { type: "horizontal_rows" } },
        roof: { height: 0 },
        roofStyle: { unit: "brick" }
      } as never);
      expect(unitOf(timber)).toBe("stone");
    });
    it("is drawn as a stone floor surface, only inside the wall's center line and around a hatch", async () => {
      const preview = async (p: CoreHouseParameters) =>
        prepareCoreBuilding(
          designBuildingCore(buildCoreHouse(p), registry, { environment: coreEnvironment }),
          registry,
          {
            environment: coreEnvironment,
            assets: nativeAssets.compilation
          }
        ).preview.parts.find((x) => x.stonePaving)!;
      const base: CoreHouseParameters = {
        id: "s",
        rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
        roof: { height: 0 }
      };
      const plain = await preview(base);
      expect(plain.material).toBe("brick");
      const area = (part: typeof plain) => {
        let n = 0;
        for (let i = 0; i < part.indices.length; i += 3) {
          const [a, b, c] = [0, 1, 2].map((k) => part.uvs[part.indices[i + k]]);
          n += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
        }
        return n;
      };
      expect(area(plain)).toBeCloseTo(48, 3);
      const hatch = constructionDecorationRecipe(
        nativeAssets.compilation.decorations,
        "hatch-cottage",
        1
      )!.installationSize;
      const withHatch = await preview({
        ...base,
        roofAttachments: [
          {
            id: "h",
            type: "hatch-cottage",
            rank: 1,
            uv: [0.4, 0.5],
            bottom: 0,
            width: hatch[0],
            height: hatch[1]
          }
        ]
      });
      expect(area(withHatch)).toBeLessThan(area(plain) - 0.2);
    });
  });

  describe("two flat roofs that meet", () => {
    const cuts = (height: number) => {
      const result = designBuildingCore(
        buildCoreHouses([
          { id: "a", height: 4, rectangle: { center: [-1.5, 0], size: [7, 5], rotation: 0 }, roof: { height: 0 } },
          { id: "b", height, rectangle: { center: [2.5, 1.5], size: [5, 6], rotation: 0.5 }, roof: { height: 0 } }
        ]),
        registry,
        { environment: { ground: flat } }
      );
      expect(result.diagnostics).toEqual([]);
      return result.parts
        .filter((p) => p.type === "parapet")
        .map((p) => p.modifications.filter((m) => m.op === "removeArea").length);
    };
    it("both give way when level", () => {
      const [a, b] = cuts(4);
      expect(a).toBeGreaterThan(0);
      expect(b).toBeGreaterThan(0);
    });
    it("only the lower gives way when one stands higher", () => {
      const [a, b] = cuts(4.5);
      expect(a).toBeGreaterThan(0);
      expect(b).toBe(0);
    });
  });

  it("has no parapet without a rim", () => {
    const { result, decks, parapets } = house({ id: "f", roof: { height: 0, flat_rim: 1 } });
    expect(result.diagnostics).toEqual([]);
    expect(decks).toHaveLength(1);
    expect(parapets).toHaveLength(0);
  });

  it("draws the deck as paving and the parapet as masonry", async () => {
    const p = { id: "f", roof: { height: 0 }, roofUnit: "roof_tile" };
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
      roof: { height: 0 },
      roofUnit: "roof_tile"
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
