import { IXRPose } from "../../../input/IXRPose";
import { IXRTrackedAnchor } from "../tracked/IXRTrackedAnchor";
import { IXRRequestTracking } from "./IXRRequestTracking";

/**
 * The interface for request tracking anchor in XR.
 */
export interface IXRRequestTrackingAnchor extends IXRRequestTracking<IXRTrackedAnchor> {
  /** The pose of anchor. */
  pose: IXRPose;
}
