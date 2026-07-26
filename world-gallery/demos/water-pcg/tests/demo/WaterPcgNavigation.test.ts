import { describe, expect, it } from "vitest";
import {
  findWaterPcgCase,
  getVisibleWaterPcgCases,
  getWaterPcgCaseHref,
  isWaterPcgDeveloperMode,
  resolveWaterPcgCase,
  WATER_PCG_CASES,
  WATER_PCG_DEFAULT_CASE_IDS,
  WATER_PCG_GROUPS,
  WATER_PCG_LEGACY_ALIASES,
  WATER_PCG_PUBLIC_CASES
} from "../../demo/navigation";

const SHOWCASE_CASE_IDS = ["showcase-river", "showcase-pool", "showcase-ocean", "showcase-grasslands-stylized-water"];
const FEATURE_CASE_IDS = [
  "feature-refraction",
  "feature-reflection",
  "feature-ripples",
  "feature-wake-foam",
  "feature-underwater",
  "feature-buoyancy",
  "feature-current-drift",
  "feature-gerstner-waves",
  "feature-ocean-nearshore-waves",
  "feature-ocean-breakers",
  "feature-ocean-shore-foam",
  "feature-ocean-rock-contact",
  "feature-ocean-micro-surface",
  "feature-ocean-wetness",
  "feature-shore-foam",
  "feature-heightfield",
  "feature-river-confluence"
];

describe("Water PCG navigation", () => {
  it("registers four showcases and seventeen focused public feature cases", () => {
    expect(WATER_PCG_CASES.filter(({ group }) => group === "showcase").map(({ id }) => id)).toEqual(SHOWCASE_CASE_IDS);
    expect(WATER_PCG_CASES.filter(({ group }) => group === "feature").map(({ id }) => id)).toEqual(FEATURE_CASE_IDS);
    expect(WATER_PCG_PUBLIC_CASES.map(({ id }) => id)).toEqual([...SHOWCASE_CASE_IDS, ...FEATURE_CASE_IDS]);
    expect(WATER_PCG_PUBLIC_CASES).toHaveLength(21);
    expect(
      WATER_PCG_PUBLIC_CASES.every(
        ({ intro, runtime, preset }) => intro.length > 0 && runtime.length > 0 && preset.length > 0
      )
    ).toBe(true);
  });

  it("promotes the verified Grasslands route to the fourth public Showcase", () => {
    expect(findWaterPcgCase("showcase-grasslands-stylized-water")).toMatchObject({
      id: "showcase-grasslands-stylized-water",
      group: "showcase",
      runtime: "grasslands",
      preset: "hero-grasslands"
    });
    expect(WATER_PCG_PUBLIC_CASES.map(({ id }) => id)).toContain("showcase-grasslands-stylized-water");
    expect(getVisibleWaterPcgCases("showcase-grasslands-stylized-water").map(({ id }) => id)).toEqual([
      "showcase-river",
      "showcase-grasslands-stylized-water",
      "feature-refraction",
      "feature-reflection"
    ]);
  });

  it("shows only the River, refraction, and reflection cases by default", () => {
    expect(WATER_PCG_GROUPS.map(({ id, public: isPublic }) => ({ id, isPublic }))).toEqual([
      { id: "showcase", isPublic: true },
      { id: "feature", isPublic: true },
      { id: "developer", isPublic: false },
      { id: "docs", isPublic: false }
    ]);

    const defaultVisible = getVisibleWaterPcgCases("showcase-river");
    expect(defaultVisible.map(({ id }) => id)).toEqual(WATER_PCG_DEFAULT_CASE_IDS);

    const directPoolVisible = getVisibleWaterPcgCases("showcase-pool");
    expect(directPoolVisible.map(({ id }) => id)).toEqual([
      "showcase-river",
      "showcase-pool",
      "feature-refraction",
      "feature-reflection"
    ]);

    const directLabVisible = getVisibleWaterPcgCases("water-optics-lab");
    expect(directLabVisible.map(({ id }) => id)).toEqual([...WATER_PCG_DEFAULT_CASE_IDS, "water-optics-lab"]);
  });

  it("shows the complete catalog in mode=dev and keeps dev=1 compatible", () => {
    expect(getVisibleWaterPcgCases("showcase-river", true)).toEqual(WATER_PCG_CASES);
    expect(isWaterPcgDeveloperMode({ search: "?mode=dev" })).toBe(true);
    expect(isWaterPcgDeveloperMode({ search: "?quality=high&mode=dev" })).toBe(true);
    expect(isWaterPcgDeveloperMode({ search: "?dev=1" })).toBe(true);
    expect(isWaterPcgDeveloperMode({ search: "?mode=ocean" })).toBe(false);
    expect(isWaterPcgDeveloperMode({ search: "?dev=true" })).toBe(false);
  });

  it("resolves canonical anchors before legacy query parameters", () => {
    expect(
      resolveWaterPcgCase({ hash: "#feature-current-drift", search: "?example=curved-main-river&mode=ocean" })
    ).toMatchObject({
      id: "feature-current-drift",
      group: "feature",
      runtime: "buoyancy",
      preset: "river-drift"
    });
    expect(resolveWaterPcgCase({ hash: "#water-optics-lab", search: "?example=curved-main-river" })).toMatchObject({
      id: "water-optics-lab",
      group: "developer",
      runtime: "optics-lab",
      preset: "full-lab"
    });
    expect(resolveWaterPcgCase({ hash: "#unknown", search: "" }).id).toBe("showcase-river");
  });

  it("canonicalizes every legacy id without registering duplicate public cases", () => {
    for (const [legacyId, canonicalId] of Object.entries(WATER_PCG_LEGACY_ALIASES)) {
      expect(findWaterPcgCase(legacyId)).toBeUndefined();
      expect(resolveWaterPcgCase({ hash: `#${legacyId}`, search: "" }).id).toBe(canonicalId);
      expect(resolveWaterPcgCase({ hash: "", search: `?example=${legacyId}` }).id).toBe(canonicalId);
    }
  });

  it("promotes only legacy River mode URLs to the Ocean showcase", () => {
    expect(resolveWaterPcgCase({ hash: "#curved-main-river", search: "?mode=ocean" }).id).toBe("showcase-ocean");
    expect(resolveWaterPcgCase({ hash: "", search: "?example=multi-tributary-river&mode=ocean" }).id).toBe(
      "showcase-ocean"
    );
    expect(resolveWaterPcgCase({ hash: "", search: "?mode=ocean" }).id).toBe("showcase-ocean");
    expect(resolveWaterPcgCase({ hash: "#showcase-river", search: "?mode=ocean" }).id).toBe("showcase-river");
    expect(resolveWaterPcgCase({ hash: "#feature-heightfield", search: "?mode=ocean" }).id).toBe("feature-heightfield");
  });

  it("builds canonical root links and removes route-owned legacy parameters", () => {
    expect(
      getWaterPcgCaseHref(
        "http://127.0.0.1:4179/demos/water-pcg/buoyancy/?quality=high&example=water-buoyancy&mode=ocean",
        "heightfield-water"
      )
    ).toBe("http://127.0.0.1:4179/demos/water-pcg/?quality=high#feature-heightfield");
    expect(
      getWaterPcgCaseHref(
        "http://127.0.0.1:4179/demos/water-pcg/?quality=high&doc=water-world#water-wiki",
        "showcase-river"
      )
    ).toBe("http://127.0.0.1:4179/demos/water-pcg/?quality=high#showcase-river");
    expect(
      getWaterPcgCaseHref(
        "http://127.0.0.1:4179/demos/water-pcg/?quality=high&doc=water-world#showcase-river",
        "water-wiki"
      )
    ).toBe("http://127.0.0.1:4179/demos/water-pcg/?quality=high&doc=water-world#water-wiki");
  });

  it("preserves mode=dev across case navigation and canonicalizes dev=1", () => {
    expect(
      getWaterPcgCaseHref(
        "http://127.0.0.1:4179/demos/water-pcg/?quality=high&mode=dev#showcase-river",
        "showcase-pool"
      )
    ).toBe("http://127.0.0.1:4179/demos/water-pcg/?quality=high&mode=dev#showcase-pool");
    expect(
      getWaterPcgCaseHref("http://127.0.0.1:4179/demos/water-pcg/?quality=high&dev=1#showcase-river", "water-wiki")
    ).toBe("http://127.0.0.1:4179/demos/water-pcg/?quality=high&mode=dev#water-wiki");
  });
});
