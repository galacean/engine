vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import {
  bindSurfaces,
  createBuildingRegistry,
  designBuildingCore,
  EffectiveGeometry,
  expandUnits,
  laidUnit,
  layingContext,
  type LaidUnit,
  type ResolvedPart
} from "../../src/building/core";
import { registerHouseTypes, wallChartSampler, type WallChartParams } from "../../src/building/partTypes/House";
import { buildCoreHouse, type CoreHouseParameters } from "../../src/building/application/CoreEuropean";
import { compileCoreBuilding } from "../../src/building/render/CoreBuilding";
import { buildBuildingRenderPackage } from "../../src/building/runtime/BuildingRenderPackage";
import { buildingGlobals } from "../../src/building/runtime/BuildingGlobals";

const flat = () => 0;
function house(p: CoreHouseParameters) {
  const registry = registerHouseTypes(createBuildingRegistry());
  const result = designBuildingCore(buildCoreHouse(p), registry, { environment: { ground: flat } });
  const of = (type: string) => result.parts.filter((x) => x.type === type);
  const units = (part: ResolvedPart) => expandUnits(part, registry);
  return { registry, result, walls: of("wall"), stones: of("cornerStone"), units };
}
const chartOf = (part: ResolvedPart) =>
  (part.original.elements.face as { surface: { params: WallChartParams } }).surface.params;
/** The unit's span along its wall chart and its four corner heights. */
const box = (u: LaidUnit) => {
  const [c] = u.params!.anchor_uv as number[],
    d = u.params!.deformation as number[],
    y = u.frame.origin[1],
    h = u.size![1] / 2,
    w = u.size![0] / 2;
  return { u0: c - w, u1: c + w, bl: y - h + d[0], br: y - h + d[1], tl: y + h + d[2], tr: y + h + d[3] };
};
const cases: [string, CoreHouseParameters][] = [
  ["default house", { id: "a" }],
  ["round tower", { id: "t", height: 10, circle: { center: [0, 0], radius: 2.5, phase: 0 } }],
  ["steep roof", { id: "s", roof: { height: 0.8 } }],
  ["rotated house", { id: "r", rectangle: { center: [1, 2], size: [10, 7], rotation: 0.6 } }],
  ["flat roof", { id: "f", roof: { height: 0 } }]
];

describe("masonryCourses and corner stones", () => {
  it.each(cases)("%s: lays bricks between the ground and the roof joint", (_name, p) => {
    const { result, walls, units } = house(p);
    expect(result.diagnostics).toEqual([]);
    let total = 0;
    for (const wall of walls) {
      const chart = chartOf(wall);
      for (const u of units(wall)) {
        const b = box(u);
        expect(Math.min(b.bl, b.br)).toBeGreaterThanOrEqual(chart.minGround - 1e-9);
        // Without a roof joint the masonry ends at the wall top, as the native masonry does.
        // The roof joint can rise a few millimetres above maxYGable + 0.12 on round roofs.
        if (chart.joint) expect(Math.max(b.tl, b.tr)).toBeLessThanOrEqual(chart.maxYGable + 0.12 + 0.005);
        else expect(Math.max(b.tl, b.tr)).toBeLessThanOrEqual(Math.max(...chart.top) + 1e-9);
        expect(b.tl - b.bl).toBeGreaterThan(0);
        total++;
      }
    }
    expect(total).toBeGreaterThan(200);
  });

  it("leaves no gap under the bricks on uneven ground", () => {
    const hills = (x: number, z: number) => 0.35 * Math.sin(0.6 * x + 0.3) + 0.2 * Math.cos(0.45 * z);
    const registry = registerHouseTypes(createBuildingRegistry());
    const environment = { ground: hills };
    const result = designBuildingCore(
      buildCoreHouse({ id: "h", rectangle: { center: [0, 0], size: [9, 6], rotation: 0.3 } }),
      registry,
      { environment }
    );
    expect(result.diagnostics).toEqual([]);
    let bottom = 0;
    for (const wall of result.parts.filter((p) => p.type === "wall")) {
      const chart = chartOf(wall);
      const sample = wallChartSampler(chart);
      for (const u of expandUnits(wall, registry, { environment })) {
        const b = box(u);
        const ends = [sample.at(b.u0).ground, sample.at(b.u1).ground];
        // Only the bricks that stand on the ground at both ends: the others rest on a course.
        if (b.bl > ends[0] + 0.01 || b.br > ends[1] + 0.01) continue;
        bottom++;
        expect((b.bl + b.br) / 2).toBeLessThanOrEqual(hills(u.frame.origin[0], u.frame.origin[2]) + 0.005);
      }
    }
    expect(bottom).toBeGreaterThan(30);
  });

  it("reaches the slope of a gable, whose joint cuts the bricks", () => {
    const { walls, units } = house({
      id: "g",
      rectangle: { center: [0, 0], size: [9, 7], rotation: 0.4 },
      roof: { height: 0.55, ridge_length: 1 }
    });
    const gable = walls.find((w) => chartOf(w).joint && chartOf(w).maxYGable > Math.min(...chartOf(w).top) + 3)!;
    const sample = wallChartSampler(chartOf(gable));
    const bricks = units(gable).map(box);
    for (let i = 1; i < 60; i++) {
      const u = (i / 60) * sample.length;
      const top = Math.max(...bricks.filter((b) => u >= b.u0 && u <= b.u1).map((b) => Math.max(b.tl, b.tr)));
      expect(top).toBeGreaterThan(sample.at(u).roof - 0.2);
    }
  });

  it("derives one stack of corner stones per corner of a rectangle, and none for a round tower", () => {
    const rect = house({ id: "a" });
    expect(rect.walls).toHaveLength(4);
    expect(rect.stones).toHaveLength(4);
    for (const stack of rect.stones) expect(rect.units(stack).length).toBeGreaterThanOrEqual(2);
    for (const wall of rect.walls) expect(wall.modifications.length).toBeGreaterThan(0);
    const tower = house({ id: "t", height: 10, circle: { center: [0, 0], radius: 2.5, phase: 0 } });
    expect(tower.walls).toHaveLength(1);
    expect(tower.stones).toHaveLength(0);
  });

  it("lays corner stones only where the turn is in the connection's angle range", () => {
    const registry = registerHouseTypes(createBuildingRegistry());
    const draft = buildCoreHouse({ id: "a" });
    const result = designBuildingCore(
      {
        ...draft,
        connections: [
          ...(draft.connections ?? []),
          // This corner turns by 90°, outside [10°, 20°]: it keeps its walls whole.
          { kind: "join", id: "no-stones", parts: ["a-wall-0", "a-wall-1"], params: { angle: [10, 20] } }
        ]
      },
      registry,
      { environment: { ground: flat } }
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.parts.filter((p) => p.type === "cornerStone")).toHaveLength(3);
  });

  it("sizes brick slots from the bricks, so that few slots stay empty", () => {
    for (const [, p] of cases) {
      const { walls, units } = house(p);
      for (const wall of walls) {
        const laid = units(wall).length;
        expect(laid).toBeGreaterThan(0);
        expect(wall.layout!.count).toBeLessThan(4 * laid);
      }
    }
  });

  it("keeps bricks apart, and out of the areas given to corner stones", () => {
    const { walls, units, registry } = house({ id: "a" });
    for (const wall of walls) {
      const list = units(wall).map(box);
      const holes = new EffectiveGeometry(
        wall.original,
        wall.modifications,
        bindSurfaces(registry.surfaces, {})
      ).surface("face").removed;
      const overlap = (a: (typeof list)[number], u0: number, u1: number, y0: number, y1: number) =>
        a.u0 < u1 - 1e-6 && u0 < a.u1 - 1e-6 && Math.min(a.bl, a.br) < y1 - 1e-6 && y0 < Math.max(a.tl, a.tr) - 1e-6;
      for (let i = 0; i < list.length; i++) {
        for (let k = i + 1; k < list.length; k++) {
          const b = list[k];
          // Course lines are wavy, so neighbours above and below may touch at a corner, not overlap in width.
          if (Math.abs(Math.max(list[i].tl, list[i].tr) - Math.min(b.bl, b.br)) < 0.05) continue;
          if (Math.abs(Math.max(b.tl, b.tr) - Math.min(list[i].bl, list[i].br)) < 0.05) continue;
          expect(overlap(list[i], b.u0, b.u1, Math.min(b.bl, b.br), Math.max(b.tl, b.tr))).toBe(false);
        }
        for (const h of holes) expect(overlap(list[i], h[0], h[2], h[1], h[3])).toBe(false);
      }
    }
  });

  it("computes every brick independently of the others", () => {
    const { registry, walls, units } = house({ id: "a" });
    const part = walls[0];
    const algorithm = registry.algorithms.get(part.algorithm.type)!;
    const context = layingContext(part, part.unit!, part.layout!.params, registry, {});
    const backward: LaidUnit[] = [];
    for (let i = part.layout!.count - 1; i >= 0; i--) {
      const spec = algorithm.unitAt(context, part.layout!.data, i);
      if (spec) backward.push(laidUnit(context, spec));
    }
    expect(new Map(backward.map((u) => [u.key, u]))).toEqual(new Map(units(part).map((u) => [u.key, u])));
  });

  it("renders a house whose walls and corner stones come from the core", async () => {
    const p = { id: "a" };
    const { registry, result, walls, stones, units } = house(p);
    const { renderInput: input } = await compileCoreBuilding(result, registry, {
      environment: { ground: flat },
      assets: nativeAssets
    });
    const group = input.groups.find((g) => g.role === "wall")!;
    const expected = [...walls, ...stones].reduce((n, part) => n + units(part).length, 0);
    expect(group.cells.length).toBe(expected);
    const built = buildBuildingRenderPackage(
      input,
      nativeAssets,
      buildingGlobals(input.paletteSlots, nativeAssets.frame),
      true
    );
    expect(built.package.draws.length).toBeGreaterThan(0);
  }, 60000);
});
