import { describe, expect, it } from "vitest";
import { RIVER_SURFACE_MOTION_STYLE_PRESET } from "../../authoring/river/RiverAuthoringLimits";
import { RiverMaterialPreset } from "../../authoring/river/RiverAuthoringEnums";
import { WaterDecorationStyle } from "../../demo/decoration/constants";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";

describe("curvedMainRiverExample", () => {
  it("defaults to an unobstructed close view with heightfield-inspired mountain-water tuning", () => {
    const view = curvedMainRiverExample.view;
    const defaults = curvedMainRiverExample.riverDescriptor.defaults;
    if (!("surfaceMotion" in defaults)) throw new Error("Expected explicit V2 surface motion tuning.");
    const motion = defaults.surfaceMotion;
    const baseline = RIVER_SURFACE_MOTION_STYLE_PRESET[RiverMaterialPreset.MountainCreek];
    const cameraDistance = Math.hypot(
      view.cameraPosition[0] - view.cameraTarget[0],
      view.cameraPosition[1] - view.cameraTarget[1],
      view.cameraPosition[2] - view.cameraTarget[2]
    );

    expect(view.showWorldAxes).toBe(false);
    expect(view.cameraPosition).toEqual([52, 11.5, 25]);
    expect(view.cameraTarget).toEqual([4.5, 7, 6]);
    expect(curvedMainRiverExample.decorationStyle).toBe(WaterDecorationStyle.HeightfieldRiver);
    expect(curvedMainRiverExample.riverDebug.queryT).toBeCloseTo(0.52);
    expect(cameraDistance).toBeLessThan(60);
    expect(view.cameraPosition[1]).toBeLessThan(15);
    expect(motion.displacementAmplitude).toBeCloseTo(0.18);
    expect(motion.displacementLengthScale).toBeLessThan(baseline.displacementLengthScale);
    expect(motion.turbulence).toBeLessThan(baseline.turbulence);
    expect(motion.shoreDampingWidth).toBeCloseTo(0.78);
    expect(motion.microNormalStrength).toBeGreaterThan(1);
    expect(defaults.material.baseColor).toBe("#087985");
    expect(defaults.material.foamIntensity).toBeCloseTo(0.82);
    expect(defaults.material.clarity).toBeCloseTo(0.9);
  });
});
