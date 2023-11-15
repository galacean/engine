import { XRPlatformFeature } from "@galacean/engine";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";

/**
 * The base class of XR platform movement tracking.
 */
export abstract class XRPlatformMovementTracking extends XRPlatformFeature {
  private _trackingMode: XRMovementTrackingMode = XRMovementTrackingMode.Dof6;

  get trackingMode(): XRMovementTrackingMode {
    return this._trackingMode;
  }

  set trackingMode(value: XRMovementTrackingMode) {
    if (value !== this._trackingMode) {
      this._trackingMode = value;
    }
  }
}
