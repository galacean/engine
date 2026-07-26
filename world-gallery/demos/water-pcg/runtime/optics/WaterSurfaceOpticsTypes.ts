import type { Texture2D, TextureCube } from "@galacean/engine-core";
import type { Matrix, Vector3, Vector4 } from "@galacean/engine-math";
import type { WaterOpticalColor, WaterOpticalProfile, WaterOpticalRgb } from "./WaterOpticalProfile";
import type { WaterReflectionSource } from "./WaterReflectionPolicy";
import type { WaterReflectionBinding } from "./WaterReflectionService";

export type { WaterReflectionBinding } from "./WaterReflectionService";

/** P1 surface-optics tiers. Experimental deliberately resolves through the High shader path. */
export type WaterOpticsTier = "medium" | "high" | "experimental";
export type ResolvedWaterOpticsTier = Exclude<WaterOpticsTier, "experimental">;

/**
 * Shared debug values. Numeric values 0-22 are frozen by the P0 Heightfield shader ABI.
 * Surface Appearance V1 appends 23-29; future views must append instead of inserting or renumbering.
 */
export enum WaterOpticsDebugView {
  Final = 0,
  BaseHeight = 1,
  BaseNormal = 2,
  SignedDistance = 3,
  Depth = 4,
  Flow = 5,
  WaveDisplacement = 6,
  CenteredOpaqueColor = 7,
  DisplacedOpaqueColor = 8,
  RefractionUvDelta = 9,
  OpticalDepth = 10,
  DepthContinuity = 11,
  SampleValidity = 12,
  Fresnel = 13,
  ShaderCompositedColor = 14,
  SurfaceAlpha = 15,
  ReflectionSource = 16,
  PlanarUv = 17,
  ClipSide = 18,
  RefractionAmount = 19,
  RefractionGates = 20,
  ReflectionColor = 21,
  NormalDotView = 22,
  DetailNormal = 23,
  SceneDepthDelta = 24,
  DepthTint = 25,
  ContactFoam = 26,
  CoastalAlpha = 27,
  DirectSpecular = 28,
  EffectiveRoughness = 29
}

export type WaterPlanarFilterSampleCount = 1 | 5;

export interface WaterSurfaceOpticsReflectionSamplingSettings {
  /** UV displacement per unit of tangent-space micro-normal delta. */
  readonly distortionStrength: number;
  /** Width of the analytic-sky transition measured in planar render-target texels. */
  readonly edgeFadeTexels: number;
  /** Smallest positive homogeneous clip W accepted by the planar projection. */
  readonly minimumClipW: number;
  /** Camera-to-local-plane distance where planar reflection starts fading in. */
  readonly planeDistanceFadeStart: number;
  /** Camera-to-local-plane distance where planar reflection reaches full weight. */
  readonly planeDistanceFadeEnd: number;
  /** Base-normal view cosine where planar reflection starts fading in. */
  readonly viewAngleFadeStart: number;
  /** Base-normal view cosine where planar reflection reaches full weight. */
  readonly viewAngleFadeEnd: number;
  /** Maximum High cross-filter radius, in render-target texels, at roughness one. */
  readonly roughnessFootprintTexels: number;
  /** High-only opt-in filter. Medium is always resolved to one bilinear sample. */
  readonly highFilterSampleCount: WaterPlanarFilterSampleCount;
}

export type WaterSurfaceOpticsReflectionSamplingConfig = Partial<WaterSurfaceOpticsReflectionSamplingSettings>;

/** One complete, caller-owned input snapshot. Applying the same mutable object twice still performs every write. */
export interface WaterSurfaceOpticsBinding {
  readonly tier: WaterOpticsTier;
  readonly opticalProfile: WaterOpticalProfile;
  readonly refractionEnabled: boolean;
  readonly reflection: Readonly<WaterReflectionBinding> | undefined;
  readonly reflectionSampling?: WaterSurfaceOpticsReflectionSamplingConfig;
  readonly debugView: WaterOpticsDebugView | number;
}

/** Cached mutable values owned by one material adapter. This state owns no GPU resources. */
export interface WaterSurfaceOpticsBindingState {
  readonly opticalAbsorption: Vector3;
  readonly opticalScatteringColor: Vector3;
  readonly reflectionTextureSize: Vector4;
  readonly reflectionSamplingParameters: Vector4;
  readonly reflectionFadeParameters: Vector4;
  readonly reflectionIdentityViewProjection: Matrix;
  /** Stable caller-owned profile readback; its values update in place on every apply. */
  readonly opticalProfileReadback: Readonly<ResolvedWaterOpticalProfile>;
  /** Stable caller-owned reflection readback; its values update in place on every apply. */
  readonly reflectionReadback: Readonly<WaterSurfaceOpticsReflectionReadback>;
  /** Stable caller-owned aggregate readback; its values update in place on every apply. */
  readonly bindingReadback: Readonly<WaterSurfaceOpticsBindingReadback>;
}

export interface ResolvedWaterOpticalProfile {
  readonly absorptionCoefficient: WaterOpticalRgb;
  readonly scatteringColor: WaterOpticalRgb;
  readonly scatteringCoefficient: number;
  readonly maximumViewDistance: number;
  readonly indexOfRefraction: number;
  readonly fresnelF0: number;
  readonly maximumSurfaceOpticalDistance: number;
  readonly refractionStrength: number;
  readonly roughness: number;
  readonly reflectionIntensity: number;
}

export type WaterSurfaceOpticsBindingFallbackReason =
  | NonNullable<WaterReflectionBinding["fallbackReason"]>
  | "water-optics-probe-texture-unavailable"
  | "water-optics-planar-texture-unavailable"
  | "water-optics-planar-texture-size-invalid"
  | "water-optics-planar-view-projection-unavailable"
  | "water-optics-planar-view-projection-invalid";

export type WaterSurfaceOpticsTierFallbackReason = "water-optics-experimental-resolved-high";

export interface WaterSurfaceOpticsReflectionReadback extends WaterSurfaceOpticsReflectionSamplingSettings {
  readonly requestedTier: WaterOpticsTier;
  readonly resolvedTier: ResolvedWaterOpticsTier;
  readonly tierFallbackReason?: WaterSurfaceOpticsTierFallbackReason;
  readonly requestedSource: WaterReflectionSource;
  readonly bindingResolvedSource: WaterReflectionSource;
  readonly effectiveSource: WaterReflectionSource;
  readonly fallbackReason?: WaterSurfaceOpticsBindingFallbackReason;
  readonly probeTexture?: TextureCube;
  readonly planarTexture?: Texture2D;
  readonly planarViewProjection?: Readonly<Matrix>;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly filterSampleCount: WaterPlanarFilterSampleCount;
}

export interface WaterSurfaceOpticsBindingReadback extends WaterSurfaceOpticsReflectionReadback {
  readonly opticalProfile: Readonly<ResolvedWaterOpticalProfile>;
  readonly refractionEnabled: boolean;
  readonly debugView: WaterOpticsDebugView;
}

/** Caller-owned output for the CPU reference implementation of surface optics. */
export interface WaterSurfaceOpticsResult {
  /** Clamped optical distance in metres used by the evaluation. */
  opticalDistance: number;
  /** Normal-incidence dielectric reflectance derived from the index of refraction. */
  fresnelF0: number;
  /** Schlick Fresnel reflectance at the supplied normal/view angle. */
  fresnel: number;
  /** Finite, non-negative UV-displacement multiplier resolved from the profile. */
  refractionStrength: number;
  /** Finite reflection roughness resolved to the normalized [0, 1] range. */
  roughness: number;
  /** Finite, non-negative reflected-radiance multiplier resolved from the profile. */
  reflectionIntensity: number;
  /** Per-channel Beer-Lambert transmittance. */
  transmittance: WaterOpticalColor;
  /** Per-channel in-scattering contribution. */
  scattering: WaterOpticalColor;
  /** Refracted source after absorption and in-scattering, before Fresnel. */
  transmittedColor: WaterOpticalColor;
  /** Final transmitted plus reflected linear-space colour. */
  finalColor: WaterOpticalColor;
}
