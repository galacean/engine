/** V1 input contract for the bounded nearshore field attached to the Ocean Rings. */
import type { OceanObstacleDescriptor } from "./OceanObstacleTypes";
import {
  OceanNearshoreSchemaVersion,
  type OceanNearshoreBudgetConfig,
  type OceanNearshoreGridConfig,
  type OceanNearshoreOutsidePolicies,
  type OceanNearshoreWetSource
} from "./OceanNearshoreTypes";

export interface OceanNearshoreDescriptorV1 {
  readonly schemaVersion: OceanNearshoreSchemaVersion.V1;
  readonly id: string;
  readonly waterLevel: number;
  readonly grid: OceanNearshoreGridConfig;
  /** Dense row-major absolute world-space bed Y. */
  readonly bedHeights: Float32Array;
  /** Optional dense row-major world XZ current pairs. Missing data compiles to zero. */
  readonly baseCurrentsXZ?: Float32Array;
  readonly wetSource: OceanNearshoreWetSource;
  readonly outsidePolicy: OceanNearshoreOutsidePolicies;
  readonly obstacles?: readonly OceanObstacleDescriptor[];
  readonly budget?: Partial<OceanNearshoreBudgetConfig>;
}
