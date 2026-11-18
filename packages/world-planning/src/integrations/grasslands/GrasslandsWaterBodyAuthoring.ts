import { createWaterBodyAsset } from "@galacean/engine-water/water/index";
import { createWaterBodyInstance, type WaterBodyInstance } from "@galacean/engine-water/water/index";
import { createWaterQualityPlanV2 } from "@galacean/engine-water/water/index";
import {
  WaterBodySourceKind,
  WaterBodySourceSchemaVersion,
  type TerrainRegionWaterBodySourceV1,
  type WaterResourceAssetDescriptorV1,
  type WaterSpatialFieldSourcesV1,
  type WaterSpatialFieldQualityBudgetV1
} from "@galacean/engine-water/water/index";
import { decodeWaterSpatialFieldSources } from "@galacean/engine-water/water/index";
import { WaterQualityTier } from "@galacean/engine-water/water/index";
import { hashStableValue } from "@galacean/engine-water/water/compiler/index";
import { WaterBodyAssetRegistry } from "@galacean/engine-water/water/runtime/index";

import { LAKE_WATER_LOOK_PRESET_ID } from "@galacean/engine-water/water/presets/lake/index";
import { LAKE_NORMAL_RESOURCE } from "@galacean/engine-water/water/resources/lake/index";
import { registerLakeWaterLook } from "@galacean/engine-water/water/presets/lake/index";
import { GRASSLANDS_TERRAIN_WATER_INSTANCE_ID } from "./GrasslandsWaterBodyIdentity";

export const GRASSLANDS_TERRAIN_WATER_PROVIDER_ID = "terrain-grasslands-water-region-v1";
export const GRASSLANDS_TERRAIN_WATER_ASSET_ID = "terrain-grasslands-water-body-v1";
export { GRASSLANDS_TERRAIN_WATER_INSTANCE_ID } from "./GrasslandsWaterBodyIdentity";
export const GRASSLANDS_TERRAIN_QUALITY_PLAN_ID = "grasslands-terrain-high-v2";

export interface GrasslandsTerrainWaterBodyAuthoringOptions {
  readonly regionContentHash: string;
  readonly spatialFields: WaterSpatialFieldSourcesV1;
  readonly spatialFieldBudget: WaterSpatialFieldQualityBudgetV1;
  readonly visible?: boolean;
  readonly gameplayQuery?: boolean;
}

export interface GrasslandsTerrainWaterBodyAuthoring {
  readonly source: TerrainRegionWaterBodySourceV1;
  readonly instance: WaterBodyInstance;
  readonly normalResource: WaterResourceAssetDescriptorV1;
}

export function registerGrasslandsTerrainWaterQualityPlan(
  assets: WaterBodyAssetRegistry,
  spatialFieldBudget: Readonly<WaterSpatialFieldQualityBudgetV1>
): void {
  assets.registerQualityPlan(
    createWaterQualityPlanV2({
      id: GRASSLANDS_TERRAIN_QUALITY_PLAN_ID,
      geometry: "high",
      surfaceShading: "high",
      sceneFields: "scene-color-depth",
      reflectionBudget: { environment: true, screenSpace: true },
      query: "dense",
      spatialField: spatialFieldBudget
    })
  );
}

/** Registers the canonical Look plus Integrated World's High Quality Plan. */
export function registerGrasslandsTerrainWaterPresets(
  assets: WaterBodyAssetRegistry,
  spatialFieldBudget: Readonly<WaterSpatialFieldQualityBudgetV1>
): void {
  if (!assets.getLookPreset(LAKE_WATER_LOOK_PRESET_ID)) {
    registerLakeWaterLook(assets);
  }
  if (!assets.getQualityPlan(GRASSLANDS_TERRAIN_QUALITY_PLAN_ID)) {
    registerGrasslandsTerrainWaterQualityPlan(assets, spatialFieldBudget);
  }
}

/**
 * Registers one stable Grasslands preset family. Terrain supplies a detached
 * region identity plus explicit versioned spatial-field authoring; the common
 * Loader owns resolution, compilation, Camera features, runtime activation,
 * and teardown.
 */
export function registerGrasslandsTerrainWaterBodyAuthoring(
  assets: WaterBodyAssetRegistry,
  options: Readonly<GrasslandsTerrainWaterBodyAuthoringOptions>
): GrasslandsTerrainWaterBodyAuthoring {
  registerGrasslandsTerrainWaterPresets(assets, options.spatialFieldBudget);
  const decodedSpatialFields = decodeWaterSpatialFieldSources(options.spatialFields);
  if (!decodedSpatialFields.valid || !decodedSpatialFields.value) {
    const first = decodedSpatialFields.diagnostics[0];
    throw new Error(
      first
        ? `Grasslands Water spatial fields are invalid at ${first.path}: ${first.message}`
        : "Grasslands Water spatial fields are invalid."
    );
  }
  const source: TerrainRegionWaterBodySourceV1 = Object.freeze({
    schemaVersion: WaterBodySourceSchemaVersion.V1,
    kind: WaterBodySourceKind.TerrainRegion,
    providerId: GRASSLANDS_TERRAIN_WATER_PROVIDER_ID,
    parameters: Object.freeze({
      regionContentHash: options.regionContentHash
    }),
    spatialFields: decodedSpatialFields.value,
    capabilities: Object.freeze({
      localBathymetry: true,
      shoreSdf: true,
      current: true
    })
  });
  assets.registerRuntimeVariant(GRASSLANDS_TERRAIN_WATER_ASSET_ID, {
    id: "grasslands-terrain-high-v2",
    label: "High",
    tier: WaterQualityTier.High,
    qualityPlanId: GRASSLANDS_TERRAIN_QUALITY_PLAN_ID
  });
  assets.registerAsset(
    createWaterBodyAsset({
      id: GRASSLANDS_TERRAIN_WATER_ASSET_ID,
      kind: "lake",
      representation: Object.freeze({ domain: "bounded-grid", macroSurface: "heightfield" }),
      sourceHash: hashStableValue(source),
      source
    })
  );
  const instance = createWaterBodyInstance({
    id: GRASSLANDS_TERRAIN_WATER_INSTANCE_ID,
    assetId: GRASSLANDS_TERRAIN_WATER_ASSET_ID,
    lookPresetId: LAKE_WATER_LOOK_PRESET_ID,
    qualityPlanId: GRASSLANDS_TERRAIN_QUALITY_PLAN_ID,
    transform: { position: [0, 0, 0], yawDegrees: 0, scaleXZ: [1, 1] },
    visible: options.visible ?? true,
    priority: 20,
    interaction: {
      query: options.gameplayQuery ?? false,
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
