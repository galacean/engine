import { XRPlatformFeature } from "../XRPlatformFeature";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";

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
