import type {
  OceanWaterRuntimeConfig,
  OceanWaterRuntimeMetrics,
  OceanWaterRuntimeStressResult
} from "../../../runtime/ocean/OceanWaterRuntimeTypes";

/** Backward-compatible demo aliases over the engine-facing Ocean runtime contract. */
export type OceanPreviewConfig = OceanWaterRuntimeConfig;
export type OceanPreviewMetrics = OceanWaterRuntimeMetrics;
export type OceanPreviewStressResult = OceanWaterRuntimeStressResult;
