import { IXRPose, IXRTrackable } from "@galacean/engine-design";
import { XRTrackingState } from "./XRTrackingState";

export class XRTrackable implements IXRTrackable {
  id: number;
  pose: IXRPose;
  state: XRTrackingState;
}
