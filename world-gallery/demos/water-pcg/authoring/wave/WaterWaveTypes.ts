/** Versioned authoring contracts for deterministic water-wave generation. */
import type { WaterWaveDiagnosticCode, WaterWaveDiagnosticSeverity } from "./enums/WaterWaveDiagnostic";
import { WaterWaveModel } from "./enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "./enums/WaterWaveSchemaVersion";

/** Directional Gerstner generator values. Distances use metres and angles use radians in the XZ plane. */
export interface GerstnerWaveGeneratorConfig {
  /** Number of deterministic candidates generated before the quality budget is applied. */
  readonly waveCount: number;
  /** Unsigned deterministic PRNG seed. */
  readonly seed: number;
  /** Normalized [0, 1] amount of wavelength, amplitude, direction, and phase variation. */
  readonly randomness: number;
  /** Minimum generated wavelength in metres. */
  readonly minWavelength: number;
  /** Maximum generated wavelength in metres. */
  readonly maxWavelength: number;
  /** Exponent controlling how wavelengths are distributed from minimum to maximum. */
  readonly wavelengthFalloff: number;
  /** Minimum vertical amplitude in metres. */
  readonly minAmplitude: number;
  /** Maximum vertical amplitude in metres. */
  readonly maxAmplitude: number;
  /** Exponent controlling how amplitudes are distributed from minimum to maximum. */
  readonly amplitudeFalloff: number;
  /** Dominant direction in radians, measured in the XZ plane from +X toward +Z. */
  readonly dominantWindAngle: number;
  /** Maximum angular deviation in radians around the dominant direction. */
  readonly dominantAngularSpread: number;
  /** Dimensionless steepness assigned to the shortest generated waves. */
  readonly smallWaveSteepness: number;
  /** Dimensionless steepness assigned to the longest generated waves. */
  readonly largeWaveSteepness: number;
  /** Exponent controlling the transition from small- to large-wave steepness. */
  readonly steepnessFalloff: number;
}

export interface NoneWaterWaveAssetV1 {
  readonly schemaVersion: WaterWaveSchemaVersion.V1;
  readonly model: WaterWaveModel.None;
}

export interface DirectionalGerstnerWaterWaveAssetV1 {
  readonly schemaVersion: WaterWaveSchemaVersion.V1;
  readonly model: WaterWaveModel.DirectionalGerstner;
  readonly generator: GerstnerWaveGeneratorConfig;
}

export type WaterWaveAssetV1 = NoneWaterWaveAssetV1 | DirectionalGerstnerWaterWaveAssetV1;

export interface WaterWaveDiagnostic {
  readonly code: WaterWaveDiagnosticCode;
  readonly severity: WaterWaveDiagnosticSeverity;
  readonly path: string;
  readonly message: string;
}

export interface WaterWaveValidationResult {
  readonly valid: boolean;
  readonly value?: WaterWaveAssetV1;
  readonly diagnostics: readonly WaterWaveDiagnostic[];
}
