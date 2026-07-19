/** Strict validation and decoding for external WaterWaveAsset values. */
import {
  WATER_WAVE_LIMITS,
  WATER_WAVE_STEEPNESS_WARNING_THRESHOLD
} from "../../authoring/wave/constants/WaterWaveLimits";
import { WaterWaveDiagnosticCode, WaterWaveDiagnosticSeverity } from "../../authoring/wave/enums/WaterWaveDiagnostic";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../authoring/wave/enums/WaterWaveSchemaVersion";
import type {
  DirectionalGerstnerWaterWaveAssetV1,
  GerstnerWaveGeneratorConfig,
  WaterWaveAssetV1,
  WaterWaveDiagnostic,
  WaterWaveValidationResult
} from "../../authoring/wave/WaterWaveTypes";

type UnknownRecord = Record<string, unknown>;

interface NumberRule {
  readonly path: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly integer?: boolean;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushDiagnostic(
  diagnostics: WaterWaveDiagnostic[],
  code: WaterWaveDiagnosticCode,
  severity: WaterWaveDiagnosticSeverity,
  path: string,
  message: string
): void {
  diagnostics.push({ code, severity, path, message });
}

function readNumber(
  record: UnknownRecord,
  key: string,
  rule: NumberRule,
  diagnostics: WaterWaveDiagnostic[]
): number | undefined {
  if (!(key in record)) {
    pushDiagnostic(
      diagnostics,
      WaterWaveDiagnosticCode.MissingField,
      WaterWaveDiagnosticSeverity.Error,
      rule.path,
      "Required numeric field is missing."
    );
    return undefined;
  }
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    pushDiagnostic(
      diagnostics,
      WaterWaveDiagnosticCode.InvalidNumber,
      WaterWaveDiagnosticSeverity.Error,
      rule.path,
      "Expected a finite number."
    );
    return undefined;
  }
  if ((rule.integer && !Number.isInteger(value)) || value < rule.minimum || value > rule.maximum) {
    pushDiagnostic(
      diagnostics,
      WaterWaveDiagnosticCode.ValueOutOfRange,
      WaterWaveDiagnosticSeverity.Error,
      rule.path,
      `Expected ${rule.integer ? "an integer" : "a value"} in [${rule.minimum}, ${rule.maximum}].`
    );
  }
  return value;
}

function hasErrors(diagnostics: readonly WaterWaveDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === WaterWaveDiagnosticSeverity.Error);
}

function validateRange(
  minimum: number | undefined,
  maximum: number | undefined,
  path: string,
  diagnostics: WaterWaveDiagnostic[]
): void {
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    pushDiagnostic(
      diagnostics,
      WaterWaveDiagnosticCode.InvalidRange,
      WaterWaveDiagnosticSeverity.Error,
      path,
      "Minimum value must not exceed maximum value."
    );
  }
}

function decodeGerstnerGenerator(
  value: unknown,
  diagnostics: WaterWaveDiagnostic[]
): GerstnerWaveGeneratorConfig | undefined {
  if (!isRecord(value)) {
    pushDiagnostic(
      diagnostics,
      WaterWaveDiagnosticCode.MissingField,
      WaterWaveDiagnosticSeverity.Error,
      "$.generator",
      "Directional Gerstner assets require a generator object."
    );
    return undefined;
  }
  const limits = WATER_WAVE_LIMITS;
  const waveCount = readNumber(
    value,
    "waveCount",
    { path: "$.generator.waveCount", minimum: limits.minWaveCount, maximum: limits.maxWaveCount, integer: true },
    diagnostics
  );
  const seed = readNumber(
    value,
    "seed",
    { path: "$.generator.seed", minimum: limits.minSeed, maximum: limits.maxSeed, integer: true },
    diagnostics
  );
  const randomness = readNumber(
    value,
    "randomness",
    { path: "$.generator.randomness", minimum: limits.minRandomness, maximum: limits.maxRandomness },
    diagnostics
  );
  const minWavelength = readNumber(
    value,
    "minWavelength",
    { path: "$.generator.minWavelength", minimum: limits.minWavelength, maximum: limits.maxWavelength },
    diagnostics
  );
  const maxWavelength = readNumber(
    value,
    "maxWavelength",
    { path: "$.generator.maxWavelength", minimum: limits.minWavelength, maximum: limits.maxWavelength },
    diagnostics
  );
  const wavelengthFalloff = readNumber(
    value,
    "wavelengthFalloff",
    { path: "$.generator.wavelengthFalloff", minimum: limits.minFalloff, maximum: limits.maxFalloff },
    diagnostics
  );
  const minAmplitude = readNumber(
    value,
    "minAmplitude",
    { path: "$.generator.minAmplitude", minimum: limits.minAmplitude, maximum: limits.maxAmplitude },
    diagnostics
  );
  const maxAmplitude = readNumber(
    value,
    "maxAmplitude",
    { path: "$.generator.maxAmplitude", minimum: limits.minAmplitude, maximum: limits.maxAmplitude },
    diagnostics
  );
  const amplitudeFalloff = readNumber(
    value,
    "amplitudeFalloff",
    { path: "$.generator.amplitudeFalloff", minimum: limits.minFalloff, maximum: limits.maxFalloff },
    diagnostics
  );
  const dominantWindAngle = readNumber(
    value,
    "dominantWindAngle",
    { path: "$.generator.dominantWindAngle", minimum: limits.minWindAngle, maximum: limits.maxWindAngle },
    diagnostics
  );
  const dominantAngularSpread = readNumber(
    value,
    "dominantAngularSpread",
    {
      path: "$.generator.dominantAngularSpread",
      minimum: limits.minAngularSpread,
      maximum: limits.maxAngularSpread
    },
    diagnostics
  );
  const smallWaveSteepness = readNumber(
    value,
    "smallWaveSteepness",
    { path: "$.generator.smallWaveSteepness", minimum: limits.minSteepness, maximum: limits.maxSteepness },
    diagnostics
  );
  const largeWaveSteepness = readNumber(
    value,
    "largeWaveSteepness",
    { path: "$.generator.largeWaveSteepness", minimum: limits.minSteepness, maximum: limits.maxSteepness },
    diagnostics
  );
  const steepnessFalloff = readNumber(
    value,
    "steepnessFalloff",
    { path: "$.generator.steepnessFalloff", minimum: limits.minFalloff, maximum: limits.maxFalloff },
    diagnostics
  );
  validateRange(minWavelength, maxWavelength, "$.generator.wavelength", diagnostics);
  validateRange(minAmplitude, maxAmplitude, "$.generator.amplitude", diagnostics);
  if (
    smallWaveSteepness !== undefined &&
    largeWaveSteepness !== undefined &&
    Math.max(smallWaveSteepness, largeWaveSteepness) > WATER_WAVE_STEEPNESS_WARNING_THRESHOLD
  ) {
    pushDiagnostic(
      diagnostics,
      WaterWaveDiagnosticCode.SelfIntersectionRisk,
      WaterWaveDiagnosticSeverity.Warning,
      "$.generator.steepness",
      "High authored steepness is accepted but will be safety-clamped during compilation."
    );
  }
  if (
    [
      waveCount,
      seed,
      randomness,
      minWavelength,
      maxWavelength,
      wavelengthFalloff,
      minAmplitude,
      maxAmplitude,
      amplitudeFalloff,
      dominantWindAngle,
      dominantAngularSpread,
      smallWaveSteepness,
      largeWaveSteepness,
      steepnessFalloff
    ].some((entry) => entry === undefined) ||
    hasErrors(diagnostics)
  ) {
    return undefined;
  }
  return Object.freeze({
    waveCount: waveCount as number,
    seed: seed as number,
    randomness: randomness as number,
    minWavelength: minWavelength as number,
    maxWavelength: maxWavelength as number,
    wavelengthFalloff: wavelengthFalloff as number,
    minAmplitude: minAmplitude as number,
    maxAmplitude: maxAmplitude as number,
    amplitudeFalloff: amplitudeFalloff as number,
    dominantWindAngle: dominantWindAngle as number,
    dominantAngularSpread: dominantAngularSpread as number,
    smallWaveSteepness: smallWaveSteepness as number,
    largeWaveSteepness: largeWaveSteepness as number,
    steepnessFalloff: steepnessFalloff as number
  });
}

export function validateWaterWaveAsset(value: unknown): WaterWaveValidationResult {
  const diagnostics: WaterWaveDiagnostic[] = [];
  if (!isRecord(value)) {
    pushDiagnostic(
      diagnostics,
      WaterWaveDiagnosticCode.InvalidRootType,
      WaterWaveDiagnosticSeverity.Error,
      "$",
      "WaterWaveAsset must be an object."
    );
    return { valid: false, diagnostics };
  }
  if (value.schemaVersion !== WaterWaveSchemaVersion.V1) {
    pushDiagnostic(
      diagnostics,
      WaterWaveDiagnosticCode.UnsupportedSchemaVersion,
      WaterWaveDiagnosticSeverity.Error,
      "$.schemaVersion",
      `Expected WaterWaveAsset schema version ${WaterWaveSchemaVersion.V1}.`
    );
  }
  let decoded: WaterWaveAssetV1 | undefined;
  if (value.model === WaterWaveModel.None) {
    decoded = Object.freeze({
      schemaVersion: WaterWaveSchemaVersion.V1,
      model: WaterWaveModel.None
    });
  } else if (value.model === WaterWaveModel.DirectionalGerstner) {
    const generator = decodeGerstnerGenerator(value.generator, diagnostics);
    if (generator) {
      const gerstnerAsset: DirectionalGerstnerWaterWaveAssetV1 = {
        schemaVersion: WaterWaveSchemaVersion.V1,
        model: WaterWaveModel.DirectionalGerstner,
        generator
      };
      decoded = Object.freeze(gerstnerAsset);
    }
  } else {
    pushDiagnostic(
      diagnostics,
      WaterWaveDiagnosticCode.UnsupportedModel,
      WaterWaveDiagnosticSeverity.Error,
      "$.model",
      "Expected none or directionalGerstner."
    );
  }
  const valid = !hasErrors(diagnostics) && decoded !== undefined;
  return { valid, value: valid ? decoded : undefined, diagnostics: Object.freeze(diagnostics.slice()) };
}
