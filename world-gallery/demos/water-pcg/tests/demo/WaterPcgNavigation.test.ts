import { describe, expect, it } from "vitest";
import { waterPcgExamples } from "../../demo/examples";
import { getWaterPcgCaseHref, resolveWaterPcgCase, WATER_PCG_CASES } from "../../demo/navigation";

describe("Water PCG navigation", () => {
  it("keeps the four authored examples and exposes two Chinese standalone case labels", () => {
    expect(WATER_PCG_CASES.slice(0, 4).map(({ id, label }) => ({ id, label }))).toEqual(
      waterPcgExamples.map(({ id, label }) => ({ id, label }))
    );
    expect(WATER_PCG_CASES.slice(4)).toEqual([
      { id: "heightfield-water", label: "高度场水体", kind: "heightfield" },
      { id: "water-buoyancy", label: "水浮力与水流", kind: "buoyancy" }
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
  });
});
