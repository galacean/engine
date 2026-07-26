import { describe, expect, it } from "vitest";
import {
  GRASSLANDS_FIXED_SURFACE_TIME,
  resolveGrasslandsSurfaceTimeOverride,
  resolveGrasslandsSurfaceTimeReadback
} from "../../demo/grasslands/GrasslandsSurfaceTimePolicy";

describe("GrasslandsSurfaceTimePolicy", () => {
  it.each([
    ["ordinary route", ""],
    ["developer route", "mode=dev"],
    ["ordinary route with a fixed-time query", "surfaceTime=12.5"],
    ["developer route with a fixed-time query", "mode=dev&surfaceTime=12.5"]
  ])("keeps %s on live engine time", (_label, search) => {
    expect(resolveGrasslandsSurfaceTimeOverride(new URLSearchParams(search))).toBeUndefined();
  });

  it.each(["acceptance", "visual", "profile"] as const)("pins %s automation to the frozen time", (parameter) => {
    expect(resolveGrasslandsSurfaceTimeOverride(new URLSearchParams(`${parameter}=1`))).toBe(
      GRASSLANDS_FIXED_SURFACE_TIME
    );
  });

  it("reports the active shader time for fixed and live modes", () => {
    expect(resolveGrasslandsSurfaceTimeReadback(GRASSLANDS_FIXED_SURFACE_TIME, 99)).toBe(GRASSLANDS_FIXED_SURFACE_TIME);
    expect(resolveGrasslandsSurfaceTimeReadback(undefined, 17.25)).toBe(17.25);
    expect(resolveGrasslandsSurfaceTimeReadback(undefined, 4097.5)).toBe(1.5);
    expect(resolveGrasslandsSurfaceTimeReadback(undefined, Number.NaN)).toBe(-1);
  });
});
