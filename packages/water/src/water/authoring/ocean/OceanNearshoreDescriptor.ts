/** V1 input contract for the finite Ocean render field. */
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
  /**
   * Optional dense row-major signed horizontal distance to shore in metres.
   * Positive values are wet and negative values are dry. Sources with a
   * continuous sub-texel coastline can publish it; otherwise Water derives
   * a conservative field from wetSource.
   */
  readonly signedShoreDistances?: Float32Array;
  readonly wetSource: OceanNearshoreWetSource;
  readonly outsidePolicy: OceanNearshoreOutsidePolicies;
  readonly budget?: Partial<OceanNearshoreBudgetConfig>;
}
