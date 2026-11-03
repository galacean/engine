import { registerRiverDropResources } from "../../authoring/river/FarmlandsDropLook";
import { LAKE_DROP_LOOK } from "./LakeDropLook";
import { createWaterReflectionPolicyPresetV1 } from "../../authoring/optics/WaterReflectionPolicyPreset";
import { createWaterReflectionPresentationPolicy } from "../../authoring/optics/WaterReflectionPolicy";
import { createWaterLookPresetV1 } from "../../authoring/surface/WaterLookPreset";
import { createWaterRenderStatePresetV1 } from "../../authoring/surface/WaterRenderStatePreset";
import {
  WaterBodyPresetSchemaVersion,
  type WaterSpatialFieldQualityBudgetV1
} from "../../authoring/body/WaterBodyAuthoringTypes";
import { type HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import {
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceDepthResponseModelV2
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { WaterFieldSemantic } from "../../authoring/surface/WaterSurfaceFieldTypes";
import { WaterSurfaceDepthSource } from "../../authoring/surface/enums/WaterSurfaceDepthSource";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { HEIGHTFIELD_WATER_AGGREGATION_SCALE } from "../../compiler/heightfield/constants";
import { WaterBodyAssetRegistry } from "../../runtime/body/WaterBodyAssetRegistry";
import {
  LAKE_LOCAL_LOW_SURFACE_APPEARANCE_V2_ASSET,
  LAKE_LOCAL_LOW_SURFACE_FIELDS_V2,
  LAKE_LOCAL_MEDIUM_SURFACE_APPEARANCE_V2_ASSET,
  LAKE_LOCAL_MEDIUM_SURFACE_FIELDS_V2
} from "./LakeLocalBathymetryAppearanceV2";
import { LAKE_SHOWCASE_OPTICAL_PROFILE } from "./LakeShowcaseOpticalProfile";
import { LAKE_SURFACE_APPEARANCE_V2_ASSET } from "./LakeSurfaceAppearanceV2";
import { LAKE_SURFACE_FIELD_DEPENDENCIES_V2 } from "./LakeSurfaceFieldDependencies";
import { LAKE_WATER_OPTICAL_PROFILE, LAKE_WATER_REFLECTION_SAMPLING } from "./LakeWaterDefaults";
import { LAKE_NORMAL_RESOURCE } from "../../resources/lake/LakeNormalAssetIdentity";

export const LAKE_HYBRID_APPEARANCE_PRESET_ID = "grasslands-hybrid-surface-appearance-v2";
export const LAKE_HYBRID_OPTICS_PRESET_ID = "grasslands-hybrid-optics-high-v2";
export const LAKE_TERRAIN_OPTICS_PRESET_ID = "grasslands-terrain-optics-v1";
export const LAKE_LOCAL_OPTICS_LOW_PRESET_ID = "grasslands-local-bathymetry-optics-low-v1";
export const LAKE_LOCAL_OPTICS_MEDIUM_PRESET_ID = "grasslands-local-bathymetry-optics-medium-v1";
export const LAKE_WATER_LOOK_PRESET_ID = "lake-water-look-v1";
export const LAKE_LOW_WATER_LOOK_PRESET_ID = "lake-low-water-look-v1";
export const LAKE_MEDIUM_WATER_LOOK_PRESET_ID = "lake-medium-water-look-v1";
export const LAKE_WATER_REFLECTION_POLICY_PRESET_ID = "grasslands-reflection-policy-v1";
export const LAKE_WATER_RENDER_STATE_PRESET_ID = "grasslands-render-state-v1";
export const LAKE_LOCAL_LOW_APPEARANCE_V2_PRESET_ID = "grasslands-local-low-appearance-v2";
export const LAKE_LOCAL_MEDIUM_APPEARANCE_V2_PRESET_ID = "grasslands-local-medium-appearance-v2";

/** Integrated World and Seed World share SSR with Environment/IBL fallback. */
export const LAKE_SCENE_REFLECTION_POLICY = createWaterReflectionPresentationPolicy("ssr");

function assertSurfaceFieldAppearance(): void {
  const appearance = LAKE_SURFACE_APPEARANCE_V2_ASSET;
  if (
    appearance.schemaVersion !== WaterSurfaceAppearanceSchemaVersion.V2 ||
    appearance.depthResponse.model === WaterSurfaceDepthResponseModelV2.CompositeExponential ||
    appearance.depthResponse.field !== WaterFieldSemantic.VerticalDepth ||
    appearance.boundaryEffects.find(({ id }) => id === "coastal-alpha")?.field !== WaterFieldSemantic.SceneEyeDepth ||
    appearance.boundaryEffects.find(({ id }) => id === "contact-foam")?.field !== WaterFieldSemantic.ObstacleContact
  ) {
    throw new Error("Grasslands High requires vertical-depth color and explicit scene-boundary field semantics.");
  }
}

function registerLakeAppearance(assets: WaterBodyAssetRegistry): void {
  assertSurfaceFieldAppearance();
  assets.registerResource(LAKE_NORMAL_RESOURCE);
  assets.registerAppearancePreset({
    schemaVersion: WaterBodyPresetSchemaVersion.V1,
    id: LAKE_HYBRID_APPEARANCE_PRESET_ID,
    appearance: LAKE_SURFACE_APPEARANCE_V2_ASSET,
    fieldDependencies: LAKE_SURFACE_FIELD_DEPENDENCIES_V2,
    featureFlags: {
      externalNormal: true,
      depthTint: true,
      coastalAlpha: true,
      contactFoam: true,
      directSpecular: true
    }
  });
  assets.registerAppearancePreset({
    schemaVersion: WaterBodyPresetSchemaVersion.V1,
    id: LAKE_LOCAL_LOW_APPEARANCE_V2_PRESET_ID,
    appearance: LAKE_LOCAL_LOW_SURFACE_APPEARANCE_V2_ASSET,
    fieldDependencies: LAKE_LOCAL_LOW_SURFACE_FIELDS_V2,
    featureFlags: {
      externalNormal: true,
      depthTint: true,
      coastalAlpha: true,
      contactFoam: true,
      directSpecular: true
    }
  });
  assets.registerAppearancePreset({
    schemaVersion: WaterBodyPresetSchemaVersion.V1,
    id: LAKE_LOCAL_MEDIUM_APPEARANCE_V2_PRESET_ID,
    appearance: LAKE_LOCAL_MEDIUM_SURFACE_APPEARANCE_V2_ASSET,
    fieldDependencies: LAKE_LOCAL_MEDIUM_SURFACE_FIELDS_V2,
    featureFlags: {
      externalNormal: true,
      depthTint: true,
      coastalAlpha: true,
      contactFoam: true,
      directSpecular: true
    }
  });
}

export function lakeOpticsPresetIdForQuality(tier: WaterQualityTier): string {
  switch (tier) {
    case WaterQualityTier.Low:
      return LAKE_LOCAL_OPTICS_LOW_PRESET_ID;
    case WaterQualityTier.Medium:
      return LAKE_LOCAL_OPTICS_MEDIUM_PRESET_ID;
    case WaterQualityTier.High:
      return LAKE_HYBRID_OPTICS_PRESET_ID;
  }
}

export function lakeLookPresetIdForQuality(tier: WaterQualityTier): string {
  switch (tier) {
    case WaterQualityTier.Low:
      return LAKE_LOW_WATER_LOOK_PRESET_ID;
    case WaterQualityTier.Medium:
      return LAKE_MEDIUM_WATER_LOOK_PRESET_ID;
    case WaterQualityTier.High:
      return LAKE_WATER_LOOK_PRESET_ID;
  }
}

export function registerLakeOptics(assets: WaterBodyAssetRegistry, tier: WaterQualityTier): string {
  const id = lakeOpticsPresetIdForQuality(tier);
  const optical = LAKE_SHOWCASE_OPTICAL_PROFILE;
  assets.registerOpticsPreset({
    schemaVersion: WaterBodyPresetSchemaVersion.V1,
    id,
    depthSource:
      tier === WaterQualityTier.High
        ? WaterSurfaceDepthSource.HybridOptionalSceneDepth
        : WaterSurfaceDepthSource.LocalBathymetry,
    profile: {
      absorptionCoefficient: optical.absorptionCoefficient,
      scatteringColor: optical.scatteringColor,
      scatteringCoefficient: optical.scatteringCoefficient,
      maximumViewDistance: optical.maximumViewDistance,
      indexOfRefraction: optical.indexOfRefraction ?? 1.333,
      fresnelF0: optical.fresnelF0,
      maximumSurfaceOpticalDistance: optical.maximumSurfaceOpticalDistance ?? 64,
      refractionStrength: optical.refractionStrength ?? 1,
      roughness: optical.roughness ?? 0,
      reflectionIntensity: optical.reflectionIntensity ?? 1
    },
    refractionEnabled: tier !== WaterQualityTier.Low,
    caustics: false
  });
  return id;
}

function registerLakeTerrainOptics(assets: WaterBodyAssetRegistry): void {
  assets.registerOpticsPreset({
    schemaVersion: WaterBodyPresetSchemaVersion.V1,
    id: LAKE_TERRAIN_OPTICS_PRESET_ID,
    depthSource: WaterSurfaceDepthSource.HybridOptionalSceneDepth,
    profile: LAKE_WATER_OPTICAL_PROFILE,
    refractionEnabled: true,
    caustics: false
  });
}

function registerCanonicalLakeLook(assets: WaterBodyAssetRegistry): void {
  // Only River bodies with explicit drops lease these existing textures.
  registerRiverDropResources(assets);
  assets.registerReflectionPolicyPreset(
    createWaterReflectionPolicyPresetV1(LAKE_WATER_REFLECTION_POLICY_PRESET_ID, LAKE_SCENE_REFLECTION_POLICY)
  );
  assets.registerRenderStatePreset(
    createWaterRenderStatePresetV1({
      id: LAKE_WATER_RENDER_STATE_PRESET_ID,
      depthWriteEnabled: true,
      queue: "transparent",
      priorityOffset: 0,
      cullMode: "off",
      blendMode: "alpha"
    })
  );
  assets.registerLookPreset(
    createWaterLookPresetV1({
      id: LAKE_WATER_LOOK_PRESET_ID,
      riverDrops: LAKE_DROP_LOOK,
      appearanceAssetId: LAKE_SURFACE_APPEARANCE_V2_ASSET.id,
      opticalProfileId: LAKE_TERRAIN_OPTICS_PRESET_ID,
      reflectionPolicyId: LAKE_WATER_REFLECTION_POLICY_PRESET_ID,
      renderStatePresetId: LAKE_WATER_RENDER_STATE_PRESET_ID,
      reflectionSampling: LAKE_WATER_REFLECTION_SAMPLING,
      environmentResponse: {
        surfaceNormalVarianceToRoughness: 0
      }
    })
  );
}

/** Canonical Lake Look shared by Gallery, Integrated World and SeedWorld; callers own Quality Plans. */
export function registerLakeWaterLook(assets: WaterBodyAssetRegistry): void {
  registerLakeAppearance(assets);
  registerLakeTerrainOptics(assets);
  registerCanonicalLakeLook(assets);
}

export function createLakeSpatialFieldBudget(
  descriptor: HeightfieldWaterDescriptorV1,
  tier: WaterQualityTier = WaterQualityTier.High,
  additionalDepth = 0,
  minimumDepthCapacity = 0
): Readonly<WaterSpatialFieldQualityBudgetV1> {
  const [cellSizeX, cellSizeZ] = descriptor.grid.cellSizeXZ;
  const bedHeights = descriptor.bedHeights;
  if (!bedHeights || bedHeights.length !== descriptor.surfaceHeights.length) {
    throw new Error("Grasslands LocalBathymetry requires Water-owned bed heights matching the surface grid.");
  }
  let maximumDepth = 0;
  for (let index = 0; index < descriptor.surfaceHeights.length; index++) {
    maximumDepth = Math.max(maximumDepth, descriptor.surfaceHeights[index] - bedHeights[index]);
  }
  if (descriptor.bedTerrain && descriptor.lakeBoundary) {
    // The atlas also samples the canonical Number-valued bed and water level, before Float32 rounding.
    // Bilinear background and fixed refinement triangles stay within their vertex height ranges.
    const level = descriptor.lakeBoundary.waterLevel;
    for (const grid of [descriptor.bedTerrain, ...(descriptor.bedTerrain.refinements ?? [])])
      for (const bed of grid.heights) maximumDepth = Math.max(maximumDepth, level - bed);
  }
  const signedDistanceRange = Math.max(
    1,
    descriptor.spatialField.signedDistanceRange,
    Math.max(cellSizeX, cellSizeZ) * HEIGHTFIELD_WATER_AGGREGATION_SCALE[tier] * 2
  );
  return Object.freeze({
    maximumHorizontalError: Math.hypot(cellSizeX, cellSizeZ) * 0.5,
    maximumDepthError: 0,
    maximumGpuDepthDecodeError: (Math.max(maximumDepth, minimumDepthCapacity) + additionalDepth) / 510,
    maximumGpuShoreDecodeError: signedDistanceRange / 255,
    maximumAtlasPixels: descriptor.grid.width * descriptor.grid.height
  });
}
