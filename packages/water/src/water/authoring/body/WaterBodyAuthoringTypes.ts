/** Versioned, engine-object-free WaterBody authoring contracts. */
import type { WaterSurfaceAppearanceAsset } from "../surface/WaterSurfaceAppearanceTypes";
import type { WaterSurfaceFieldDependencyAssetV2 } from "../surface/WaterSurfaceFieldTypes";
import { WaterSurfaceDepthSource } from "../surface/enums/WaterSurfaceDepthSource";
import type { WaterQualityTier } from "../wave/enums/WaterQualityTier";
import type { WaterSurfaceScattering } from "../optics/WaterSurfaceScattering";

export enum WaterBodySourceSchemaVersion {
  V1 = 1
}

export enum WaterBodyPresetSchemaVersion {
  V1 = 1
}

export enum WaterBodyResourceSchemaVersion {
  V1 = 1
}

export enum WaterSpatialFieldSourceSchemaVersion {
  V1 = 1
}

export enum WaterBodySourceKind {
  GridMask = "grid-mask",
  TerrainRegion = "terrain-region",
  SplineProfile = "spline-profile",
  Polygon = "polygon",
  OceanNearshore = "ocean-nearshore"
}

export type WaterVector2Tuple = readonly [number, number];
export type WaterVector3Tuple = readonly [number, number, number];
export type WaterColorTuple = readonly [number, number, number, number];

export type WaterCapabilityRequirement = "required" | "optional" | "disabled";

export enum WaterBathymetrySourceKind {
  ShoreDistanceProfile = "shore-distance-profile",
  ExplicitBedHeights = "explicit-bed-heights",
  TerrainBedSamples = "terrain-bed-samples"
}

export enum WaterShoreSdfSourceKind {
  WetMask = "wet-mask"
}

export interface ShoreDistanceProfileWaterBathymetrySourceV1 {
  readonly schemaVersion: WaterSpatialFieldSourceSchemaVersion.V1;
  readonly kind: WaterBathymetrySourceKind.ShoreDistanceProfile;
  readonly edgeDepth: number;
  readonly channelDepth: number;
  readonly deepBandMeters: number;
  readonly profileExponent: number;
  readonly maximumDepth: number;
}

/**
 * Absolute world-space bed Y values aligned with the owning source's
 * row-major wet-texel order.
 */
export interface ExplicitBedHeightsWaterBathymetrySourceV1 {
  readonly schemaVersion: WaterSpatialFieldSourceSchemaVersion.V1;
  readonly kind: WaterBathymetrySourceKind.ExplicitBedHeights;
  readonly sampleOrder: "source-wet-texel-order";
  readonly bedHeights: readonly number[];
  readonly maximumDepth: number;
}

/**
 * Detached Terrain samples. This is serialized data, never a live Terrain
 * sampler or texture handle. Values use the full row-major region grid.
 */
export interface TerrainBedSamplesWaterBathymetrySourceV1 {
  readonly schemaVersion: WaterSpatialFieldSourceSchemaVersion.V1;
  readonly kind: WaterBathymetrySourceKind.TerrainBedSamples;
  readonly sampleOrder: "row-major-region-grid";
  readonly resolution: readonly [width: number, height: number];
  readonly bedHeights: readonly number[];
  readonly maximumDepth: number;
  /** Deterministic 16-hex identity of the serialized sample grid. */
  readonly contentHash: string;
}

export type WaterBathymetrySourceV1 =
  | ShoreDistanceProfileWaterBathymetrySourceV1
  | ExplicitBedHeightsWaterBathymetrySourceV1
  | TerrainBedSamplesWaterBathymetrySourceV1;

export interface WetMaskWaterShoreSdfSourceV1 {
  readonly schemaVersion: WaterSpatialFieldSourceSchemaVersion.V1;
  readonly kind: WaterShoreSdfSourceKind.WetMask;
}

export type WaterShoreSdfSourceV1 = WetMaskWaterShoreSdfSourceV1;

/**
 * Serializable, backend-independent declarations for Water-owned spatial
 * facts. Backends may support only a subset and must fail closed otherwise.
 */
export interface WaterSpatialFieldSourcesV1 {
  readonly schemaVersion: WaterSpatialFieldSourceSchemaVersion.V1;
  readonly bathymetry?: WaterBathymetrySourceV1;
  readonly shoreSdf?: WaterShoreSdfSourceV1;
}

export interface WaterBodySourceCapabilitiesV1 {
  readonly localBathymetry: boolean;
  readonly shoreSdf: boolean;
  readonly current: boolean;
}

interface WaterBodySourceBaseV1 {
  readonly schemaVersion: WaterBodySourceSchemaVersion.V1;
  readonly kind: WaterBodySourceKind;
  /**
   * Authoring declaration used for fail-closed requirement validation.
   * Runtime capabilities are still derived from the actual Provider.
   */
  readonly capabilities: WaterBodySourceCapabilitiesV1;
  /** Explicit, serializable generation inputs for Water-owned spatial facts. */
  readonly spatialFields?: WaterSpatialFieldSourcesV1;
}

/**
 * Backend data remains opaque to the common decoder. The selected backend must
 * strictly decode and validate the descriptor before compilation.
 */
export interface GridMaskWaterBodySourceV1 extends WaterBodySourceBaseV1 {
  readonly kind: WaterBodySourceKind.GridMask;
  readonly descriptor: unknown;
}

export interface TerrainRegionWaterBodySourceV1 extends WaterBodySourceBaseV1 {
  readonly kind: WaterBodySourceKind.TerrainRegion;
  /** Resolves only through WaterBodyProviderRegistry. */
  readonly providerId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface SplineProfileWaterBodySourceV1 extends WaterBodySourceBaseV1 {
  readonly kind: WaterBodySourceKind.SplineProfile;
  readonly descriptor: unknown;
}

export interface PolygonWaterBodySourceV1 extends WaterBodySourceBaseV1 {
  readonly kind: WaterBodySourceKind.Polygon;
  readonly verticesXZ: readonly WaterVector2Tuple[];
  readonly waterLevel: number;
  readonly bedHeight?: number;
}

export interface OceanNearshoreWaterBodySourceV1 extends WaterBodySourceBaseV1 {
  readonly kind: WaterBodySourceKind.OceanNearshore;
  readonly descriptor: unknown;
}

export type WaterBodySourceV1 =
  | GridMaskWaterBodySourceV1
  | TerrainRegionWaterBodySourceV1
  | SplineProfileWaterBodySourceV1
  | PolygonWaterBodySourceV1
  | OceanNearshoreWaterBodySourceV1;

export interface WaterBodyCapabilityRequirementsV1 {
  readonly localBathymetry: WaterCapabilityRequirement;
  readonly shoreSdf: WaterCapabilityRequirement;
  readonly current: WaterCapabilityRequirement;
}

/**
 * A pre-registered Quality Plan replacement exposed to development tools.
 *
 * Visual intent remains owned by the active WaterLook. Curated multi-axis
 * profiles must use a distinct API and must never masquerade as Quality tier.
 */
export interface WaterBodyRuntimeVariant {
  readonly id: string;
  readonly label: string;
  readonly tier?: WaterQualityTier;
  readonly qualityPlanId: string;
}

export interface WaterSurfaceAppearanceFeatureFlagsV1 {
  readonly externalNormal: boolean;
  readonly depthTint: boolean;
  readonly coastalAlpha: boolean;
  readonly contactFoam: boolean;
  readonly directSpecular: boolean;
}

export interface WaterAppearancePresetV1 {
  readonly schemaVersion: WaterBodyPresetSchemaVersion.V1;
  readonly id: string;
  readonly appearance: WaterSurfaceAppearanceAsset;
  /** Opt-in V2 field graph. Its presence makes per-effect dependencies authoritative over global depthSource. */
  readonly fieldDependencies?: WaterSurfaceFieldDependencyAssetV2;
  readonly featureFlags: WaterSurfaceAppearanceFeatureFlagsV1;
}

export type WaterReflectionMode = "none" | "probe" | "ssr";

export interface WaterOpticalProfileV1 {
  readonly surfaceScattering?: WaterSurfaceScattering;
  readonly absorptionCoefficient: readonly [number, number, number];
  readonly scatteringColor: readonly [number, number, number];
  readonly scatteringCoefficient: number;
  readonly maximumViewDistance: number;
  readonly indexOfRefraction: number;
  /** Explicit dielectric F0 for authored PBR parity; omitted profiles derive it from IOR. */
  readonly fresnelF0?: number;
  readonly maximumSurfaceOpticalDistance: number;
  readonly refractionStrength: number;
  readonly roughness: number;
  readonly reflectionIntensity: number;
}

export interface WaterOpticsPresetV1 {
  readonly schemaVersion: WaterBodyPresetSchemaVersion.V1;
  readonly id: string;
  readonly depthSource: WaterSurfaceDepthSource;
  readonly profile: WaterOpticalProfileV1;
  readonly refractionEnabled: boolean;
  readonly caustics: boolean;
}

export type WaterOpaqueDownsampling = "none" | "2x" | "4x";

export interface WaterSpatialFieldQualityBudgetV1 {
  readonly maximumHorizontalError: number;
  readonly maximumDepthError: number;
  readonly maximumGpuDepthDecodeError: number;
  readonly maximumGpuShoreDecodeError: number;
  readonly maximumAtlasPixels: number;
}

export type WaterResourceAssetKind = "texture" | "mask" | "flow-map";
export type WaterResourceOwnership = "shared" | "instance";
export type WaterResourceFallbackPolicy = "required" | "optional";

export interface WaterResourceAssetDescriptorV1 {
  readonly schemaVersion: WaterBodyResourceSchemaVersion.V1;
  readonly id: string;
  readonly kind: WaterResourceAssetKind;
  readonly contentHash: string;
  readonly ownership: WaterResourceOwnership;
  readonly fallbackPolicy: WaterResourceFallbackPolicy;
}
