import { IXRTrackedPlane } from "@galacean/engine-design";
import { XRFeatureType, registerXRFeatureManager } from "@galacean/engine";
import { IXRPlaneTrackingDescriptor } from "./IXRPlaneTrackingDescriptor";
import { XRPlatformPlaneTracking } from "./XRPlatformPlaneTracking";
import { XRPlaneMode } from "./XRPlaneMode";
import { XRTrackableManager } from "../XRTrackableManager";

@registerXRFeatureManager(XRFeatureType.PlaneTracking)
/**
 * The manager of plane tracking feature.
 */
export class XRPlaneTrackingManager extends XRTrackableManager<
  IXRPlaneTrackingDescriptor,
  IXRTrackedPlane,
  XRPlatformPlaneTracking
> {
  /**
   * Return the plane detection mode for WebXR.
   */
  get detectionMode(): XRPlaneMode {
    return this._platformFeature.trackingMode;
  }

  set detectionMode(value: XRPlaneMode) {
    this._platformFeature.trackingMode = value;
  }
}
