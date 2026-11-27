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
  ribbonOf,
  attachPairKey
} from "../../src/building/core";
import { registerHouseTypes, type WallChartParams } from "../../src/building/partTypes/House";
import { buildCoreHouse, buildCoreHouses, type CoreHouseParameters } from "../../src/building/application/CoreEuropean";
import { European } from "../../src/building/application/European";
import { compileCoreBuilding, coreBuildingEnvironment } from "../../src/building/render/CoreBuilding";
import { frozen } from "./baseline";
import { PLASTER_RISE } from "../../src/building/runtime/ConstructionPlasterShader";

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
/** Where online stood the pillars of a 1.2 m foundation on the slope, and how many it kept beside
 * the neighbouring house. */
const ONLINE = frozen<{
  pillars: Record<"rectangle" | "circle", { x: number; z: number; startY: number }[]>;
  besideNeighbour: number;
}>("CoreFoundation");

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
  ] as const)("pillars under %s: columns where online stands them, each foot on the ground", (name, shape) => {
    const result = design([house({ ...shape, foundation: { height: 1.2 } })], slope);
    expect(result.diagnostics).toEqual([]);
    const part = foundationOf(result);
    const ours = columns(part),
      theirs = ONLINE.pillars[name === "a circle" ? "circle" : "rectangle"];
    expect(ours.length).toBe(theirs.length);
    ours.forEach(([x, z], i) => {
      expect(x).toBeCloseTo(theirs[i].x, 6);
      expect(z).toBeCloseTo(theirs[i].z, 6);
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
    expect(kept.length).toBe(ONLINE.besideNeighbour);
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

  describe("plaster", () => {
    const plastered = (mode: "pillars" | "solid") =>
      design([{ id: "h", foundation: { height: 1.2, mode, plaster: { wear: 0.4, color: 2 } } }]);
    it.each(["pillars", "solid"] as const)("covers each charted face of a %s base", (mode) => {
      const result = plastered(mode);
      expect(result.diagnostics).toEqual([]);
      const base = result.parts.find((p) => p.type === "foundation")!;
      const plaster = result.parts.find((p) => p.type === "plaster")!;
      const faces = Object.values(base.original.elements).filter(
        (e) => e.kind === "surface" && e.surface.kind === "wallChart"
      ).length;
      expect(faces).toBeGreaterThan(0);
      expect(Object.keys(plaster.original.elements)).toHaveLength(faces);
      expect(lay(plaster)).toHaveLength(faces);
    });
    it("goes with a column that a neighbouring house removes", () => {
      const result = design([
        {
          id: "a",
          height: 4,
          rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
          foundation: { height: 1.2, mode: "pillars", plaster: { wear: 0.4, color: 2 } }
        },
        { id: "b", height: 8, rectangle: { center: [7.5, 0], size: [8, 6], rotation: 0 } }
      ]);
      const plaster = result.parts.find((p) => p.type === "plaster" && p.group === "a")!;
      const gone = plaster.modifications.filter((m) => m.op === "removeElement");
      expect(gone.length).toBeGreaterThan(0);
      expect(lay(plaster).length).toBe(
        Object.keys(plaster.original.elements).length - new Set(gone.map((m) => m.element)).size
      );
    });
    it.each(["pillars", "solid"] as const)(
      "wears a %s base from its own height: whole at the top, worn lower down and at its edges",
      async (mode) => {
        const { renderInput } = await compileCoreBuilding(plastered(mode), registry, {
          environment: { ground: flat },
          assets: nativeAssets.compilation
        });
        const faces = renderInput.surfaceParts.filter((p) => p.plaster);
        expect(faces.length).toBeGreaterThan(0);
        for (const face of faces) {
          const ys = face.uvs.map((uv) => uv[1]),
            heights = face.positions.filter((_, i) => i % 3 === 1);
          // Every face, a short cap as much as the shaft, is whole at its top, and keeps its own
          // height below that: the wear only moves, it does not stretch the texture.
          expect(Math.max(...ys)).toBeCloseTo(PLASTER_RISE, 3);
          expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(Math.max(...heights) - Math.min(...heights), 6);
          // Its deepest point counts as a full metre from the edges; the rows of the mesh, 0.4 m
          // apart, come within two thirds of it. A face lower than a row lies all along its
          // edges and wears away.
          const d = face.plaster!.edgeDistances,
            low = Math.max(...heights) - Math.min(...heights) <= 0.4;
          expect(Math.max(...d)).toBeLessThanOrEqual(1);
          expect(Math.min(...d)).toBeLessThan(0.01);
          if (low) expect(Math.max(...d)).toBeLessThan(0.01);
          else expect(Math.max(...d)).toBeGreaterThan(0.6);
        }
      }
    );
    it("is not offered by a part type that does not allow it", () => {
      expect(registry.defaults.get(attachPairKey("plaster", ["roof"]))).toBeUndefined();
      expect(registry.defaults.get(attachPairKey("plaster", ["foundation"]))).toBe("none");
    });
  });
});
