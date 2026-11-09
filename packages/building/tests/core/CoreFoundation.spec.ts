// Raised foundations. A house with a foundation height stands on a level base; its walls start
// on the base. The base is a solid skirt down to the ground or a slab on columns.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import {
  createBuildingRegistry,
  designBuildingCore,
  expandUnits,
  type ResolvedPart,
  ribbonOf
} from "../../src/building/core";
import { registerHouseTypes, type WallChartParams } from "../../src/building/partTypes/House";
import { buildCoreHouse, buildCoreHouses, type CoreHouseParameters } from "../../src/building/application/CoreEuropean";
import { European } from "../../src/building/application/European";
import { compileCoreBuilding, coreBuildingEnvironment } from "../../src/building/render/CoreBuilding";
import { buildConstructionFoundation } from "../../src/building/runtime/ConstructionFoundation";
import { profileShape } from "../../src/building/runtime/ProfileGeometry";
import { profileWallEnvelope } from "../../src/building/runtime/ConstructionWallEnvelope";
import { normalizeProfileFootprint } from "../../src/building/runtime/ProfileParameters";

const registry = registerHouseTypes(createBuildingRegistry());
type Ground = (x: number, z: number) => number;
const flat: Ground = () => 0;
const slope: Ground = (x, z) => 0.12 * x + 0.04 * z;
const design = (houses: CoreHouseParameters[], ground: Ground = flat) =>
  designBuildingCore(buildCoreHouses(houses), registry, { environment: coreBuildingEnvironment(ground) });
const lay = (part: ResolvedPart, ground: Ground = flat) =>
  expandUnits(part, registry, { environment: coreBuildingEnvironment(ground) });
const rectangle = { center: [0, 0] as [number, number], size: [10, 8] as [number, number], rotation: 0.3 };
const circle = { center: [0, 0] as [number, number], radius: 3, phase: 0 };
const house = (extra: Partial<CoreHouseParameters>): CoreHouseParameters => ({
  id: "h",
  height: 4,
  rectangle,
  ...extra
});
const foundationOf = (result: ReturnType<typeof design>) => result.parts.find((p) => p.type === "foundation")!;
const chartOf = (part: ResolvedPart) => {
  const face = part.original.elements.face;
  if (face?.kind !== "surface") throw Error("no face");
  return face.surface.params as WallChartParams;
};
/** The columns a design keeps: the center of each foot. */
const columns = (part: ResolvedPart) =>
  Object.keys(part.original.elements)
    .filter((id) => /^pillar\d+\/foot$/.test(id))
    .filter((id) => !part.modifications.some((m) => m.op === "removeElement" && m.element === id))
    .map((id) => {
      const e = part.original.elements[id];
      if (e.kind !== "surface") throw Error("no foot");
      const q = (e.surface.params as WallChartParams).points.slice(0, 4);
      return [q.reduce((n, p) => n + p[0], 0) / 4, q.reduce((n, p) => n + p[2], 0) / 4];
    });
const online = (shape: object, ground: Ground, height: number, mode: "solid" | "pillars") => {
  const footprint = normalizeProfileFootprint(shape);
  return buildConstructionFoundation({
    id: "x",
    shape: profileShape(footprint),
    wallEnvelope: profileWallEnvelope(footprint),
    height,
    mode,
    terrain: ground
  });
};

describe("Raised foundations", () => {
  it.each(["solid", "pillars"] as const)("%s: the walls start on the level base", (mode) => {
    const result = design([house({ foundation: { height: 0.8, mode } })], slope);
    expect(result.diagnostics).toEqual([]);
    // The base stands at the ground under the center plus the height; the walls start on it,
    // or on the ground where the ground is higher.
    for (const wall of result.parts.filter((p) => p.type === "wall"))
      for (const q of chartOf(wall).points) expect(q[1]).toBeCloseTo(Math.max(0.8, slope(q[0], q[2])), 5);
    expect(lay(foundationOf(result), slope).length).toBeGreaterThan(100);
  });

  it("a house without a foundation height has no foundation part", () => {
    for (const foundation of [undefined, { height: 0 }])
      expect(foundationOf(design([house({ ...(foundation && { foundation }) })]))).toBeUndefined();
  });

  it("solid: level courses hung from the top cover the skirt down into the ground", () => {
    const result = design([house({ foundation: { height: 0.8, mode: "solid" } })]);
    const units = lay(foundationOf(result));
    // Four courses: three whole 0.25 m courses and one that reaches 0.04 m into the ground.
    const tops = [...new Set(units.map((u) => Math.round((u.frame.origin[1] + u.size![1] / 2) * 1e4) / 1e4))].sort();
    expect(tops).toEqual([0.05, 0.3, 0.55, 0.8]);
    for (const u of units) expect(u.frame.origin[1] - u.size![1] / 2).toBeGreaterThanOrEqual(-0.04 - 1e-6);
    // Each course runs the whole perimeter of the wall's centre line, with bricks broken only
    // at the corners.
    const perimeter = 2 * (10 + 8);
    for (const top of tops) {
      const row = units.filter((u) => Math.abs(u.frame.origin[1] + u.size![1] / 2 - top) < 1e-4);
      expect(row.reduce((n, u) => n + u.size![0], 0)).toBeCloseTo(perimeter, 3);
      expect(row.length).toBeLessThanOrEqual(perimeter / 0.5 + 4);
    }
  });

  it("solid: none is laid where the ground stands above the base", () => {
    const steep: Ground = (x) => 0.3 * x;
    const result = design([house({ foundation: { height: 0.5, mode: "solid" } })], steep);
    for (const u of lay(foundationOf(result), steep)) {
      const half = u.size![0] / 2,
        [x, , z] = u.frame.origin;
      const ends = [-half, half].map((d) => steep(x + u.frame.x[0] * d, z + u.frame.x[2] * d));
      expect(Math.min(...ends)).toBeLessThan(0.5 + 1e-6);
    }
  });

  it.each([
    ["a rectangle", { rectangle }],
    ["a circle", { circle }]
  ] as const)("pillars under %s: columns where online stands them, each foot on the ground", (_name, shape) => {
    const result = design([house({ ...shape, foundation: { height: 1.2 } })], slope);
    expect(result.diagnostics).toEqual([]);
    const part = foundationOf(result);
    const ours = columns(part),
      theirs = online(shape, slope, 1.2, "pillars").pillars;
    expect(ours.length).toBe(theirs.length);
    ours.forEach(([x, z], i) => {
      expect(x).toBeCloseTo(theirs[i].point[0], 6);
      expect(z).toBeCloseTo(theirs[i].point[2], 6);
    });
    // Each foot starts 0.04 m under the lowest ground at its corners; the slab is 0.24 m deep.
    const elements = part.original.elements;
    Object.keys(elements)
      .filter((id) => id.endsWith("/foot"))
      .forEach((id, i) => {
        const foot = elements[id];
        if (foot.kind !== "surface") throw Error("no foot");
        expect((foot.surface.params as WallChartParams).minGround).toBeCloseTo(theirs[i].startY, 5);
      });
    const underside = elements.underside;
    expect(ribbonOf(underside)!.points[0][1]).toBeCloseTo(1.2 - 0.24, 6);
  });

  it("pillars: no column stands inside a neighbouring house", () => {
    const raised = house({
      rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
      foundation: { height: 1.2 }
    });
    const neighbour = house({ id: "n", rectangle: { center: [6.5, 0], size: [5, 6], rotation: 0 } });
    const alone = columns(foundationOf(design([raised])));
    const together = design([raised, neighbour]);
    const kept = columns(foundationOf(together));
    expect(kept.length).toBeLessThan(alone.length);
    for (const [x, z] of kept) expect(x > 4 && x < 9 && Math.abs(z) < 3).toBe(false);
    // Online leaves out the same columns.
    const footprint = normalizeProfileFootprint({ rectangle: { center: [6.5, 0], size: [5, 6], rotation: 0 } });
    const theirs = buildConstructionFoundation({
      id: "x",
      shape: profileShape(normalizeProfileFootprint({ rectangle: raised.rectangle! })),
      wallEnvelope: profileWallEnvelope(normalizeProfileFootprint({ rectangle: raised.rectangle! })),
      height: 1.2,
      mode: "pillars",
      terrain: flat,
      neighbors: [{ shape: profileShape(footprint), bottomY: 0, topY: 4 }]
    }).pillars;
    expect(kept.length).toBe(theirs.length);
  });

  it("is drawn as foundation units over its faces", async () => {
    const result = design([house({ foundation: { height: 1.2 } })]);
    const { renderInput } = await compileCoreBuilding(result, registry, {
      environment: { ground: flat },
      assets: nativeAssets.compilation
    });
    const groups = renderInput.groups.filter((g) => g.role === "foundation");
    expect(groups).toHaveLength(1);
    expect(groups[0].cells.length).toBe(lay(foundationOf(result)).length);
    // The faces are a backing surface of their own.
    expect(renderInput.backingParts.some((p) => p.bindingId === groups[0].binding_id)).toBe(true);
  });

  it("comes from the European parameters, and its mode is checked", () => {
    const draft = European.buildHouses({
      id: "e",
      foundation: { height: 0.6, mode: "solid" },
      foundationStyle: { algorithm: { type: "overlap_rows" } }
    });
    const part = draft.parts.find((p) => p.type === "foundation")!;
    expect(part.geometry!.generator).toBe("houseFoundation");
    expect((part.algorithm as { params: { rule: string } }).params.rule).toBe("overlap_rows");
    expect(() => European.buildHouses({ id: "e", foundation: { height: 0.6, mode: "floating" } })).toThrow(
      "Unknown foundation mode"
    );
  });

  it("is deterministic", () => {
    const h = house({ circle, foundation: { height: 1.5 } });
    const units = (r: ReturnType<typeof design>) => lay(foundationOf(r), slope).map((u) => [u.key, ...u.matrix]);
    expect(units(design([h], slope))).toEqual(units(design([structuredClone(h)], slope)));
    expect(() => buildCoreHouse(house({ foundation: { height: -1 } }))).toThrow("A foundation height");
  });
});
