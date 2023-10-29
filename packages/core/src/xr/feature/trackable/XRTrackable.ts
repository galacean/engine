import { IXRPose, IXRTrackable } from "@galacean/engine-design";
import { XRTrackingState } from "../../enum/XRTrackedState";

export class XRTrackable implements IXRTrackable {
  id: number;
  pose: IXRPose;
  state: XRTrackingState;
}
