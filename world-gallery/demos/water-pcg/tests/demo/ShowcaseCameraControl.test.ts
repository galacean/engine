import { describe, expect, it } from "vitest";
import {
  isShowcaseAutomation,
  resolveShowcaseCameraMode,
  SHOWCASE_CAMERA_MOVEMENT_SPEED
} from "../../demo/showcase/ShowcaseCameraPolicy";

describe("ShowcaseCameraControl", () => {
  it("defaults public Showcase routes to Galacean free roaming", () => {
    expect(resolveShowcaseCameraMode(new URLSearchParams())).toBe("free");
    expect(resolveShowcaseCameraMode(new URLSearchParams(), true)).toBe("free");
  });

  it.each(["acceptance", "visual", "profile"] as const)("keeps the camera fixed for %s automation", (parameter) => {
    expect(isShowcaseAutomation(new URLSearchParams(`${parameter}=1`))).toBe(true);
    expect(resolveShowcaseCameraMode(new URLSearchParams(`${parameter}=1`), true)).toBe("fixed");
  });

  it("keeps auto tour explicit and only enables it for supported scenes", () => {
    expect(resolveShowcaseCameraMode(new URLSearchParams("tour=1"), true)).toBe("tour");
    expect(resolveShowcaseCameraMode(new URLSearchParams("tour=1"), false)).toBe("free");
    expect(resolveShowcaseCameraMode(new URLSearchParams("tour=0"), true)).toBe("free");
  });

  it("uses positive scene-scale movement speeds", () => {
    expect(SHOWCASE_CAMERA_MOVEMENT_SPEED).toEqual({
      river: 16,
      pool: 8,
      ocean: 28,
      grasslands: 14
    });
    expect(Object.values(SHOWCASE_CAMERA_MOVEMENT_SPEED).every((speed) => Number.isFinite(speed) && speed > 0)).toBe(
      true
    );
  });
});
