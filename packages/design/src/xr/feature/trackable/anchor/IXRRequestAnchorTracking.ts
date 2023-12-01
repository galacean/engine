import { IXRPose } from "../../../IXRPose";
import { IXRRequestTracking } from "../IXRRequestTracking";
import { IXRTracked } from "../IXRTracked";

export interface IXRRequestAnchorTracking extends IXRRequestTracking<IXRTracked> {
  pose: IXRPose;
}
