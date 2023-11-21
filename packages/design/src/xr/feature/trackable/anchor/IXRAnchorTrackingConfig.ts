import { IXRFeatureConfig } from "../../IXRFeatureConfig";
import { IXRPose } from "../../../input/IXRPose";

/**
 * The config of XR anchor tracking.
 */
export interface IXRAnchorTrackingConfig extends IXRFeatureConfig {
  /** Request tracking anchor. */
  anchors: IXRPose[];
}
