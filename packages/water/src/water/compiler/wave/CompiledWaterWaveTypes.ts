/** Compiler-owned immutable facts consumed by CPU and GPU water-wave paths. */
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
  readonly byteLength: number;
  at(index: number): number | undefined;
  borrowTypedArray(): Float32Array;
  toTypedArray(): Float32Array;
}

export interface CompiledWaterWaveSet {
  readonly model: WaterWaveModel;
  /** Number of quality-independent physical waves evaluated by CPU and GPU. */
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
