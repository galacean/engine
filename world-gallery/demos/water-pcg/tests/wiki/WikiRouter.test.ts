import { describe, expect, it } from "vitest";
import { getWaterWikiHref, resolveWaterWikiSlug } from "../../demo/wiki/WikiRouter";

describe("Water Wiki router", () => {
  const validSlugs = new Set([
    "overview",
    "water-world",
    "local-effects-and-foam",
    "ocean-rings-and-reflection",
    "underwater"
  ]);

  it("resolves valid pages and falls back from unknown deep links", () => {
    expect(resolveWaterWikiSlug({ search: "?doc=water-world" }, validSlugs, "overview")).toBe("water-world");
    expect(resolveWaterWikiSlug({ search: "?doc=local-effects-and-foam" }, validSlugs, "overview")).toBe(
      "local-effects-and-foam"
    );
    expect(resolveWaterWikiSlug({ search: "?doc=ocean-rings-and-reflection" }, validSlugs, "overview")).toBe(
      "ocean-rings-and-reflection"
    );
    expect(resolveWaterWikiSlug({ search: "?doc=underwater" }, validSlugs, "overview")).toBe("underwater");
    expect(resolveWaterWikiSlug({ search: "?doc=missing" }, validSlugs, "overview")).toBe("overview");
    expect(resolveWaterWikiSlug({ search: "" }, validSlugs, "overview")).toBe("overview");
  });

  it("builds a canonical Wiki URL, preserving quality while removing legacy route selectors", () => {
    expect(
      getWaterWikiHref(
        "http://127.0.0.1:4179/demos/water-pcg/?quality=medium&example=showcase-river#showcase-river",
        "water-world"
      )
    ).toBe("http://127.0.0.1:4179/demos/water-pcg/?quality=medium&doc=water-world#water-wiki");
    expect(
      getWaterWikiHref(
        "http://127.0.0.1:4179/demos/water-pcg/?quality=medium&example=showcase-pool",
        "local-effects-and-foam"
      )
    ).toBe("http://127.0.0.1:4179/demos/water-pcg/?quality=medium&doc=local-effects-and-foam#water-wiki");
    expect(
      getWaterWikiHref(
        "http://127.0.0.1:4179/demos/water-pcg/?quality=high&mode=ocean&example=showcase-ocean",
        "ocean-rings-and-reflection"
      )
    ).toBe("http://127.0.0.1:4179/demos/water-pcg/?quality=high&doc=ocean-rings-and-reflection#water-wiki");
    expect(
      getWaterWikiHref("http://127.0.0.1:4179/demos/water-pcg/?quality=low&example=feature-underwater", "underwater")
    ).toBe("http://127.0.0.1:4179/demos/water-pcg/?quality=low&doc=underwater#water-wiki");
  });
});
