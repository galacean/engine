import type { TextureCube } from "@galacean/engine-core";
import type { Vector3, Vector4 } from "@galacean/engine-math";
import type { WaterOpticalColor, WaterOpticalProfile, WaterOpticalRgb } from "./WaterOpticalProfile";
import type { WaterSurfaceScattering } from "./WaterOpticalProfile";
import type { WaterReflectionSource } from "./WaterReflectionPolicy";
import type { WaterReflectionBinding, WaterReflectionComposition } from "./WaterReflectionService";
import type { WaterReflectionPolicyMode } from "../../authoring/optics/WaterReflectionPolicy";
import type {
  WaterReflectionFilterSampleCount,
  WaterReflectionSamplingConfig,
  WaterReflectionSamplingSettings
} from "../../authoring/optics/WaterReflectionSampling";
import type {
  WaterEnvironmentReflectionColorSpace,
  WaterEnvironmentReflectionVector3
} from "./WaterEnvironmentReflectionTypes";

export type { WaterReflectionBinding } from "./WaterReflectionService";

/** P1 surface-optics tiers. Experimental deliberately resolves through the High shader path. */
export type WaterOpticsTier = "medium" | "high" | "experimental";
export type ResolvedWaterOpticsTier = Exclude<WaterOpticsTier, "experimental">;

/**
 * Shared debug values. Numeric values 0-22 are frozen by the P0 Heightfield shader ABI.
 * Surface Appearance V1 appends 23-29; reflection composition appends 30 and 33.
 * Removed diagnostics retain their numeric holes so existing values stay ABI-compatible.
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
  EffectiveRoughness = 29,
  EnvironmentReflection = 30,
  CompositeReflection = 33
}

/** One complete, caller-owned input snapshot. Applying the same mutable object twice still performs every write. */
export interface WaterSurfaceOpticsBinding {
  readonly tier: WaterOpticsTier;
  readonly opticalProfile: WaterOpticalProfile;
  readonly refractionEnabled: boolean;
  readonly reflection: Readonly<WaterReflectionBinding> | undefined;
  readonly reflectionSampling?: WaterReflectionSamplingConfig;
  readonly debugView: WaterOpticsDebugView | number;
}

/** Cached mutable values owned by one material adapter. This state owns no GPU resources. */
export interface WaterSurfaceOpticsBindingState {
  readonly surfaceScatteringCoefficient: Vector3;
  readonly opticalAbsorption: Vector3;
  readonly opticalScatteringColor: Vector3;
  /** cos/sin of inverse Y rotation, exposure*intensity, and source-sRGB flag. */
  readonly environmentReflectionParameters: Vector4;
  readonly secondaryEnvironmentReflectionParameters: Vector4;
  /** xyz probe capture position; w enables finite box projection. */
  readonly environmentReflectionProbePosition: Vector4;
  readonly environmentReflectionBoxMinimum: Vector4;
  readonly environmentReflectionBoxMaximum: Vector4;
  readonly secondaryEnvironmentReflectionProbePosition: Vector4;
  readonly secondaryEnvironmentReflectionBoxMinimum: Vector4;
  readonly secondaryEnvironmentReflectionBoxMaximum: Vector4;
  /** Finite Local Probe state, independent from the distant-environment transition lobes above. */
  readonly localEnvironmentReflectionParameters: Vector4;
  readonly localEnvironmentReflectionProbePosition: Vector4;
  readonly localEnvironmentReflectionBoxMinimum: Vector4;
  readonly localEnvironmentReflectionBoxMaximum: Vector4;
  /** Stable caller-owned profile readback; its values update in place on every apply. */
  readonly opticalProfileReadback: Readonly<ResolvedWaterOpticalProfile>;
  /** Stable caller-owned reflection readback; its values update in place on every apply. */
  readonly reflectionReadback: Readonly<WaterSurfaceOpticsReflectionReadback>;
  /** Stable caller-owned aggregate readback; its values update in place on every apply. */
  readonly bindingReadback: Readonly<WaterSurfaceOpticsBindingReadback>;
}

export interface ResolvedWaterOpticalProfile {
  readonly surfaceScattering?: WaterSurfaceScattering;
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
  | "water-optics-environment-metadata-invalid";

export type WaterSurfaceOpticsTierFallbackReason = "water-optics-experimental-resolved-high";

export interface WaterSurfaceOpticsReflectionReadback extends WaterReflectionSamplingSettings {
  readonly requestedTier: WaterOpticsTier;
  readonly resolvedTier: ResolvedWaterOpticsTier;
  readonly tierFallbackReason?: WaterSurfaceOpticsTierFallbackReason;
  readonly requestedSource: WaterReflectionSource;
  readonly bindingResolvedSource: WaterReflectionSource;
  readonly effectiveSource: WaterReflectionSource;
  readonly requestedMode: WaterReflectionPolicyMode;
  readonly bindingResolvedMode: WaterReflectionPolicyMode;
  readonly effectiveMode: WaterReflectionPolicyMode;
  readonly fallbackReason?: WaterSurfaceOpticsBindingFallbackReason;
  readonly composition: WaterReflectionComposition;
  readonly probeTexture?: TextureCube;
  readonly secondaryProbeTexture?: TextureCube;
  readonly localProbeTexture?: TextureCube;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly filterSampleCount: WaterReflectionFilterSampleCount;
  readonly environmentProviderId?: string;
  readonly environmentRevision: number;
  readonly environmentOwnership: "borrowed" | "unavailable";
  readonly environmentRotationDegrees: number;
  readonly environmentExposure: number;
  readonly environmentIntensity: number;
  readonly environmentColorSpace: WaterEnvironmentReflectionColorSpace;
  readonly environmentHDR: boolean;
  readonly environmentMaximumMipLevel: number;
  readonly secondaryEnvironmentAvailable: boolean;
  readonly secondaryEnvironmentWeight: number;
  readonly secondaryEnvironmentMaximumMipLevel: number;
  readonly secondaryEnvironmentRotationDegrees: number;
  readonly secondaryEnvironmentExposure: number;
  readonly secondaryEnvironmentIntensity: number;
  readonly secondaryEnvironmentColorSpace: WaterEnvironmentReflectionColorSpace;
  readonly secondaryEnvironmentProjectionMode: "infinite" | "box";
  readonly secondaryEnvironmentProbePosition: WaterEnvironmentReflectionVector3;
  readonly secondaryEnvironmentBoxMinimum: WaterEnvironmentReflectionVector3;
  readonly secondaryEnvironmentBoxMaximum: WaterEnvironmentReflectionVector3;
  readonly localEnvironmentProviderId?: string;
  readonly localEnvironmentRevision: number;
  readonly localEnvironmentAvailable: boolean;
  readonly localEnvironmentMaximumMipLevel: number;
  readonly localEnvironmentRotationDegrees: number;
  readonly localEnvironmentExposure: number;
  readonly localEnvironmentIntensity: number;
  readonly localEnvironmentColorSpace: WaterEnvironmentReflectionColorSpace;
  readonly localEnvironmentProjectionMode: "infinite" | "box";
  readonly localEnvironmentProbePosition: WaterEnvironmentReflectionVector3;
  readonly localEnvironmentBoxMinimum: WaterEnvironmentReflectionVector3;
  readonly localEnvironmentBoxMaximum: WaterEnvironmentReflectionVector3;
  readonly environmentProjectionMode: "infinite" | "box";
  readonly environmentProbePosition: WaterEnvironmentReflectionVector3;
  readonly environmentBoxMinimum: WaterEnvironmentReflectionVector3;
  readonly environmentBoxMaximum: WaterEnvironmentReflectionVector3;
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
