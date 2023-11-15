import { IXRRequestTrackingPlane, IXRTrackedPlane } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "../XRTrackablePlatformFeature";
import { XRPlaneMode } from "./XRPlaneMode";

/**
 * The base class of XR plane tracking.
 */
export abstract class XRPlatformPlaneTracking extends XRTrackablePlatformFeature<
  IXRTrackedPlane,
  IXRRequestTrackingPlane
> {
  protected _trackingMode: XRPlaneMode = XRPlaneMode.EveryThing;

  get trackingMode(): XRPlaneMode {
    return this._trackingMode;
  }

  set trackingMode(value: XRPlaneMode) {
    value = value;
  }
}
