/** V1 input contract: sparse wet texels with absolute world-space water elevations. */
import type { WaterQualityTier } from "../wave/enums/WaterQualityTier";
import type { WaterWaveAssetV1 } from "../wave/WaterWaveTypes";
import { HeightfieldWaterSchemaVersion } from "./HeightfieldWaterEnums";
import type {
  HeightfieldWaterBudgetConfig,
  HeightfieldWaterGridConfig,
  HeightfieldWaterMaterialConfig
} from "./HeightfieldWaterTypes";

export interface HeightfieldWaterDescriptorV1 {
  readonly schemaVersion: HeightfieldWaterSchemaVersion.V1;
  readonly id: string;
  readonly grid: HeightfieldWaterGridConfig;
  /** Strictly increasing row-major indices: z * width + x. */
  readonly wetTexelIndices: Uint32Array;
  /** Absolute world-space water Y, one value per wet texel. */
  readonly surfaceHeights: Float32Array;
  /** Optional bed Y, one value per wet texel. Missing data compiles as a two-metre water column. */
  readonly bedHeights?: Float32Array;
  /** Optional world-space XZ flow vectors, two values per wet texel. */
  readonly flowVectorsXZ?: Float32Array;
  readonly waveAsset: WaterWaveAssetV1;
  readonly quality: WaterQualityTier;
  readonly material: HeightfieldWaterMaterialConfig;
  readonly budget?: Partial<HeightfieldWaterBudgetConfig>;
}
