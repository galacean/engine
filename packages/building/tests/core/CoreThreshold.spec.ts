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
    const wall = design(house(door("door-gothic", 0))).parts.find((x) => x.type === "wall")!;
    const rect = wall.modifications
      .flatMap((m) => (m.op === "removeArea" ? [m.rect] : []))
      .sort((a, b) => a[1] - b[1])[0];
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

  it("takes its height from the prefab", () => {
    const tall = {
      ...environment,
      asset: (source: never) => ({ ...(environment.asset!(source) as object), threshold: 0.2 }) as never
    };
    const top = (env: typeof environment) => {
      const result = designBuildingCore(buildCoreHouse(house(door("door-gothic", 0))), registry, { environment: env });
      const [unit] = expandUnits(result.parts.find((x) => x.type === "threshold")!, registry, { environment: env });
      return unit.frame.origin[1] + unit.size![1] / 2;
    };
    expect(top(tall) - top(environment)).toBeCloseTo(0.13, 5);
  });

  it("stays on its wall when a small door stands at the end of it", () => {
    const d = door("door-gothic", 0);
    const small = { ...d, width: d.width! * 0.4, height: d.height! * 0.4, u: ((d.width! * 0.4) / 2 + 0.005) / 40 };
    expect(thresholds(house(small))).toHaveLength(1);
  });
});
