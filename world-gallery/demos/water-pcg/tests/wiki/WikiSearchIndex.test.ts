import { describe, expect, it } from "vitest";
import { WATER_WIKI_PAGES } from "../../demo/wiki/manifest";
import { createWaterWikiSearchIndex, markdownToSearchText, searchWaterWiki } from "../../demo/wiki/WikiSearchIndex";

describe("Water Wiki search", () => {
  const index = createWaterWikiSearchIndex(WATER_WIKI_PAGES);

  it("ranks titles and keywords without treating the query as a regular expression", () => {
    expect(searchWaterWiki(index, "WaterWorld")[0]?.slug).toBe("water-world");
    expect(searchWaterWiki(index, "PhysX 浮力")[0]?.slug).toBe("buoyancy");
    expect(searchWaterWiki(index, "[")).toEqual([]);
  });

  it("returns the authored order for an empty search", () => {
    expect(searchWaterWiki(index, "   ").map(({ slug }) => slug)).toEqual(WATER_WIKI_PAGES.map(({ slug }) => slug));
  });

  it("reduces Markdown to readable search text", () => {
    expect(markdownToSearchText("## 查询\n使用 **WaterWorld** 和 [`Provider`](./api)。")).toBe(
      "查询 使用 WaterWorld 和 Provider。"
    );
  });
});
