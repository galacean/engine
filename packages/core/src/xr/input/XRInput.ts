import { IXRInput } from "@galacean/engine-design";
import { XRTrackingState } from "./XRTrackingState";
import { XRTrackedInputDevice } from "./XRTrackedInputDevice";

export class XRInput implements IXRInput {
  /** The tracking state of xr input. */
  trackingState: XRTrackingState = XRTrackingState.NotTracking;

  /**
   * @internal
   */
  constructor(public type: XRTrackedInputDevice) {}
}
