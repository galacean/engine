import { IXRPose } from "../../../IXRPose";
import { IXRFeatureConfig } from "../../IXRFeatureConfig";

/**
 * The config of XR anchor tracking.
 */
export interface IXRAnchorTrackingConfig extends IXRFeatureConfig {
  /** Request tracking anchor. */
  anchors: IXRPose[];
}
