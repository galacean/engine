// A Gothic door on the ground stands on a threshold, laid in the stone of its masonry wall.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { createBuildingRegistry, designBuildingCore, expandUnits } from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import {
  buildCoreHouse,
  type CoreHouseParameters,
  type CoreWallAttachment
} from "../../src/building/application/CoreEuropean";
import { coreBuildingEnvironment } from "../../src/building/render/CoreBuilding";
import { constructionDecorationType } from "../../src/building/runtime/ConstructionDecorationCatalog";

const registry = registerHouseTypes(createBuildingRegistry());
const assets = nativeAssets.compilation;
const slope = (x: number) => 0.05 * x;
const environment = coreBuildingEnvironment(slope, assets);
const door = (type: string, bottom: number): CoreWallAttachment => {
  const size = constructionDecorationType(assets.decorations, type)!.dimensions.find((d) => d.rank === 2)!;
  return { id: "d", kind: "door", type, rank: 2, u: 0.125, bottom, width: size.width, height: size.height };
};
const house = (a: CoreWallAttachment, extra: Partial<CoreHouseParameters> = {}): CoreHouseParameters => ({
  id: "h",
  seed: 7,
  height: 5,
  rectangle: { center: [0, 0], size: [10, 10], rotation: 0 },
  attachments: [a],
  ...extra
});
const design = (p: CoreHouseParameters) => designBuildingCore(buildCoreHouse(p), registry, { environment });
const thresholds = (p: CoreHouseParameters) => {
  const result = design(p);
  expect(result.diagnostics).toEqual([]);
  return result.parts.filter((x) => x.type === "threshold");
};

describe("Door thresholds", () => {
  it("lays stones wider than the door, level on top and on the ground below", () => {
    const [part] = thresholds(house(door("door-gothic", 0)));
    const units = expandUnits(part, registry, { environment });
    expect(units.length).toBeGreaterThanOrEqual(2);
    const opening = design(house(door("door-gothic", 0))).parts.find((x) => x.type === "door")!.original.elements
      .opening0;
    if (opening.kind !== "surface") throw Error("no opening");
    const rect = (opening.surface.params as { rect: number[] }).rect;
    const total = units.reduce((n, u) => n + u.size![0], 0);
    expect(total).toBeGreaterThan(rect[2] - rect[0] + 0.1);
    const tops = units.map((u) => u.frame.origin[1] + u.size![1] / 2);
    for (const top of tops) expect(top).toBeCloseTo(tops[0], 6);
    for (const u of units) expect(u.frame.origin[1] - u.size![1] / 2).toBeLessThan(tops[0]);
  });

  it("is laid only under a door on the ground, on masonry, and where the prefab has one", () => {
    expect(thresholds(house(door("door-gothic", 0.5)))).toHaveLength(0);
    expect(thresholds(house(door("door-cottage", 0)))).toHaveLength(0);
    expect(thresholds(house(door("door-gothic", 0), { walls: "timber" }))).toHaveLength(0);
  });
});
