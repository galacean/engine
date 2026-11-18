import { createWaterQualityPlanV2, WaterQualityTier } from "@galacean/engine-water/water/index";
import { registerOceanAuthoring } from "@galacean/engine-water/water/presets/ocean/index";

import { HEIGHTFIELD_WATER_ATLAS_MAX_EDGE, hashStableValue } from "@galacean/engine-water/water/compiler/index";

import { LAKE_WATER_LOOK_PRESET_ID, registerLakeWaterLook } from "@galacean/engine-water/water/presets/lake/index";

import { OCEAN_LOOK_ID } from "@galacean/engine-water/water/presets/ocean/index";
import { WaterBodyAssetRegistry } from "@galacean/engine-water/water/runtime/index";
import type { OceanWaterSourceConfig } from "@galacean/engine-water/water/runtime/ocean/index";
import {
  computeSeedWorldWaterRenderErrorBudgetHashV1,
  type SeedWorldWaterRenderErrorBudgetV1
} from "@galacean/engine-water/world/SeedWorldWaterErrorBudget";
import { createSeedWorldAuthoredBasinSpatialFieldQualityBudgetV1 } from "../SeedWorldAuthoredBasinWater.ts";

const SEED_WORLD_LAKE_QUALITY_PLAN_PREFIX = "seed-world-authoritative-lake-v2:quality";
const SEED_WORLD_AUTHORED_BASIN_QUALITY_PLAN_PREFIX = "seed-world-authored-basin-v1:quality";

function seedWorldLakeQualityPlanId(renderBudgetHash: string): string {
  return `${SEED_WORLD_LAKE_QUALITY_PLAN_PREFIX}:${renderBudgetHash}`;
}

export interface SeedWorldLakeAuthoringIdsV1 {
  /** Canonical Integrated World Look; Seed World never owns a presentation fork. */
  readonly lookPresetId: typeof LAKE_WATER_LOOK_PRESET_ID;
  /** The only Seed-owned render axis: a finite Profile/error-budget Quality Plan. */
  readonly qualityPlanId: string;
}

export interface SeedWorldOceanAuthoringIdsV1 {
  /** Sole fixed Ocean Look. */
  readonly lookPresetId: typeof OCEAN_LOOK_ID;
  /** Schema-required id for the one fixed Ocean implementation budget. */
  readonly qualityPlanId: string;
}

export interface SeedWorldAuthoredBasinAuthoringIdsV1 {
  /** Authored ponds/lakes deliberately share the Integrated World visual Look. */
  readonly lookPresetId: typeof LAKE_WATER_LOOK_PRESET_ID;
  /** Public-input-range-derived implementation budget owned only by authored ponds/lakes. */
  readonly qualityPlanId: string;
}

/** Registers an authored pond/lake Quality Plan derived from its complete public input range. */
export function registerSeedWorldAuthoredBasinAuthoringV1(
  assets: WaterBodyAssetRegistry
): Readonly<SeedWorldAuthoredBasinAuthoringIdsV1> {
  if (!assets.getLookAuthoringSnapshot(LAKE_WATER_LOOK_PRESET_ID)) {
    registerLakeWaterLook(assets);
  }
  const spatialField = createSeedWorldAuthoredBasinSpatialFieldQualityBudgetV1();
  const qualityPlanId = `${SEED_WORLD_AUTHORED_BASIN_QUALITY_PLAN_PREFIX}:${hashStableValue(spatialField)}`;
  if (!assets.getQualityPlan(qualityPlanId)) {
    assets.registerQualityPlan(
      createWaterQualityPlanV2({
        id: qualityPlanId,
        geometry: "high",
        surfaceShading: "high",
        sceneFields: "scene-color-depth",
        opaqueDownsampling: "2x",
        reflectionBudget: { environment: true, screenSpace: true },
        query: "dense",
        spatialField
      })
    );
  }
  return Object.freeze({ lookPresetId: LAKE_WATER_LOOK_PRESET_ID, qualityPlanId });
}

/** Registers the shared Integrated Look and only a Seed-specific Quality Plan. */
export function registerSeedWorldLakeAuthoringV1(
  assets: WaterBodyAssetRegistry,
  renderBudget: Readonly<SeedWorldWaterRenderErrorBudgetV1>
): Readonly<SeedWorldLakeAuthoringIdsV1> {
  const { waterRenderErrorBudgetHash, ...renderBudgetValues } = renderBudget;
  if (computeSeedWorldWaterRenderErrorBudgetHashV1(renderBudgetValues) !== waterRenderErrorBudgetHash) {
    throw new Error("Seed World Lake authoring received a stale or forged Render Error Budget hash.");
  }

  const existingLook = assets.getLookAuthoringSnapshot(LAKE_WATER_LOOK_PRESET_ID);
  if (!existingLook) {
    registerLakeWaterLook(assets);
  }
  // Once bootstrapped, the registry snapshot is the one shared authoring
  // source. A DevTools publication intentionally changes its content hash and
  // must survive later Seed generations.

  const qualityPlanId = seedWorldLakeQualityPlanId(waterRenderErrorBudgetHash);
  if (!assets.getQualityPlan(qualityPlanId)) {
    assets.registerQualityPlan(
      createWaterQualityPlanV2({
        id: qualityPlanId,
        // Heightfield currently selects its material octave budget from the
        // geometry axis. Both axes therefore stay High to preserve the exact
        // Integrated Look; Seed varies only query and spatial-field budgets.
        geometry: "high",
        surfaceShading: "high",
        sceneFields: "scene-color-depth",
        opaqueDownsampling: "2x",
        reflectionBudget: { environment: true, screenSpace: true },
        query: "off",
        spatialField: {
          maximumHorizontalError: renderBudget.maximumFootprintHorizontalErrorMillimetres / 1_000,
          maximumDepthError: 0,
          maximumGpuDepthDecodeError: renderBudget.maximumGpuDepthDecodeErrorMillimetres / 1_000,
          maximumGpuShoreDecodeError: renderBudget.maximumGpuShoreDecodeErrorMillimetres / 1_000,
          maximumAtlasPixels: HEIGHTFIELD_WATER_ATLAS_MAX_EDGE[WaterQualityTier.High] ** 2
        }
      })
    );
  }

  return Object.freeze({
    lookPresetId: LAKE_WATER_LOOK_PRESET_ID,
    qualityPlanId
  });
}

/** Registers the sole Ocean Look and its fixed, non-selectable render budget. */
export function registerSeedWorldOceanAuthoringV1(
  assets: WaterBodyAssetRegistry,
  config: Readonly<OceanWaterSourceConfig>
): Readonly<SeedWorldOceanAuthoringIdsV1> {
  return registerOceanAuthoring(assets, config);
}
