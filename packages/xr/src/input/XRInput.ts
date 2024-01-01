import { IXRInput } from "@galacean/engine-design";
import { XRTrackedInputDevice } from "./XRTrackedInputDevice";
import { XRTrackingState } from "./XRTrackingState";

export class XRInput implements IXRInput {
  /** The tracking state of xr input. */
  trackingState: XRTrackingState = XRTrackingState.NotTracking;

  /**
   * @internal
   */
  constructor(public type: XRTrackedInputDevice) {}
}
