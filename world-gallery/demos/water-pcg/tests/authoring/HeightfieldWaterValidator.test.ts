import { describe, expect, it } from "vitest";
import { HeightfieldWaterDiagnosticCode } from "../../authoring/heightfield/HeightfieldWaterEnums";
import { validateHeightfieldWaterDescriptor } from "../../compiler/heightfield/HeightfieldWaterValidator";
import { curvedHeightfieldFixture, singleTexelHeightfieldFixture } from "../fixtures/heightfieldWaterFixtures";

describe("HeightfieldWaterValidator", () => {
  it("accepts a valid typed-array descriptor", () => {
    const result = validateHeightfieldWaterDescriptor(curvedHeightfieldFixture);

    expect(result.valid).toBe(true);
    expect(result.value?.id).toBe("curved-surface");
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects malformed runtime input without throwing", () => {
    expect(() => validateHeightfieldWaterDescriptor({ id: "broken" })).not.toThrow();
    const result = validateHeightfieldWaterDescriptor({ id: "broken" });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("requires strictly increasing, in-range wet texel indices", () => {
    const result = validateHeightfieldWaterDescriptor({
      ...curvedHeightfieldFixture,
      wetTexelIndices: new Uint32Array([0, 2, 2, 8]),
      surfaceHeights: new Float32Array([1, 1, 1, 1]),
      bedHeights: undefined,
      flowVectorsXZ: undefined
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        HeightfieldWaterDiagnosticCode.TexelOrderInvalid,
        HeightfieldWaterDiagnosticCode.TexelIndexOutOfRange
      ])
    );
  });

  it("validates optional buffer lengths and finite values", () => {
    const result = validateHeightfieldWaterDescriptor({
      ...curvedHeightfieldFixture,
      bedHeights: new Float32Array([0]),
      flowVectorsXZ: new Float32Array([Number.NaN])
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        HeightfieldWaterDiagnosticCode.BufferLengthMismatch,
        HeightfieldWaterDiagnosticCode.InvalidNumber
      ])
    );
  });

  it("rejects a bed above the absolute water surface", () => {
    const result = validateHeightfieldWaterDescriptor({
      ...singleTexelHeightfieldFixture,
      bedHeights: new Float32Array([4])
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: HeightfieldWaterDiagnosticCode.BedAboveSurface })])
    );
  });

  it("enforces wet and dense-query input budgets before allocation", () => {
    const result = validateHeightfieldWaterDescriptor({
      ...curvedHeightfieldFixture,
      budget: { maxWetTexelCount: 2, maxQueryTexelCount: 4 }
    });

    expect(result.valid).toBe(false);
    expect(
      result.diagnostics.filter((diagnostic) => diagnostic.code === HeightfieldWaterDiagnosticCode.BudgetExceeded)
    ).toHaveLength(2);
  });
});
