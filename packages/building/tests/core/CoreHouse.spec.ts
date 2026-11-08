// COMPAT(online-parity): gridCourses against the online arrangedWallCells, which the online
// path uses for overlap_rows, parallel_rows and round horizontal_rows walls. Default brick
// walls (staggered_rows) use the native masonry online; that is not covered here.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { European } from "../../src/building/parts/architecture/European";
import { designBuilding } from "../../src/building/parts/architecture/BuildingDesign";
import { arrangedWallCells } from "../../src/building/runtime/ConstructionArrangement";
import { createBuildingRegistry, designBuildingCore, expandUnits } from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import { buildCoreHouse, type CoreHouseParameters } from "../../src/building/application/CoreEuropean";

type Ground = (x: number, z: number) => number;
const flat: Ground = () => 0;
const hills: Ground = (x, z) => 0.35 * Math.sin(0.6 * x + 0.3) + 0.2 * Math.cos(0.45 * z);
const zeros = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(zeros)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, zeros(x)]))
      : Object.is(v, -0)
        ? 0
        : v;

function online(p: CoreHouseParameters, ground: Ground) {
  const design = designBuilding(European.buildHouses(p as never), ground, nativeAssets.compilation);
  const o = design.profileSupports[0];
  return arrangedWallCells(o.wallBinding, o.profile, [], o.wallEnvelope.nominalOuter, o.wallRoofJoint);
}
function core(p: CoreHouseParameters, ground: Ground) {
  const registry = registerHouseTypes(createBuildingRegistry());
  const result = designBuildingCore(buildCoreHouse({ ...p, walls: "grid" }), registry, { environment: { ground } });
  expect(result.diagnostics).toEqual([]);
  const wall = result.parts.find((x) => x.type === "wall")!;
  const id = p.id + "-wall";
  return expandUnits(wall, registry, { environment: { ground } }).map((u) => ({
    id: `${id}/${u.key}`,
    logical_id: `${id}/${u.key}`,
    surface_id: id,
    anchor_uv: u.params!.anchor_uv,
    center: [...u.frame.origin],
    tangent: [...u.frame.x],
    bitangent: [...u.frame.y],
    normal: [...u.frame.z],
    size: [...u.size!]
  }));
}

const cases: [string, CoreHouseParameters, Ground][] = [
  ["default house", { id: "a", seed: 0 }, flat],
  ["flat roof", { id: "a", seed: 0, roof: { height: 0 } }, flat],
  ["tall house", { id: "a", height: 9 }, flat],
  ["rotated house", { id: "r", rectangle: { center: [3, -2], size: [10, 7], rotation: 0.6 } }, flat],
  ["round tower", { id: "t", height: 10, circle: { center: [0, 0], radius: 2.5, phase: 0 } }, flat],
  ["steep roof", { id: "s", roof: { height: 0.8, eave: 0.4 } }, flat],
  ["house on hills", { id: "h", rectangle: { center: [2, 1], size: [9, 6], rotation: 0.3 } }, hills]
];

const counts: string[] = [];
describe("gridCourses reproduces the online arrangedWallCells", () => {
  it.each(cases)("%s", (name, p, ground) => {
    const expected = zeros(online(p, ground)) as unknown[];
    const actual = zeros(core(p, ground)) as unknown[];
    expect(expected.length).toBeGreaterThan(100);
    expect(actual.length).toBe(expected.length);
    expect(actual).toEqual(expected);
    counts.push(`${name}: ${actual.length}`);
  });
  it("reports the brick counts", () => console.log("HOUSE WALLS " + counts.join(", ")));
});
