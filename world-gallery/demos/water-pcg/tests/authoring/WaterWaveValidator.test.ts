import { describe, expect, it } from "vitest";
import { WaterWaveDiagnosticCode, WaterWaveDiagnosticSeverity } from "../../authoring/wave/enums/WaterWaveDiagnostic";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../authoring/wave/enums/WaterWaveSchemaVersion";
import { validateWaterWaveAsset } from "../../compiler/wave/WaterWaveValidator";
import { directionalWaterWaveFixture } from "../fixtures/waterWaveFixtures";

describe("WaterWaveValidator", () => {
  it("accepts the V1 None and DirectionalGerstner discriminated variants", () => {
    const none = validateWaterWaveAsset({
      schemaVersion: WaterWaveSchemaVersion.V1,
      model: WaterWaveModel.None
    });
    const gerstner = validateWaterWaveAsset(directionalWaterWaveFixture);

    expect(none).toMatchObject({ valid: true, value: { model: WaterWaveModel.None }, diagnostics: [] });
    expect(gerstner.valid).toBe(true);
    expect(gerstner.value).toEqual(directionalWaterWaveFixture);
  });

  it("rejects invalid roots, schema versions, models, and missing generators with typed diagnostics", () => {
    const values: unknown[] = [
      null,
      { ...directionalWaterWaveFixture, schemaVersion: 999 },
      { ...directionalWaterWaveFixture, model: "fft" },
      { schemaVersion: WaterWaveSchemaVersion.V1, model: WaterWaveModel.DirectionalGerstner }
    ];
    const codes = values.flatMap((value) => validateWaterWaveAsset(value).diagnostics.map((entry) => entry.code));

    expect(codes).toContain(WaterWaveDiagnosticCode.InvalidRootType);
    expect(codes).toContain(WaterWaveDiagnosticCode.UnsupportedSchemaVersion);
    expect(codes).toContain(WaterWaveDiagnosticCode.UnsupportedModel);
    expect(codes).toContain(WaterWaveDiagnosticCode.MissingField);
  });

  it("rejects non-finite values and inverted authoring ranges", () => {
    const invalid = validateWaterWaveAsset({
      ...directionalWaterWaveFixture,
      generator: {
        ...directionalWaterWaveFixture.generator,
        waveCount: 2.5,
        minWavelength: 40,
        maxWavelength: 10,
        minAmplitude: Number.NaN
      }
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.value).toBeUndefined();
    expect(invalid.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: WaterWaveDiagnosticCode.ValueOutOfRange, path: "$.generator.waveCount" }),
        expect.objectContaining({ code: WaterWaveDiagnosticCode.InvalidRange, path: "$.generator.wavelength" }),
        expect.objectContaining({ code: WaterWaveDiagnosticCode.InvalidNumber, path: "$.generator.minAmplitude" })
      ])
    );
  });

  it("reports high accepted steepness as a safety warning", () => {
    const result = validateWaterWaveAsset({
      ...directionalWaterWaveFixture,
      generator: {
        ...directionalWaterWaveFixture.generator,
        largeWaveSteepness: 0.8
      }
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: WaterWaveDiagnosticCode.SelfIntersectionRisk,
        severity: WaterWaveDiagnosticSeverity.Warning
      })
    );
  });
});
