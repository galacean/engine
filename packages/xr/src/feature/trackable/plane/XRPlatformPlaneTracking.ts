import { IXRRequestTrackingPlane, IXRTrackedPlane } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "../XRTrackablePlatformFeature";
import { XRPlaneDetectionMode } from "./XRPlaneDetectionMode";

/**
 * The base class of XR plane tracking.
 */
export abstract class XRPlatformPlaneTracking extends XRTrackablePlatformFeature<
  IXRTrackedPlane,
  IXRRequestTrackingPlane
> {
  protected _trackingMode: XRPlaneDetectionMode = XRPlaneDetectionMode.EveryThing;

  get trackingMode(): XRPlaneDetectionMode {
    return this._trackingMode;
  }

  set trackingMode(value: XRPlaneDetectionMode) {
    value = value;
  }
}
