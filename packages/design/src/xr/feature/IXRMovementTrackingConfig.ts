import { IXRFeatureConfig } from "./IXRFeatureConfig";

/**
 * The config of XR movement tracking.
 */
export interface IXRMovementTrackingConfig extends IXRFeatureConfig {
  /** The mode of movement tracking. */
  mode: number;
}
