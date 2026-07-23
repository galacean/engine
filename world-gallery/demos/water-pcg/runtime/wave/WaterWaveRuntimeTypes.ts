import type { Material } from "@galacean/engine-core";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import type { WaterWaveShaderVariant } from "./enums/WaterWaveShaderVariant";
import type {
  ResolvedWaterOpticsTier,
  WaterOpticsTier,
  WaterSurfaceOpticsBindingState
} from "../optics/WaterSurfaceOpticsTypes";

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
  readonly reflectionIntensity?: number;
  /** Optional surface-optics shader tier. Experimental compiles through the High optics path. */
  readonly opticsTier?: WaterOpticsTier;
  readonly surfaceTimeOverride?: number;
}

export interface WaterWaveMaterialState {
  readonly material: Material;
  readonly variant: WaterWaveShaderVariant;
  /** Compiled scene-optics path; undefined means the legacy transparent shader. */
  readonly opticsTier?: ResolvedWaterOpticsTier;
  readonly waveSet: CompiledWaterWaveSet;
  /** Reusable uniform values owned by this material; owns no GPU resources. */
  readonly opticsBindingState: WaterSurfaceOpticsBindingState;
}
