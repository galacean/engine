import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { HeightfieldWaterBudgetConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";

export const HEIGHTFIELD_WATER_COMPILER_VERSION = 1;
export const HEIGHTFIELD_WATER_DEFAULT_DEPTH = 2;
export const HEIGHTFIELD_WATER_CHUNK_CELL_SIZE = 64;
export const HEIGHTFIELD_WATER_UINT16_VERTEX_LIMIT = 65535;

export const HEIGHTFIELD_WATER_AGGREGATION_SCALE = {
  [WaterQualityTier.Low]: 4,
  [WaterQualityTier.Medium]: 2,
  [WaterQualityTier.High]: 1
} as const;

export const HEIGHTFIELD_WATER_ATLAS_MAX_EDGE = {
  [WaterQualityTier.Low]: 128,
  [WaterQualityTier.Medium]: 256,
  [WaterQualityTier.High]: 512
} as const;

export const HEIGHTFIELD_WATER_DEFAULT_BUDGET: HeightfieldWaterBudgetConfig = {
  maxWetTexelCount: 1_048_576,
  maxQueryTexelCount: 1_048_576,
  maxComponentCount: 262_144,
  maxVertexCount: 2_000_000,
  maxTriangleCount: 4_000_000,
  maxChunkCount: 4096,
  maxMapPixelCount: 512 * 512
};
