import { IXRRequestTracking } from "../IXRRequestTracking";
import { IXRPose } from "../../../input/IXRPose";
import { IXRTracked } from "../IXRTracked";

export interface IXRRequestAnchorTracking extends IXRRequestTracking<IXRTracked> {
  pose: IXRPose;
}
