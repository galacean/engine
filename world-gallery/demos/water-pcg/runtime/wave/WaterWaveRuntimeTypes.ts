import type { Material } from "@galacean/engine-core";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import type { WaterWaveShaderVariant } from "./enums/WaterWaveShaderVariant";

/** Caller-owned output for rest-space Gerstner evaluation. */
export interface WaterWaveSampleOutput {
  displacedX: number;
  displacedY: number;
  displacedZ: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  horizontalVelocityX: number;
  verticalVelocity: number;
  horizontalVelocityZ: number;
  derivativeXX: number;
  derivativeXZ: number;
  derivativeZX: number;
  derivativeZZ: number;
}

export interface WaterWaveMaterialConfig {
  readonly baseColor: string;
  readonly alpha: number;
  readonly waterLevel: number;
  readonly timeScale: number;
  readonly crestIntensity: number;
  readonly surfaceTimeOverride?: number;
}

export interface WaterWaveMaterialState {
  readonly material: Material;
  readonly variant: WaterWaveShaderVariant;
  readonly waveSet: CompiledWaterWaveSet;
}
