// Ground-open arches: stone voussoirs on piers, or a level timber frame.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { archRails } from "../../src/building/partTypes/Arches";
import { createBuildingRegistry, designBuildingCore, expandUnits, type ResolvedPart } from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import {
  buildCoreHouse,
  type CoreHouseParameters,
  type CoreWallAttachment
} from "../../src/building/application/CoreEuropean";
import { European } from "../../src/building/application/European";
import {
  compileCoreBuilding,
  coreBuildingEnvironment,
  coreBuildingLayout,
  coreBuildingView
} from "../../src/building/render/CoreBuilding";
import { baseline } from "./baseline";

const registry = registerHouseTypes(createBuildingRegistry());
const flat = () => 0;
const assets = nativeAssets.compilation;
const environment = coreBuildingEnvironment(flat, assets);
const design = (p: CoreHouseParameters) => designBuildingCore(buildCoreHouse(p), registry, { environment });
const lay = (part: ResolvedPart) => expandUnits(part, registry, { environment });
const arch = (extra: Partial<CoreWallAttachment> = {}): CoreWallAttachment => ({
  id: "a",
  kind: "opening",
  u: 0.125,
  bottom: 0,
  width: 2,
  height: 2.6,
  ...extra
});
const house = (extra: Partial<CoreHouseParameters> = {}): CoreHouseParameters => ({
  id: "h",
  height: 5,
  rectangle: { center: [0, 0], size: [10, 10], rotation: 0 },
  attachments: [arch()],
  ...extra
});
const part = (r: ReturnType<typeof design>, type: string) => r.parts.find((p) => p.type === type)!;
const messages = (r: ReturnType<typeof design>) => r.diagnostics.map((d) => d.message);
/** Online's arch stones (count and the highest center) and its timber arch members, frozen. */
const ONLINE = baseline<{ stones: number; crown: number; frames: number; pillars: number }>("CoreArch");

describe("Arches against the online path", () => {
  it.each([
    ["a square house", {}],
    ["a tall arch", { attachments: [arch({ height: 3.4, width: 1.4 })] }],
    ["a round wall", { rectangle: undefined, circle: { center: [0, 0], radius: 5, phase: 0 } }]
  ] as [string, Partial<CoreHouseParameters>][])("stone on %s: as many stones, along the same arc", (name, extra) => {
    const p = house(extra);
    const result = design(p);
    expect(result.diagnostics).toEqual([]);
    const units = lay(part(result, "arch"));
    const theirs = ONLINE[name];
    expect(theirs.stones).toBeGreaterThan(5);
    expect(Math.abs(units.length - theirs.stones) / theirs.stones).toBeLessThan(0.15);
    // The crown: the highest stone of each.
    const crown = Math.max(...units.map((u) => u.frame.origin[1]));
    expect(Math.abs(crown - theirs.crown)).toBeLessThan(0.1);
    // Every stone stands on the wall line.
    const range = (k: number) => {
      const v = units.map((u) => u.frame.origin[k]);
      return Math.max(...v) - Math.min(...v);
    };
    // On a straight wall every stone stands on one line.
    if (!extra.circle) expect(Math.min(range(0), range(2))).toBeLessThan(1e-6);
  });

  it("takes the opening out of the wall up to the arc", () => {
    const result = design(house());
    const wall = result.parts.find((p) => p.type === "wall" && p.modifications.some((m) => m.op === "removeArea"))!;
    const rects = wall.modifications.flatMap((m) => (m.op === "removeArea" ? [m.rect] : []));
    expect(rects.length).toBeGreaterThan(4);
    // Together they span the arch's width, reach the ground and rise to the crown.
    const lo = Math.min(...rects.map((r) => r[0])),
      hi = Math.max(...rects.map((r) => r[2]));
    expect(hi - lo).toBeCloseTo(2, 5);
    expect(Math.max(...rects.map((r) => r[3]))).toBeGreaterThan(2.4);
    expect(Math.min(...rects.map((r) => r[1]))).toBeLessThan(0);
  });

  it("is drawn with the wall's stones, and solid at a distance", async () => {
    const result = design(house());
    const layout = coreBuildingLayout(result, registry, { environment: { ground: flat } });
    const count = lay(part(result, "arch")).length;
    const { renderInput } = await compileCoreBuilding(result, registry, { environment: { ground: flat }, assets });
    const wall = renderInput.groups.find((g) => g.role === "wall")!;
    expect(wall.cells.filter((c) => c.id.includes("arc/") || c.id.includes("pier/")).length).toBe(count);
    const far = coreBuildingView(layout, { assets, includeAppearance: true });
    expect(far.retainedWallUnits.some((r) => r.cells.some((c) => c.id.includes("arc/")))).toBe(true);
  });

  it("is a timber frame on a timber wall, with online's members", () => {
    const p = house({ walls: "timber" });
    const result = design(p);
    expect(result.diagnostics).toEqual([]);
    const view = coreBuildingView(coreBuildingLayout(result, registry, { environment: { ground: flat } }), { assets });
    expect(view.woodArchFrames.length).toBeGreaterThan(0);
    expect(view.woodArchPillars).toHaveLength(2);
    expect(view.woodArchFrames.length).toBe(ONLINE.timber.frames);
    expect(view.woodArchPillars.length).toBe(ONLINE.timber.pillars);
    // A lintel opens one rectangle.
    const wall = result.parts.find((q) => q.type === "wall")!;
    expect(wall.modifications.filter((m) => m.op === "removeArea")).toHaveLength(1);
  });

  it("is an error across a corner or without room for its crown", () => {
    expect(messages(design(house({ attachments: [arch({ u: 0.005 })] }))).join()).toContain("crosses a corner");
    expect(messages(design(house({ height: 2.7 }))).join()).toContain("no room above the arch");
    expect(() => buildCoreHouse(house({ attachments: [arch({ bottom: 1 })] }))).toThrow("its bottom must be 0");
  });

  it("comes from the European parameters", () => {
    const a = { id: "a", kind: "opening" as const, u: 0.1, bottom: 0, width: 2, height: 3 };
    const draft = European.buildHouses({ id: "e", attachments: [a] });
    expect(draft.parts.find((p) => p.type === "arch")).toBeDefined();
    expect(
      European.buildHouses({ id: "t", wallStructure: "timber", attachments: [a] }).parts.some(
        (p) => p.type === "woodArch"
      )
    ).toBe(true);
  });

  it.each([
    ["stone", {}, "arch"],
    ["timber", { walls: "timber" as const }, "woodArch"]
  ] as const)("cuts a floor band that crosses a %s arch", (_name, extra, type) => {
    const r = design(
      house({ height: 7, floors: { enabled: true, interval: 3 }, attachments: [arch({ height: 3.4 })], ...extra })
    );
    expect(r.diagnostics).toEqual([]);
    const [, points] = archRails(part(r, type).original.elements.arch);
    const n = points.length - 1;
    const open = points.map((_, i) => i).filter((i) => points[i][1] > 3.1);
    const [a, b] = [4 + (2 * open[0]) / n, 4 + (2 * open.at(-1)!) / n];
    const band = part(r, "floorBand");
    const inside = lay(band).filter((u) => {
      const [u0, u1] = u.params!.wallU as number[];
      return u.frame.origin[1] < 4 && u1 > a + 0.02 && u0 < b - 0.02;
    });
    expect(inside).toEqual([]);
    expect(lay(band).length).toBeGreaterThan(0);
  });

  it("gives its stones their place on the house perimeter, on every side", () => {
    for (const u of [0.125, 0.375, 0.875]) {
      const stones = lay(part(design(house({ attachments: [arch({ u, height: 2.6 })] })), "arch"));
      for (const s of stones) {
        const [a, b] = s.params!.wallU as number[];
        expect(Math.abs((a + b) / 2 - u * 40)).toBeLessThan(1.4);
      }
    }
  });

  it("refuses a timber arch whose frame does not fit under the wall top", () => {
    const m = (height: number) =>
      messages(design(house({ walls: "timber", height: 3, attachments: [arch({ height })] }))).join();
    expect(m(3.4)).toContain("no room above the arch");
    expect(m(2)).toBe("");
  });

  it("is deterministic", () => {
    const units = (r: ReturnType<typeof design>) => lay(part(r, "arch")).map((u) => [u.key, ...u.matrix]);
    expect(units(design(house()))).toEqual(units(design(structuredClone(house()))));
  });
});
