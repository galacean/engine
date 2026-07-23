import { describe, expect, it } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import {
  WATER_OPTICS_FREE_CAMERA_MOVEMENT_SPEED,
  WATER_OPTICS_LAB_DEFAULTS,
  WATER_OPTICS_LAB_DEPTHS,
  WATER_OPTICS_LAB_LENGTH,
  WATER_OPTICS_LAB_OPTICAL_PROFILE,
  WATER_OPTICS_LAB_SURFACE_Y,
  WATER_OPTICS_LAB_WIDTH
} from "../../demo/examples/water-optics-lab/constants";
import {
  createWaterOpticsLabFixture,
  getWaterOpticsBaseQuality,
  WATER_OPTICS_PLANAR_ORIENTATION_MARKERS
} from "../../demo/examples/water-optics-lab/WaterOpticsLabFixture";
import type { WaterOpticsTier } from "../../demo/examples/water-optics-lab/types";

const SUPPORTED_TIERS = ["medium", "high", "experimental"] as const satisfies readonly WaterOpticsTier[];

describe("Water Optics Lab fixture", () => {
  it("uses the highest implemented interactive defaults and a faster free-camera traversal speed", () => {
    expect(WATER_OPTICS_LAB_DEFAULTS).toMatchObject({
      tier: "high",
      reflectionMode: "planar",
      planarFilterEnabled: true
    });
    expect(WATER_OPTICS_FREE_CAMERA_MOVEMENT_SPEED).toBe(5);
  });

  it("builds the same fixed 24m by 14m three-depth pool on every call", () => {
    const first = createWaterOpticsLabFixture("high");
    const second = createWaterOpticsLabFixture("high");

    expect(first.descriptor.grid).toEqual({
      originXZ: [-11.5, -6.5],
      cellSizeXZ: [1, 1],
      width: WATER_OPTICS_LAB_WIDTH,
      height: WATER_OPTICS_LAB_LENGTH
    });
    expect(Array.from(first.descriptor.wetTexelIndices)).toEqual(Array.from(second.descriptor.wetTexelIndices));
    expect(Array.from(first.descriptor.surfaceHeights)).toEqual(Array.from(second.descriptor.surfaceHeights));
    expect(Array.from(first.descriptor.bedHeights ?? [])).toEqual(Array.from(second.descriptor.bedHeights ?? []));
    expect(first.descriptor.surfaceHeights.every((height) => height === WATER_OPTICS_LAB_SURFACE_Y)).toBe(true);
    expect(new Set(Array.from(first.descriptor.bedHeights ?? [], (height) => Number((-height).toFixed(1))))).toEqual(
      new Set(WATER_OPTICS_LAB_DEPTHS)
    );
  });

  it("maps only Medium, High, and Experimental without expanding WaterQualityTier", () => {
    expect(SUPPORTED_TIERS).toEqual(["medium", "high", "experimental"]);
    expect(getWaterOpticsBaseQuality("medium")).toBe(WaterQualityTier.Medium);
    expect(getWaterOpticsBaseQuality("high")).toBe(WaterQualityTier.High);
    expect(getWaterOpticsBaseQuality("experimental")).toBe(WaterQualityTier.High);
  });

  it("uses one tier-independent Golden profile with explicit artistic signal multipliers", () => {
    expect(WATER_OPTICS_LAB_OPTICAL_PROFILE.refractionStrength).toBe(4);
    expect(WATER_OPTICS_LAB_OPTICAL_PROFILE.reflectionIntensity).toBe(2);
    expect(WATER_OPTICS_LAB_OPTICAL_PROFILE.absorptionCoefficient).toEqual([0.21, 0.085, 0.04]);
    expect(WATER_OPTICS_LAB_OPTICAL_PROFILE.scatteringCoefficient).toBe(0.16);
  });

  it("keeps target and ROI identifiers unique and deterministic", () => {
    const fixture = createWaterOpticsLabFixture("medium");
    const targetIds = fixture.targets.map((target) => target.id);
    const roiIds = fixture.rois.map((roi) => roi.id);

    expect(new Set(targetIds).size).toBe(targetIds.length);
    expect(new Set(roiIds).size).toBe(roiIds.length);
    expect(targetIds).toEqual(
      expect.arrayContaining([
        "column-red",
        "column-green",
        "column-blue",
        "underwater-magenta",
        "reflection-tower",
        "foreground-rail"
      ])
    );
    for (const roi of fixture.rois) {
      expect(roi.normalizedRect.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    }
  });

  it("exports four fixed asymmetric Planar orientation markers", () => {
    expect(Object.keys(WATER_OPTICS_PLANAR_ORIENTATION_MARKERS)).toEqual(["left", "right", "up", "down"]);
    expect(WATER_OPTICS_PLANAR_ORIENTATION_MARKERS).toMatchObject({
      left: { id: "orientation-left-red", position: [-10.7, 2.1, -5.5], color: [0.94, 0.08, 0.04, 1] },
      right: { id: "orientation-right-cyan", position: [10.7, 3.1, -5.5], color: [0.02, 0.9, 0.95, 1] },
      up: { id: "orientation-up-yellow", position: [2.8, 5.7, -6.2], color: [1, 0.68, 0.015, 1] },
      down: { id: "orientation-down-violet", position: [-1.8, 0.85, -4.4], color: [0.66, 0.08, 1, 1] }
    });
    const fixtureIds = new Set(createWaterOpticsLabFixture("high").targets.map((target) => target.id));
    for (const marker of Object.values(WATER_OPTICS_PLANAR_ORIENTATION_MARKERS)) {
      expect(marker.kind).toBe("orientation-marker");
      expect(fixtureIds.has(marker.id)).toBe(true);
    }
  });

  it.each(SUPPORTED_TIERS)("compiles the %s fixture within a small deterministic budget", (tier) => {
    const result = HeightfieldWaterCompiler.compile(createWaterOpticsLabFixture(tier).descriptor);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.data).toBeDefined();
    expect(result.data?.chunks.length).toBeGreaterThan(0);
    expect(result.data?.chunks.length).toBeLessThanOrEqual(2);
    expect(result.data?.stats.triangleCount).toBeGreaterThan(0);
    expect(result.data?.stats.triangleCount).toBeLessThan(3000);
  });
});
