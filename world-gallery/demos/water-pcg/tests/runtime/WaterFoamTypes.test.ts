import { describe, expect, it } from "vitest";
import {
  isValidWaterFoamSource,
  WaterFoamBlendMode,
  WaterFoamSourceKind,
  type WaterFoamSource
} from "../../runtime/interaction/WaterFoamTypes";

describe("WaterFoamTypes", () => {
  it("distinguishes unbounded analytic whitecaps from bounded sources", () => {
    const whitecap: WaterFoamSource = {
      bodyId: "ocean",
      kind: WaterFoamSourceKind.Whitecap,
      intensity: 0.8,
      lifetimeSeconds: 0,
      priority: 1,
      blend: WaterFoamBlendMode.Maximum,
      range: { kind: "unbounded" }
    };
    const impact: WaterFoamSource = {
      bodyId: "ocean",
      kind: WaterFoamSourceKind.Impact,
      intensity: 1,
      lifetimeSeconds: 2,
      priority: 4,
      blend: WaterFoamBlendMode.Add,
      range: {
        kind: "circle",
        worldX: 2,
        worldZ: -3,
        radius: 1.5
      }
    };

    expect(isValidWaterFoamSource(whitecap)).toBe(true);
    expect(isValidWaterFoamSource(impact)).toBe(true);
    expect(
      isValidWaterFoamSource({
        ...impact,
        range: { ...impact.range, radius: 0 }
      })
    ).toBe(false);
  });
});
