import { describe, expect, it } from "vitest";
import { WATER_PCG_CASES } from "../../demo/navigation";
import { WATER_WIKI_DEFAULT_SLUG, WATER_WIKI_PAGES, findWaterWikiPage } from "../../demo/wiki/manifest";

describe("Water Wiki manifest", () => {
  it("keeps unique, readable pages with a valid default", () => {
    const slugs = WATER_WIKI_PAGES.map(({ slug }) => slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual([
      "overview",
      "quick-start",
      "architecture",
      "surface-query",
      "water-world",
      "providers",
      "river-pipeline",
      "terrain-and-flow-map",
      "waves-and-quality",
      "buoyancy",
      "camera-and-debug",
      "testing-and-troubleshooting",
      "limitations"
    ]);
    expect(findWaterWikiPage(WATER_WIKI_DEFAULT_SLUG)?.title).toBe("水系统概览");
    for (const page of WATER_WIKI_PAGES) {
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.summary.length).toBeGreaterThan(12);
      expect(page.markdown.length).toBeGreaterThan(200);
      expect(page.telemetry.length).toBeGreaterThan(1);
    }
  });

  it("documents the current architecture, ownership boundaries, runtime API, and verification path", () => {
    const markdownBySlug = new Map(WATER_WIKI_PAGES.map(({ slug, markdown }) => [slug, markdown]));
    expect(markdownBySlug.get("architecture")).toContain("Authoring");
    expect(markdownBySlug.get("architecture")).toContain("Compiler");
    expect(markdownBySlug.get("river-pipeline")).toContain("RiverResource");
    expect(markdownBySlug.get("river-pipeline")).toContain("replaceActiveIncremental");
    expect(markdownBySlug.get("terrain-and-flow-map")).toContain("不会直接修改真实 Terrain");
    expect(markdownBySlug.get("waves-and-quality")).toContain("0 / 2 / 6 / 12");
    expect(markdownBySlug.get("surface-query")).toContain("WaterSurfaceProvider");
    expect(markdownBySlug.get("testing-and-troubleshooting")).toContain("typecheck:water-pcg");
    expect(markdownBySlug.get("limitations")).toContain("没有从 `@galacean/engine` 导出");
  });

  it("only links to registered runnable demo cases", () => {
    const caseIds = new Set(WATER_PCG_CASES.filter(({ kind }) => kind !== "wiki").map(({ id }) => id));
    for (const page of WATER_WIKI_PAGES) {
      if (page.relatedCaseId) expect(caseIds.has(page.relatedCaseId)).toBe(true);
    }
  });
});
