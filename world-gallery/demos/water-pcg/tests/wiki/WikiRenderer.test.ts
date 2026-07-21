import { describe, expect, it } from "vitest";
import { createWaterWikiHeadingId } from "../../demo/wiki/WikiRenderer";

describe("Water Wiki heading ids", () => {
  it("creates stable Chinese and API anchors with duplicate suffixes", () => {
    expect(createWaterWikiHeadingId("WaterWorld 与水体注册")).toBe("waterworld-与水体注册");
    expect(createWaterWikiHeadingId("WaterWorld 与水体注册", 1)).toBe("waterworld-与水体注册-2");
    expect(createWaterWikiHeadingId("!!!")).toBe("section");
  });
});
