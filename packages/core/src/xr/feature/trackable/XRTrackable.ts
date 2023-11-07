import { IXRPose, IXRTrackable } from "@galacean/engine-design";
import { XRTrackingState } from "./XRTrackingState";

/**
 * The base class of XR trackable.
 */
export class XRTrackable implements IXRTrackable {
  /** Id of the trackable. */
  id: number;
  /** The pose of the trackable. */
  pose: IXRPose;
  /** The tracking state of the trackable. */
  state: XRTrackingState;
  /** The modified frame count of the trackable. */
  frameCount: number;
}
