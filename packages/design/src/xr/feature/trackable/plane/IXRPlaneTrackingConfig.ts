import { IXRFeatureConfig } from "../../IXRFeatureConfig";

/**
 * The config of XR plane tracking.
 */
export interface IXRPlaneTrackingConfig extends IXRFeatureConfig {
  /** Rules for detecting planes. */
  mode: number;
}
