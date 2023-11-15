import { IXRFeatureDescriptor, IXRPose } from "@galacean/engine-design";

/**
 * The descriptor of XR anchor tracking.
 */
export interface IXRAnchorTrackingDescriptor extends IXRFeatureDescriptor {
  /** Request tracking anchor. */
  anchors?: IXRPose[];
}
