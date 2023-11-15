import { XRFeatureType, registerXRFeatureManager } from "@galacean/engine";
import { IXRPlaneTrackingDescriptor } from "./IXRPlaneTrackingDescriptor";
import { XRPlatformPlaneTracking } from "./XRPlatformPlaneTracking";
import { XRPlaneMode } from "./XRPlaneMode";
import { XRTrackableManager } from "../XRTrackableManager";
import { XRTrackedPlane } from "./XRTrackedPlane";

@registerXRFeatureManager(XRFeatureType.PlaneTracking)
/**
 * The manager of plane tracking feature.
 */
export class XRPlaneTrackingManager extends XRTrackableManager<
  IXRPlaneTrackingDescriptor,
  XRTrackedPlane,
  XRPlatformPlaneTracking
> {
  /**
   * Return the plane detection mode for XR.
   */
  get detectionMode(): XRPlaneMode {
    return this._platformFeature.trackingMode;
  }

  set detectionMode(value: XRPlaneMode) {
    this._platformFeature.trackingMode = value;
  }
}
