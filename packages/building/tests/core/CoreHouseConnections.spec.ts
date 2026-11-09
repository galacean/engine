// Houses that touch connect: seam stones where their wall faces cross, joined parapets where
// two flat roofs meet, and mounted parts hidden inside the other house.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { createBuildingRegistry, designBuildingCore, expandUnits } from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import { buildCoreHouses, type CoreHouseParameters } from "../../src/building/application/CoreEuropean";
import { coreBuildingEnvironment } from "../../src/building/render/CoreBuilding";

const registry = registerHouseTypes(createBuildingRegistry());
const ground = (x: number, z: number) => 0.2 * Math.sin(0.4 * x) + 0.1 * Math.cos(0.3 * z);
const design = (houses: CoreHouseParameters[]) =>
  designBuildingCore(buildCoreHouses(houses), registry, {
    environment: coreBuildingEnvironment(ground, nativeAssets.compilation)
  });
const a: CoreHouseParameters = {
  id: "a",
  seed: 3,
  height: 4,
  rectangle: { center: [-1.5, 0], size: [7, 5], rotation: 0 }
};
const b: CoreHouseParameters = {
  id: "b",
  seed: 9,
  height: 5.5,
  rectangle: { center: [3, 0], size: [4, 9], rotation: 0.3 },
  roof: { ridge_length: 1 }
};

describe("Houses that touch", () => {
  it("lay a column of seam stones where their wall faces cross, away from corners", () => {
    const result = design([a, b]);
    expect(result.diagnostics).toEqual([]);
    const seams = result.parts.filter((p) => p.type === "wallSeam");
    // The rotated house's long faces cross the other house's front and back faces.
    expect(seams.length).toBe(2);
    for (const seam of seams) {
      const units = expandUnits(seam, registry);
      expect(units.length).toBeGreaterThan(4);
      const origin = (seam.original.elements.seam as { frame: { origin: number[] } }).frame.origin;
      const ys = units.flatMap((u) => [u.frame.origin[1] - u.size[1] / 2, u.frame.origin[1] + u.size[1] / 2]);
      // From the wall base, which follows the ground, to below the lower wall top.
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(origin[1]);
      expect(Math.min(...ys) - ground(origin[0], origin[2])).toBeLessThan(0.1);
      expect(Math.max(...ys)).toBeLessThan(4.5);
      // Every stone stands on the seam, facing out between the two faces.
      for (const u of units)
        expect(Math.hypot(u.frame.origin[0] - origin[0], u.frame.origin[2] - origin[2])).toBeLessThan(1e-9);
    }
  });
  it("lay nothing between houses that do not touch, and the same stones every time", () => {
    const apart = design([a, { ...b, rectangle: { ...b.rectangle!, center: [20, 0] } }]);
    expect(apart.parts.filter((p) => p.type === "wallSeam")).toEqual([]);
    expect(JSON.stringify(design([a, b]))).toBe(JSON.stringify(design([a, b])));
  });
  it("let the lower of two flat roofs' parapets give way, the higher one keeping its edge", () => {
    const flat = { roof: { height: 0 } };
    const result = design([
      { ...a, ...flat },
      { ...b, height: 4.5, ...flat }
    ]);
    expect(result.diagnostics).toEqual([]);
    const parapets = result.parts.filter((p) => p.type === "parapet");
    expect(parapets.length).toBe(2);
    const cuts = (id: string) =>
      parapets.find((p) => p.key.includes(id))!.modifications.some((m) => m.op === "removeArea");
    expect(cuts("a-parapet")).toBe(true);
    expect(cuts("b-parapet")).toBe(false);
    // A roof more than 2 m higher keeps its whole parapet, and so does the lower one.
    const apart = design([
      { ...a, ...flat },
      { ...b, height: 8, ...flat }
    ]).parts.filter((p) => p.type === "parapet");
    for (const p of apart) expect(p.modifications.some((m) => m.op === "removeArea")).toBe(false);
  });
  it("hide a mounted part whose mount lies inside the other house", () => {
    const windowAt = (u: number) => ({ id: `w${u}`, kind: "window", u, bottom: 1, width: 0.9, height: 1.35 });
    // u = 0.6 is on the right side of house a, which lies inside house b; u = 0.87 is on the back.
    const result = design([{ ...a, attachments: [windowAt(0.6), windowAt(0.87)] as never }, b]);
    const hidden = result.diagnostics.filter((d) => d.message.includes("inside another house"));
    expect(hidden.length).toBe(1);
    // The hidden part lays nothing and reports nothing else.
    expect(result.diagnostics.length).toBe(1);
    expect(hidden[0].message).toContain("a/w0.6");
    const laid = (id: string) =>
      expandUnits(result.parts.find((p) => p.identity.kind === "author" && p.identity.id === id)!, registry);
    expect(laid("a/w0.6")).toEqual([]);
    expect(laid("a/w0.87").length).toBe(1);
  });
});
