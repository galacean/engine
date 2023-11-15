import { IXRPose } from "../../../input/IXRPose";
import { IXRTrackedAnchor } from "../tracked/IXRTrackedAnchor";
import { IXRRequestTracking } from "./IXRRequestTracking";

export interface IXRRequestTrackingAnchor extends IXRRequestTracking<IXRTrackedAnchor> {
  pose: IXRPose;
}
