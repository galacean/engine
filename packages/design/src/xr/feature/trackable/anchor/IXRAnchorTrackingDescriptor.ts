import { IXRFeatureDescriptor } from "../../IXRFeatureDescriptor";
import { IXRPose } from "../../../input/IXRPose";

/**
 * The descriptor of XR anchor tracking.
 */
export interface IXRAnchorTrackingDescriptor extends IXRFeatureDescriptor {
  /** Request tracking anchor. */
  anchors?: IXRPose[];
}
