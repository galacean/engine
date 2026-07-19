/** Compiler-owned immutable facts consumed by CPU and GPU water-wave paths. */
import type { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import type { WaterWaveDiagnostic } from "../../authoring/wave/WaterWaveTypes";

export interface GerstnerWaveCandidate {
  readonly sourceIndex: number;
  readonly directionX: number;
  readonly directionZ: number;
  readonly amplitude: number;
  readonly wavelength: number;
  readonly waveNumber: number;
  readonly angularFrequency: number;
  readonly steepness: number;
  readonly phase: number;
  readonly energy: number;
}

export interface CompiledGerstnerWave extends GerstnerWaveCandidate {
  readonly horizontalAmplitude: number;
}

export interface ReadonlyWaterWaveBuffer extends Iterable<number> {
  readonly length: number;
  at(index: number): number | undefined;
  toTypedArray(): Float32Array;
}

export interface CompiledWaterWaveSet {
  readonly model: WaterWaveModel;
  readonly quality: WaterQualityTier;
  /** Number of authored waves evaluated by CPU and GPU. */
  readonly activeWaveCount: number;
  /** Fixed unrolled shader capacity; may exceed activeWaveCount and is zero-padded. */
  readonly shaderWaveCount: number;
  readonly waves: readonly CompiledGerstnerWave[];
  readonly packedShaderData: ReadonlyWaterWaveBuffer;
  readonly maxVerticalDisplacement: number;
  readonly maxHorizontalDisplacement: number;
  readonly sourceHash: string;
  readonly diagnostics: readonly WaterWaveDiagnostic[];
}
