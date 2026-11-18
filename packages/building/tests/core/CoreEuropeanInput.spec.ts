// What the European generators accept, and how they tell an author or agent what is wrong.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { designBuildingCore } from "../../src/building/core";
import { createBuildingTypeRegistry } from "../../src/building/partTypes";
import { coreBuildingEnvironment } from "../../src/building/render/CoreBuilding";
import {
  European,
  type EuropeanAttachment,
  type EuropeanHouseParameters
} from "../../src/building/application/European";

const registry = createBuildingTypeRegistry();
const environment = coreBuildingEnvironment(() => 0, nativeAssets.compilation);
const house = (
  attachments: EuropeanAttachment[],
  extra: Partial<EuropeanHouseParameters> = {}
): EuropeanHouseParameters => ({
  id: "h",
  height: 5,
  rectangle: { center: [0, 0], size: [8, 6] },
  attachments,
  ...extra
});
const window = (extra: Partial<EuropeanAttachment> = {}): EuropeanAttachment => ({
  id: "w",
  kind: "window",
  u: 0.1,
  bottom: 1,
  width: 1,
  height: 1.2,
  ...extra
});
const messages = (p: EuropeanHouseParameters) =>
  designBuildingCore(European.buildHouses(p), registry, { environment }).diagnostics.map((d) => d.message);

describe("European house input", () => {
  it("names the asset of a rank the kit does not have, once", () => {
    expect(messages(house([window({ rank: 4 as never })]))).toEqual(['Unknown asset {"prefab":"window-cottage/4"}']);
    expect(messages(house([window({ kind: "wall-lamp", rank: 2 })]))).toEqual([
      'Unknown asset {"prefab":"wall-lantern/2"}'
    ]);
    expect(messages(house([window({ rank: 2 })]))).toEqual([]);
  });

  it("refuses a rank that is not a whole number from 1", () => {
    for (const rank of [0, 1.5, -1])
      expect(() => European.buildHouses(house([window({ rank: rank as never })]))).toThrow(
        `must be a whole number from 1, not ${rank}`
      );
  });

  it("refuses an unknown kind and lists the kinds", () => {
    expect(() => European.buildHouses(house([window({ kind: "chimney" as never })]))).toThrow(
      'Unknown attachment kind "chimney" ("w"); the kinds are window, door, wall-lamp, lantern, opening, hatch'
    );
  });

  it("says what a roof takes instead of a door, flat or pitched", () => {
    const door: EuropeanAttachment = { id: "d", kind: "door", host: "roof", uv: [0.5, 0.5], width: 1, height: 2 };
    for (const roof of [{ height: 0 }, {}])
      expect(() => European.buildHouses(house([door], { roof }))).toThrow(
        'A roof has no attachment of kind "door" ("d"); on a roof use a window, hatch or lamp'
      );
    const lamp: EuropeanAttachment = { id: "l", kind: "wall-lamp", host: "roof", uv: [0.5, 0.5] };
    expect(() => European.buildHouses(house([lamp]))).toThrow('of kind "wall-lamp" needs a flat roof');
  });

  it("gives a cottage dormer one to three windows", () => {
    const dormer = (rank: number): EuropeanAttachment => ({
      id: "d",
      kind: "window",
      type: "dormer-cottage",
      rank: rank as never,
      uv: [0.5, 0.25]
    });
    expect(() => European.buildHouses(house([dormer(4)]))).toThrow("A dormer-cottage has 1 to 3 windows: rank 4");
    expect(() => European.buildHouses(house([dormer(3)]))).not.toThrow();
  });

  it("moves only a round roof's top with tip", () => {
    expect(() => European.buildHouses(house([], { roof: { tip: [0.2, 0] } }))).toThrow(
      "a rectangular pitched roof needs [0, 0]"
    );
    expect(messages(house([], { roof: { tip: [0, 0] } }))).toEqual([]);
    expect(
      messages(house([], { rectangle: undefined, circle: { center: [0, 0], radius: 4 }, roof: { tip: [0.2, 0] } }))
    ).toEqual([]);
  });
});
