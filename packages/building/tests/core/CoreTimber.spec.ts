// Timber walls: horizontal boards on a line 0.125 m out from the wall's centre line, in rows
// fitted between the openings, cut at the roof joint by the renderer.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { createBuildingRegistry, designBuildingCore, expandUnits, type ResolvedPart } from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import { buildCoreHouses, type CoreHouseParameters } from "../../src/building/application/CoreEuropean";
import { European } from "../../src/building/application/European";
import {
  compileCoreBuilding,
  coreBuildingEnvironment,
  coreBuildingLayout,
  coreBuildingView,
  prepareCoreBuilding
} from "../../src/building/render/CoreBuilding";
import { European as OnlineEuropean } from "../../src/building/parts/architecture/European";
import { designBuilding } from "../../src/building/parts/architecture/BuildingDesign";
import { implementBuilding } from "../../src/building/parts/architecture/BuildingImplementation";

const registry = registerHouseTypes(createBuildingRegistry());
const flat = () => 0;
const environment = coreBuildingEnvironment(flat, nativeAssets.compilation);
const design = (...houses: CoreHouseParameters[]) =>
  designBuildingCore(buildCoreHouses(houses), registry, { environment });
const lay = (part: ResolvedPart) => expandUnits(part, registry, { environment });
const rectangle = { center: [0, 0] as [number, number], size: [8, 6] as [number, number], rotation: 0 };
const house: CoreHouseParameters = { id: "h", height: 4, walls: "timber", rectangle };
const walls = (result: ReturnType<typeof design>) => result.parts.filter((p) => p.type === "wall");
const boards = (result: ReturnType<typeof design>) => walls(result).flatMap(lay);
/** The boards online draws for a house: one 80-byte record each for ordinary boards. */
async function onlineBoards(p: object) {
  const assets = {
    ...nativeAssets,
    windowCuts: { texture: "x", layers: [{ layer: 0, bounds: { min: [0, 0], max: [1, 1] } }] }
  };
  const { renderInput } = await implementBuilding(
    designBuilding(
      OnlineEuropean.buildHouses({
        ...p,
        wallStructure: "timber",
        wall: { unit: "wooden_plank", algorithm: { type: "horizontal_rows" } }
      } as never) as never,
      flat as never,
      assets as never
    )
  );
  const out: { center: number[]; length: number }[] = [];
  for (const g of renderInput.groups as { woodDraw?: { instances: Uint8Array } }[]) {
    if (!g.woodDraw || g.woodDraw.instances.length % 80) continue;
    const v = new DataView(
      g.woodDraw.instances.buffer,
      g.woodDraw.instances.byteOffset,
      g.woodDraw.instances.byteLength
    );
    for (let i = 0; i < g.woodDraw.instances.length / 80; i++) {
      const f = (k: number) => v.getFloat32(i * 80 + k * 4, true);
      out.push({
        center: [f(9) + f(3) / 2, f(10) + f(4) / 2, f(11) + f(5) / 2],
        length: Math.hypot(f(3), f(4), f(5))
      });
    }
  }
  return out;
}

describe("Timber walls", () => {
  it("lays boards along each side, 0.125 m out, crossing at the corners", () => {
    const result = design(house);
    expect(result.diagnostics).toEqual([]);
    expect(walls(result)).toHaveLength(1);
    for (const u of boards(result)) {
      // The board runs along a side; its normal is across it, its height up.
      expect(u.frame.z).toEqual([0, 1, 0]);
      const onX = Math.abs(u.frame.y[0]) > 0.5;
      const [x, , z] = u.frame.origin;
      if (onX) expect(Math.abs(z)).toBeCloseTo(3.125, 5);
      else expect(Math.abs(x)).toBeCloseTo(4.125, 5);
      // Within its side, whose length grows by the offset at each corner.
      const end = onX ? Math.abs(x) + u.size![1] / 2 : Math.abs(z) + u.size![1] / 2;
      expect(end).toBeLessThanOrEqual((onX ? 4.125 : 3.125) + 1e-6);
      expect(u.size![0]).toBeGreaterThanOrEqual(0.29 - 1e-6);
      expect(u.size![0]).toBeLessThanOrEqual(0.35 + 1e-6);
      expect(u.size![1]).toBeLessThanOrEqual(5 + 1e-6);
    }
  });

  it("stands on online's board line, with rows and board lengths like online's", async () => {
    const p = { id: "h", height: 4, rectangle, roof: {} };
    const theirs = await onlineBoards(p),
      ours = boards(design(house));
    const sideX = (b: { center: number[] }) => Math.abs(Math.abs(b.center[0]) - 4.125) < 1e-3;
    expect(theirs.filter(sideX).length).toBeGreaterThan(5);
    // Their rows on one side, and ours.
    const rows = (ys: number[]) => [...new Set(ys.map((y) => Math.round(y * 10) / 10))].sort((a, b) => a - b);
    const theirRows = rows(theirs.filter(sideX).map((b) => b.center[1]));
    const ourRows = rows(ours.filter((u) => Math.abs(u.frame.y[2]) > 0.5).map((u) => u.frame.origin[1]));
    expect(Math.abs(ourRows.length - theirRows.length)).toBeLessThanOrEqual(1);
    const mean = (v: number[]) => v.reduce((n, x) => n + x, 0) / v.length;
    const ratio = mean(ours.map((u) => u.size![1])) / mean(theirs.map((b) => b.length));
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(1.25);
    // Boards cover each side, up to the joints between them.
    const side = ours.filter((u) => Math.abs(u.frame.y[2]) > 0.5 && u.frame.origin[0] < 0);
    const firstRow = Math.min(...side.map((u) => u.frame.origin[1]));
    const row = side.filter((u) => Math.abs(u.frame.origin[1] - firstRow) < 1e-6);
    expect(row.reduce((n, u) => n + u.size![1], 0)).toBeGreaterThan(6.25 - row.length * 0.05 - 1e-6);
  });

  it("fits rows around an opening and lays no board across it", () => {
    const result = design({
      ...house,
      attachments: [{ id: "w", kind: "window", u: 0.3, bottom: 1, width: 1.2, height: 1.4 }]
    });
    expect(result.diagnostics).toEqual([]);
    const wall = walls(result)[0];
    const holes = wall.modifications.flatMap((m) => (m.op === "removeArea" ? [m.rect] : []));
    expect(holes).toHaveLength(1);
    const hole = holes[0];
    for (const u of lay(wall)) {
      const [a, b] = u.params!.wallU as number[],
        [y0, y1] = u.params!.wallV as number[];
      expect(a < hole[2] - 0.001 && hole[0] + 0.001 < b && y0 < hole[3] - 0.001 && hole[1] + 0.001 < y1).toBe(false);
    }
  });

  it("stops at the roof: no board starts above it, none reaches past its highest point", () => {
    const result = design({ ...house, roof: { ridge_length: 1 } });
    const units = boards(result);
    const top = Math.max(...units.map((u) => (u.params!.wallV as number[])[1]));
    // The gable reaches above the eaves; the eave sides stop at the wall top.
    expect(top).toBeGreaterThan(5);
    for (const u of units.filter((v) => Math.abs(v.frame.y[0]) > 0.5))
      expect((u.params!.wallV as number[])[1]).toBeLessThan(top);
  });

  it("makes one board per facet on a round wall", () => {
    const result = design({ ...house, rectangle: undefined, circle: { center: [0, 0], radius: 3, phase: 0 } });
    expect(result.diagnostics).toEqual([]);
    for (const u of boards(result)) {
      expect(u.size![1]).toBeLessThan(0.6);
      expect(Math.hypot(u.frame.origin[0], u.frame.origin[2])).toBeGreaterThan(3.1);
    }
  });

  it("has seam stones only with a masonry neighbour, in that house", () => {
    const cross = { center: [4.2, 0] as [number, number], size: [4, 4] as [number, number], rotation: 0.4 };
    const seams = (r: ReturnType<typeof design>) => r.parts.filter((p) => p.type === "wallSeam");
    expect(seams(design(house, { ...house, id: "n", rectangle: cross }))).toEqual([]);
    const mixed = seams(design(house, { id: "n", height: 4, rectangle: cross }));
    expect(mixed.length).toBeGreaterThan(0);
    for (const seam of mixed) expect(seam.group).toBe("n");
  });

  it("is drawn as planks in the wall's draw, cut at the roof joint", async () => {
    const result = design({ ...house, roof: { ridge_length: 1 } });
    const { renderInput } = await compileCoreBuilding(result, registry, {
      environment: { ground: flat },
      assets: nativeAssets.compilation
    });
    const group = renderInput.groups.find((g) => g.role === "wall")!;
    expect(group.wallRoofJoint).toBeDefined();
    expect(group.cells.length).toBe(boards(result).length);
    const records = group.units.wooden_plank;
    const v = new DataView(records.buffer, records.byteOffset, records.byteLength);
    for (let i = 0; i < group.cells.length; i++) expect(v.getUint32(i * 80 + 60, true) & 224).toBe(224);
    expect(renderInput.placementDocument.bindings.find((b) => (b as { id: string }).id === "h-wall")).toMatchObject({
      unit_id: "wooden_plank"
    });
  });

  it("gives a Gothic window the full surround in the wood's colors", () => {
    const stones = (walls: CoreHouseParameters["walls"]) =>
      coreBuildingView(
        coreBuildingLayout(
          design({
            ...house,
            walls,
            attachments: [
              { id: "w", kind: "window", type: "window-gothic", rank: 2, u: 0.1, bottom: 1, width: 1.5, height: 2 }
            ]
          }),
          registry,
          { environment: { ground: flat } }
        ),
        { assets: nativeAssets.compilation }
      ).stones;
    const [timber] = stones("timber"),
      [masonry] = stones("masonry");
    expect(timber.template).toBe("window_gothic_2x1_hat_full");
    expect(timber.instance.flags).toBe(7);
    expect(masonry.template).toBe("window_gothic_2x1_hat");
    expect(masonry.instance.flags).toBe(0);
  });

  it("comes from the European parameters", () => {
    const wallOf = (p: object) => European.buildHouses({ id: "e", ...p }).parts.find((q) => q.type === "wall")!;
    const shared = (p: object) => European.buildHouses({ id: "e", ...p }).groups[0].shared as Record<string, any>;
    expect(shared({ wallStructure: "timber" }).courses.type).toBe("boardCourses");
    expect(shared({ wall: { unit: "wooden_plank", algorithm: { type: "horizontal_rows" } } }).courses.type).toBe(
      "boardCourses"
    );
    const grid = shared({ wall: { unit: "wooden_plank", algorithm: { type: "parallel_rows" } } });
    expect(grid.courses).toMatchObject({ type: "gridCourses", params: { rule: "parallel_rows" } });
    expect(grid.brick.source).toBe("wooden_plank");
    expect(() => wallOf({ wallStructure: "timber", wall: { unit: "brick" } })).toThrow("A timber wall is laid");
    expect(() => wallOf({ wallStructure: "masonry", wall: { unit: "wooden_plank" } })).toThrow(
      "A masonry wall is not laid"
    );
    expect(() => wallOf({ wall: { unit: "roof_tile" } })).toThrow("not available");
  });

  describe("grid courses of planks or bricks", () => {
    const window_ = { id: "w", kind: "window" as const, u: 0.1, bottom: 1, width: 1, height: 1.4 };
    it.each([
      ["bricks in parallel rows", { wall: { algorithm: { type: "parallel_rows" } } }],
      ["planks in staggered rows", { wall: { unit: "wooden_plank" as const } }],
      ["planks left to the material", { wall: { unit: "wooden_plank" as const, algorithm: { type: "auto" } } }]
    ])("%s prepare and compile", async (_name, style) => {
      const r = designBuildingCore(European.buildHouses({ id: "e", ...style }), registry, { environment });
      expect(r.diagnostics).toEqual([]);
      expect(() =>
        prepareCoreBuilding(r, registry, { environment: { ground: flat }, assets: nativeAssets.compilation })
      ).not.toThrow();
      const { renderInput } = await compileCoreBuilding(r, registry, {
        environment: { ground: flat },
        assets: nativeAssets.compilation
      });
      expect(renderInput.groups.find((g) => g.role === "wall")!.cells.length).toBeGreaterThan(0);
    });
    it("leaves a wall opening clear", () => {
      const r = designBuildingCore(
        European.buildHouses({ id: "e", height: 5, wall: { unit: "wooden_plank" }, attachments: [window_] }),
        registry,
        { environment }
      );
      expect(r.diagnostics).toEqual([]);
      const wall = r.parts.find((p) => p.type === "wall")!;
      const holes = wall.modifications.flatMap((m) => (m.op === "removeArea" ? [m.rect] : []));
      expect(holes).toHaveLength(1);
      const [a, y0, b, y1] = holes[0];
      for (const u of lay(wall)) {
        const [u0, u1] = u.params!.wallU as number[];
        const lo = u.frame.origin[1] - u.size![1] / 2,
          hi = u.frame.origin[1] + u.size![1] / 2;
        expect(u0 < b - 0.01 && a + 0.01 < u1 && lo < y1 - 0.01 && y0 + 0.01 < hi).toBe(false);
      }
    });
    it("takes the material's rule for auto, and boards on a timber structure", () => {
      const courses = (p: object) => (European.buildHouses({ id: "e", ...p }).groups[0].shared as any).courses;
      expect(courses({ wall: { unit: "wooden_plank", algorithm: { type: "auto" } } }).params.rule).toBe(
        "parallel_rows"
      );
      expect(courses({ wallStructure: "timber", wall: { algorithm: { type: "auto" } } }).type).toBe("boardCourses");
    });
  });

  it("is deterministic", () => {
    const units = (r: ReturnType<typeof design>) => boards(r).map((u) => [u.key, ...u.matrix]);
    expect(units(design(house))).toEqual(units(design(structuredClone(house))));
  });
});
