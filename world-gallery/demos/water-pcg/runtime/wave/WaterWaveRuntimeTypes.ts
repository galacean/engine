import type {
  Material,
  Texture2D
} from "@galacean/engine-core";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import type { WaterWaveShaderVariant } from "./enums/WaterWaveShaderVariant";
import type {
  ResolvedWaterOpticsTier,
  WaterOpticsTier,
  WaterSurfaceOpticsBindingState
} from "../optics/WaterSurfaceOpticsTypes";
import type { OceanNearshoreStaticBinding } from "../ocean/OceanNearshoreShaderTypes";
import type {
  WaterFoamDebugView,
  WaterTemporalFoamBinding
} from "../interaction/WaterFoamTypes";

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
  /**
   * Optional visual-only world-space detail. Omitted or zero-strength detail allocates and binds no texture.
   * Gameplay surface queries intentionally continue to use the macro Gerstner normal.
   */
  readonly surfaceDetail?: WaterSurfaceDetailConfig;
  /** Optional static nearshore field shared with the Ocean gameplay provider. */
  readonly nearshore?: OceanNearshoreStaticBinding;
  /** Independently gates the dynamic breaker channel without disabling swash. */
  readonly nearshoreBreakerEnabled?: boolean;
  /**
   * Optional bounded temporal-foam texture. Analytic whitecaps remain history-free
   * and are controlled independently so legacy water materials stay unchanged.
   */
  readonly foam?: WaterTemporalFoamBinding;
  /**
   * Optional caller-owned RGB foam breakup mask. The runtime borrows this
   * resource and falls back to its deterministic procedural texture when
   * omitted.
   */
  readonly foamDetail?: WaterFoamDetailTextureBinding;
  readonly analyticWhitecapEnabled?: boolean;
  /** Optional surface-optics shader tier. Experimental compiles through the High optics path. */
  readonly opticsTier?: WaterOpticsTier;
  readonly surfaceTimeOverride?: number;
}

export interface WaterFoamDetailTextureBinding {
  readonly texture: Texture2D;
  readonly ownership: "borrowed";
  readonly resourceBytes: number;
}

export interface WaterSurfaceDetailConfig {
  readonly strength: number;
  readonly scale: number;
  readonly speed: number;
  readonly wind: readonly [number, number];
}

export interface WaterWaveMaterialState {
  readonly material: Material;
  readonly variant: WaterWaveShaderVariant;
  /** Compiled scene-optics path; undefined means the legacy transparent shader. */
  readonly opticsTier?: ResolvedWaterOpticsTier;
  readonly waveSet: CompiledWaterWaveSet;
  /** Fixed shader cost selected from the wave quality variant. */
  readonly surfaceDetailLayerCount?: 0 | 1 | 2 | 3;
  /** Whether this material currently owns a detail-texture binding. */
  readonly surfaceDetailEnabled?: boolean;
  readonly nearshoreEnabled?: boolean;
  readonly nearshoreWaveEnabled?: boolean;
  readonly nearshoreStateEnabled?: boolean;
  readonly nearshoreBreakerEnabled?: boolean;
  readonly foamEnabled?: boolean;
  readonly foamDetailTextureSource?: "none" | "procedural" | "external";
  readonly analyticWhitecapEnabled?: boolean;
  readonly foamDebugView?: WaterFoamDebugView;
  /** Reusable uniform values owned by this material; owns no GPU resources. */
  readonly opticsBindingState: WaterSurfaceOpticsBindingState;
}
