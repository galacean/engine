import { describe, expect, it } from "vitest";
import {
  analyzeWaterOpticsCompositionPixel,
  analyzeWaterOpticsReferencePixel,
  WATER_OPTICS_REFERENCE_PIXEL_MAXIMUM_ERROR
} from "../../runtime/optics/WaterOpticsCompositionAnalysis";
import { DEFAULT_WATER_OPTICAL_PROFILE } from "../../runtime/optics/WaterOpticalProfile";

describe("WaterOpticsCompositionAnalysis", () => {
  it("confirms repeated background blending only when F matches the legacy blend and differs from C", () => {
    const analysis = analyzeWaterOpticsCompositionPixel({
      centeredOpaqueColor: [0.8, 0.7, 0.6],
      displacedOpaqueColor: [0.2, 0.3, 0.4],
      shaderCompositedColor: [0.25, 0.35, 0.45],
      surfaceAlpha: 0.6,
      finalFramebufferColor: [0.47, 0.49, 0.51],
      stableInterior: true,
      edgeHalo: false
    });

    expect(analysis.valid).toBe(true);
    expect(analysis.decision).toBe("repeated-background-confirmed");
    expect(analysis.predictedLegacyFramebufferColor[0]).toBeCloseTo(0.47, 12);
    expect(analysis.predictedLegacyFramebufferColor[1]).toBeCloseTo(0.49, 12);
    expect(analysis.predictedLegacyFramebufferColor[2]).toBeCloseTo(0.51, 12);
    expect(analysis.predictionError).toBeLessThanOrEqual(3 / 255);
    expect(analysis.targetError).toBeGreaterThan(5 / 255);
  });

  it("confirms the legacy target only when F matches C and the ROI has no edge halo", () => {
    const baseEvidence = {
      centeredOpaqueColor: [0.8, 0.7, 0.6] as const,
      displacedOpaqueColor: [0.2, 0.3, 0.4] as const,
      shaderCompositedColor: [0.25, 0.35, 0.45] as const,
      surfaceAlpha: 0.6,
      finalFramebufferColor: [0.25 + 1 / 510, 0.35, 0.45] as const,
      stableInterior: true
    };

    expect(analyzeWaterOpticsCompositionPixel({ ...baseEvidence, edgeHalo: false }).decision).toBe(
      "legacy-target-confirmed"
    );
    expect(analyzeWaterOpticsCompositionPixel({ ...baseEvidence, edgeHalo: true }).decision).toBe("inconclusive");
  });

  it("fails closed for edge, non-finite, negative, or invalid-alpha evidence", () => {
    for (const evidence of [
      {
        centeredOpaqueColor: [0, 0, 0] as const,
        displacedOpaqueColor: [0, 0, 0] as const,
        shaderCompositedColor: [0, 0, 0] as const,
        surfaceAlpha: 0.5,
        finalFramebufferColor: [0, 0, 0] as const,
        stableInterior: false,
        edgeHalo: false
      },
      {
        centeredOpaqueColor: [Number.NaN, 0, 0] as const,
        displacedOpaqueColor: [0, 0, 0] as const,
        shaderCompositedColor: [0, 0, 0] as const,
        surfaceAlpha: 2,
        finalFramebufferColor: [0, 0, 0] as const,
        stableInterior: true,
        edgeHalo: false
      }
    ]) {
      const analysis = analyzeWaterOpticsCompositionPixel(evidence);
      expect(analysis.valid).toBe(false);
      expect(analysis.decision).toBe("inconclusive");
    }
  });

  it("compares a stable shader pixel with the shared CPU surface-optics evaluator", () => {
    const profile = {
      ...DEFAULT_WATER_OPTICAL_PROFILE,
      absorptionCoefficient: [0, 0, 0] as const,
      scatteringColor: [0, 0, 0] as const,
      scatteringCoefficient: 0,
      indexOfRefraction: 3,
      reflectionIntensity: 0.5
    };
    // F0=F=0.25, so final = source * 0.75 + reflection * 0.125.
    const expected = [0.4, 0.225, 0.1375] as const;
    const analysis = analyzeWaterOpticsReferencePixel({
      profile,
      opticalDistance: 1,
      normalDotView: 1,
      sourceColor: [0.4, 0.2, 0.1],
      reflectionColor: [0.8, 0.6, 0.5],
      shaderCompositedColor: [expected[0] + 1.99 / 255, expected[1], expected[2]],
      stableInterior: true
    });

    expect(analysis.valid).toBe(true);
    expect(analysis.passed).toBe(true);
    expect(analysis.threshold).toBe(WATER_OPTICS_REFERENCE_PIXEL_MAXIMUM_ERROR);
    expect(analysis.maximumChannelError).toBeCloseTo(1.99 / 255, 12);
    expect(analysis.cpuReferenceColor[0]).toBeCloseTo(expected[0], 12);
    expect(analysis.cpuReferenceColor[1]).toBeCloseTo(expected[1], 12);
    expect(analysis.cpuReferenceColor[2]).toBeCloseTo(expected[2], 12);
    expect(analysis.cpuResult.fresnelF0).toBe(0.25);
    expect(analysis.cpuResult.fresnel).toBe(0.25);
    expect(analysis.cpuResult.transmittedColor).toEqual({ red: 0.4, green: 0.2, blue: 0.1 });
    expect(Object.isFrozen(analysis.cpuResult)).toBe(true);
    expect(Object.isFrozen(analysis.cpuResult.finalColor)).toBe(true);
  });

  it("fails the frozen 2/255 reference threshold and fails closed for invalid capture evidence", () => {
    const baseEvidence = {
      profile: DEFAULT_WATER_OPTICAL_PROFILE,
      opticalDistance: 0,
      normalDotView: 1,
      sourceColor: [0, 0, 0] as const,
      reflectionColor: [0, 0, 0] as const,
      shaderCompositedColor: [2.01 / 255, 0, 0] as const,
      stableInterior: true
    };
    const overThreshold = analyzeWaterOpticsReferencePixel(baseEvidence);
    expect(overThreshold.valid).toBe(true);
    expect(overThreshold.passed).toBe(false);
    expect(overThreshold.maximumChannelError).toBeGreaterThan(WATER_OPTICS_REFERENCE_PIXEL_MAXIMUM_ERROR);

    for (const invalidEvidence of [
      { ...baseEvidence, stableInterior: false },
      { ...baseEvidence, opticalDistance: Number.NaN },
      { ...baseEvidence, normalDotView: 2 },
      { ...baseEvidence, reflectionColor: [Number.POSITIVE_INFINITY, 0, 0] as const }
    ]) {
      const analysis = analyzeWaterOpticsReferencePixel(invalidEvidence);
      expect(analysis.valid).toBe(false);
      expect(analysis.passed).toBe(false);
      expect(analysis.maximumChannelError).toBe(Number.POSITIVE_INFINITY);
    }
  });
});
