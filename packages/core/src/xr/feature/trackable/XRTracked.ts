import { IXRTracked } from "@galacean/engine-design";
import { XRPose } from "../../XRPose";
import { XRTrackingState } from "../../input/XRTrackingState";

export abstract class XRTracked implements IXRTracked {
  /** The unique id of the trackable. */
  id: number;
  /** The pose of the trackable in XR space. */
  pose: XRPose = new XRPose();
  /** The tracking state of the trackable. */
  state: XRTrackingState = XRTrackingState.NotTracking;
}
