import { describe, expect, it } from "vitest";
import { getWaterWikiHref, resolveWaterWikiSlug } from "../../demo/wiki/WikiRouter";

describe("Water Wiki router", () => {
  const validSlugs = new Set(["overview", "water-world"]);

  it("resolves valid pages and falls back from unknown deep links", () => {
    expect(resolveWaterWikiSlug({ search: "?doc=water-world" }, validSlugs, "overview")).toBe("water-world");
    expect(resolveWaterWikiSlug({ search: "?doc=missing" }, validSlugs, "overview")).toBe("overview");
    expect(resolveWaterWikiSlug({ search: "" }, validSlugs, "overview")).toBe("overview");
  });

  it("builds a canonical Wiki URL without dropping unrelated quality controls", () => {
    expect(
      getWaterWikiHref(
        "http://127.0.0.1:4179/demos/water-pcg/?quality=medium&example=curved-main-river#curved-main-river",
        "water-world"
      )
    ).toBe("http://127.0.0.1:4179/demos/water-pcg/?quality=medium&doc=water-world#water-wiki");
  });
});
