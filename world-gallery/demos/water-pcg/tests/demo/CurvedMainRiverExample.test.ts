import { describe, expect, it } from "vitest";
import { RIVER_SURFACE_MOTION_STYLE_PRESET } from "../../authoring/river/RiverAuthoringLimits";
import { RiverMaterialPreset } from "../../authoring/river/RiverAuthoringEnums";
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
    expect(curvedMainRiverExample.riverDebug.queryT).toBeCloseTo(0.52);
    expect(cameraDistance).toBeLessThan(80);
    expect(motion.displacementAmplitude).toBeLessThan(baseline.displacementAmplitude);
    expect(motion.turbulence).toBeLessThan(baseline.turbulence);
    expect(motion.crestIntensity).toBeLessThan(baseline.crestIntensity);
    expect(motion.microNormalStrength).toBeGreaterThan(baseline.microNormalStrength);
    expect(defaults.material.baseColor).toBe("#0a5b69");
    expect(defaults.material.foamIntensity).toBeLessThanOrEqual(0.75);
    expect(defaults.material.clarity).toBeGreaterThanOrEqual(0.65);
  });
});
