import { describe, expect, it } from "vitest";
import {
  createOceanAnalyticWhitecapGlsl,
  createOceanAnalyticWhitecapSample,
  evaluateOceanAnalyticWhitecap
} from "../../runtime/ocean/OceanAnalyticWhitecapEvaluator";

describe("OceanAnalyticWhitecapEvaluator", () => {
  it("requires both a positive crest and horizontal compression", () => {
    const sample = createOceanAnalyticWhitecapSample();
    evaluateOceanAnalyticWhitecap(1, 1, sample);
    expect(sample.mask).toBe(0);
    evaluateOceanAnalyticWhitecap(0.2, 0, sample);
    expect(sample.mask).toBe(0);
    evaluateOceanAnalyticWhitecap(0.2, 0.8, sample);
    expect(sample.compression).toBeCloseTo(0.8);
    expect(sample.mask).toBeGreaterThan(0.9);
  });

  it("is finite and bounded for invalid or folded inputs", () => {
    const sample = createOceanAnalyticWhitecapSample();
    for (const [jacobian, crest] of [
      [Number.NaN, Number.POSITIVE_INFINITY],
      [-4, 2],
      [4, -2]
    ] as const) {
      evaluateOceanAnalyticWhitecap(jacobian, crest, sample);
      expect(Number.isFinite(sample.mask)).toBe(true);
      expect(sample.mask).toBeGreaterThanOrEqual(0);
      expect(sample.mask).toBeLessThanOrEqual(1);
    }
  });

  it("generates GLSL from the same profile constants", () => {
    const source = createOceanAnalyticWhitecapGlsl();
    expect(source).toContain("0.12000000");
    expect(source).toContain("0.52000000");
    expect(source).toContain("0.16000000");
    expect(source).toContain("0.64000000");
    expect(source).toContain("horizontalJacobianDeterminant");
  });
});
