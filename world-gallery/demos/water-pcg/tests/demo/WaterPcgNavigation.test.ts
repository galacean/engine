import { describe, expect, it } from "vitest";
import { waterPcgExamples } from "../../demo/examples";
import { getWaterPcgCaseHref, resolveWaterPcgCase, WATER_PCG_CASES } from "../../demo/navigation";

describe("Water PCG navigation", () => {
  it("keeps the three authored examples and exposes standalone runtime and Wiki labels", () => {
    expect(WATER_PCG_CASES.slice(0, 3).map(({ id, label }) => ({ id, label }))).toEqual(
      waterPcgExamples.map(({ id, label }) => ({ id, label }))
    );
    expect(WATER_PCG_CASES[2]).toEqual({
      id: "indoor-reflective-pool",
      label: "交互式泳池",
      kind: "interactive-pool"
    });
    expect(WATER_PCG_CASES.slice(3)).toEqual([
      { id: "heightfield-water", label: "高度场水面", kind: "heightfield" },
      { id: "water-buoyancy", label: "水浮力与水流", kind: "buoyancy" },
      { id: "water-wiki", label: "开发文档", kind: "wiki" }
    ]);
  });

  it("resolves direct anchors before the legacy example query", () => {
    expect(resolveWaterPcgCase({ hash: "#water-buoyancy", search: "?example=curved-main-river" }).id).toBe(
      "water-buoyancy"
    );
    expect(resolveWaterPcgCase({ hash: "", search: "?example=multi-tributary-river" }).id).toBe(
      "multi-tributary-river"
    );
    expect(resolveWaterPcgCase({ hash: "#unknown", search: "" }).id).toBe("curved-main-river");
  });

  it("builds canonical root links while preserving unrelated query parameters", () => {
    expect(
      getWaterPcgCaseHref(
        "http://127.0.0.1:4179/demos/water-pcg/buoyancy/?quality=high&example=indoor-reflective-pool",
        "heightfield-water"
      )
    ).toBe("http://127.0.0.1:4179/demos/water-pcg/?quality=high#heightfield-water");
    expect(
      getWaterPcgCaseHref(
        "http://127.0.0.1:4179/demos/water-pcg/?quality=high&doc=water-world#water-wiki",
        "curved-main-river"
      )
    ).toBe("http://127.0.0.1:4179/demos/water-pcg/?quality=high#curved-main-river");
  });
});
