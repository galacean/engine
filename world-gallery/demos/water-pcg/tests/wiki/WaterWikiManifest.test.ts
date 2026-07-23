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
      "local-effects-and-foam",
      "ocean-rings-and-reflection",
      "water-optics",
      "underwater",
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
    expect(markdownBySlug.get("local-effects-and-foam")).toContain("WaterLocalModifier");
    expect(markdownBySlug.get("local-effects-and-foam")).toContain("128 个待消费事件、16 个 emitter");
    expect(markdownBySlug.get("local-effects-and-foam")).toContain("foamTextureUploadsPerRenderFrame");
    expect(markdownBySlug.get("local-effects-and-foam")).toContain("CpuInterpolated + caller-fallback");
    expect(markdownBySlug.get("ocean-rings-and-reflection")).toContain("1 + 12 × 3 = 37");
    expect(markdownBySlug.get("ocean-rings-and-reflection")).toContain("每相机最多选一个 Planar owner");
    expect(markdownBySlug.get("ocean-rings-and-reflection")).toContain("Probe → Sky");
    expect(markdownBySlug.get("ocean-rings-and-reflection")).toContain("perFrameMeshUpload");
    expect(markdownBySlug.get("ocean-rings-and-reflection")).toContain("waterPcgGetReflectionMetrics");
    expect(markdownBySlug.get("water-optics")).toContain("precomposed-replace");
    expect(markdownBySlug.get("water-optics")).toContain("refraction-gates");
    expect(markdownBySlug.get("water-optics")).toContain("@galacean/engine-toolkit-stats");
    expect(markdownBySlug.get("underwater")).toContain("WaterVolumeProvider");
    expect(markdownBySlug.get("underwater")).toContain("0.08 m");
    expect(markdownBySlug.get("underwater")).toContain("BeforeUber");
    expect(markdownBySlug.get("underwater")).toContain("Low 和 Medium");
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
