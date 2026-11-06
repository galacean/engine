import {
  createWaterBodyAsset,
  createWaterBodyInstance,
  type WaterBodyInstance,
  createWaterQualityPlanV2,
  createWaterLookPresetV1,
  DEFAULT_WATER_LOOK_RUNTIME_INPUT,
  WaterBodySourceKind,
  WaterBodySourceSchemaVersion,
  type GridMaskWaterBodySourceV1,
  type WaterResourceAssetDescriptorV1,
  createHeightfieldWaterBodySourceDescriptorV1,
  createHeightfieldWaterRepresentationDataV1,
  type HeightfieldWaterDescriptorV1,
  WaterQualityTier
} from "@galacean/engine-water/water/index";

import { hashStableValue } from "@galacean/engine-water/water/compiler/index";
import { WaterBodyAssetRegistry } from "@galacean/engine-water/water/runtime/index";
import {
  LAKE_LOCAL_LOW_SURFACE_APPEARANCE_V2_ASSET,
  LAKE_LOCAL_MEDIUM_SURFACE_APPEARANCE_V2_ASSET,
  LAKE_SURFACE_APPEARANCE_V2_ASSET,
  LAKE_WATER_LOOK_PRESET_ID,
  LAKE_WATER_REFLECTION_POLICY_PRESET_ID,
  LAKE_WATER_RENDER_STATE_PRESET_ID,
  lakeOpticsPresetIdForQuality,
  lakeLookPresetIdForQuality,
  registerLakeOptics,
  registerLakeWaterLook,
  createLakeSpatialFieldBudget
} from "@galacean/engine-water/water/presets/lake/index";

import { LAKE_NORMAL_RESOURCE } from "@galacean/engine-water/water/resources/lake/index";

export const GRASSLANDS_STYLIZED_WATER_ASSET_ID = "grasslands-stylized-lake-water-v1";
export const GRASSLANDS_STYLIZED_WATER_INSTANCE_ID = "grasslands-lake-water";
export const GRASSLANDS_STYLIZED_LOW_QUALITY_PRESET_ID = "grasslands-stylized-low-v1";
export const GRASSLANDS_STYLIZED_MEDIUM_QUALITY_PRESET_ID = "grasslands-stylized-medium-v1";
export const GRASSLANDS_STYLIZED_HIGH_QUALITY_PRESET_ID = "grasslands-stylized-high-v1";

export interface GrasslandsStylizedWaterBodyAuthoring {
  readonly source: GridMaskWaterBodySourceV1;
  readonly instance: WaterBodyInstance;
  readonly normalResource: WaterResourceAssetDescriptorV1;
}

export function grasslandsQualityPresetIdForQuality(tier: WaterQualityTier): string {
  switch (tier) {
    case WaterQualityTier.Low:
      return GRASSLANDS_STYLIZED_LOW_QUALITY_PRESET_ID;
    case WaterQualityTier.Medium:
      return GRASSLANDS_STYLIZED_MEDIUM_QUALITY_PRESET_ID;
    case WaterQualityTier.High:
      return GRASSLANDS_STYLIZED_HIGH_QUALITY_PRESET_ID;
  }
}

/** Extra depth admitted by the Gallery water-level editor, in metres. */
export const GRASSLANDS_LAKE_WATER_LEVEL_EDIT_RANGE = 0.4;
export const GRASSLANDS_LAKE_MAX_BASIN_DEPTH = 8;

function registerGrasslandsStylizedLook(
  assets: WaterBodyAssetRegistry,
  descriptor: HeightfieldWaterDescriptorV1
): void {
  registerLakeWaterLook(assets);
  for (const tier of Object.values(WaterQualityTier)) {
    const appearanceAssetId =
      tier === WaterQualityTier.High
        ? LAKE_SURFACE_APPEARANCE_V2_ASSET.id
        : tier === WaterQualityTier.Medium
          ? LAKE_LOCAL_MEDIUM_SURFACE_APPEARANCE_V2_ASSET.id
          : LAKE_LOCAL_LOW_SURFACE_APPEARANCE_V2_ASSET.id;
    if (tier !== WaterQualityTier.High) {
      assets.registerLookPreset(
        createWaterLookPresetV1({
          ...DEFAULT_WATER_LOOK_RUNTIME_INPUT,
          id: lakeLookPresetIdForQuality(tier),
          appearanceAssetId,
          opticalProfileId: lakeOpticsPresetIdForQuality(tier),
          reflectionPolicyId: LAKE_WATER_REFLECTION_POLICY_PRESET_ID,
          renderStatePresetId: LAKE_WATER_RENDER_STATE_PRESET_ID
        })
      );
    }
    assets.registerQualityPlan(
      createWaterQualityPlanV2({
        id: grasslandsQualityPresetIdForQuality(tier),
        geometry: tier,
        surfaceShading: tier,
        sceneFields:
          tier === WaterQualityTier.High
            ? "scene-color-depth"
            : tier === WaterQualityTier.Medium
              ? "scene-color"
              : "local-only",
        reflectionBudget: { environment: true, screenSpace: tier === WaterQualityTier.High },
        query: "dense",
        spatialField: createLakeSpatialFieldBudget(
          descriptor,
          tier,
          GRASSLANDS_LAKE_WATER_LEVEL_EDIT_RANGE,
          GRASSLANDS_LAKE_MAX_BASIN_DEPTH
        )
      })
    );
  }
}

/**
 * Registers the standalone Grasslands source against the exact same
 * Appearance and texture descriptors used by Terrain. Showcase retains its
 * own approved optics profile while the source envelope and quality budgets
 * remain consumer-specific.
 */
export function registerGrasslandsStylizedWaterBodyAuthoring(
  assets: WaterBodyAssetRegistry,
  descriptor: HeightfieldWaterDescriptorV1
): GrasslandsStylizedWaterBodyAuthoring {
  for (const tier of [WaterQualityTier.Low, WaterQualityTier.Medium, WaterQualityTier.High] as const) {
    registerLakeOptics(assets, tier);
    assets.registerRuntimeVariant(GRASSLANDS_STYLIZED_WATER_ASSET_ID, {
      id: `grasslands-stylized-${tier}-v2`,
      label: tier === WaterQualityTier.High ? "High" : tier === WaterQualityTier.Medium ? "Medium" : "Low",
      tier,
      qualityPlanId: grasslandsQualityPresetIdForQuality(tier)
    });
  }
  registerGrasslandsStylizedLook(assets, descriptor);
  const source: GridMaskWaterBodySourceV1 = Object.freeze({
    schemaVersion: WaterBodySourceSchemaVersion.V1,
    kind: WaterBodySourceKind.GridMask,
    descriptor: createHeightfieldWaterBodySourceDescriptorV1(descriptor),
    capabilities: Object.freeze({
      localBathymetry: true,
      shoreSdf: true,
      current: true
    })
  });
  const representationData = createHeightfieldWaterRepresentationDataV1(descriptor);
  assets.registerAsset(
    createWaterBodyAsset({
      id: GRASSLANDS_STYLIZED_WATER_ASSET_ID,
      kind: "lake",
      representation: Object.freeze({ domain: "bounded-grid", macroSurface: "heightfield" }),
      representationData,
      representationDataHash: hashStableValue(representationData),
      sourceHash: hashStableValue(source),
      source
    })
  );
  const instance = createWaterBodyInstance({
    id: GRASSLANDS_STYLIZED_WATER_INSTANCE_ID,
    assetId: GRASSLANDS_STYLIZED_WATER_ASSET_ID,
    lookPresetId: LAKE_WATER_LOOK_PRESET_ID,
    qualityPlanId: GRASSLANDS_STYLIZED_HIGH_QUALITY_PRESET_ID,
    transform: { position: [0, 0, 0], yawDegrees: 0, scaleXZ: [1, 1] },
    visible: true,
    priority: 20,
    interaction: {
      query: false,
      buoyancy: false,
      wake: false
    }
  });
  return Object.freeze({
    source,
    instance,
    normalResource: LAKE_NORMAL_RESOURCE
  });
}
