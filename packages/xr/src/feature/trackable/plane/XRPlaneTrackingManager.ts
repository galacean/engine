import { IXRTrackedPlane } from "@galacean/engine-design";
import { XRFeatureType, registerXRFeatureManager } from "@galacean/engine";
import { IXRPlaneTrackingDescriptor } from "./IXRPlaneTrackingDescriptor";
import { XRPlatformPlaneTracking } from "./XRPlatformPlaneTracking";
import { XRPlaneDetectionMode } from "./XRPlaneDetectionMode";
import { XRTrackableManager } from "../XRTrackableManager";
import { XRPlane } from "../../../component/trackable/XRPlane";

@registerXRFeatureManager(XRFeatureType.PlaneTracking)
/**
 * The manager of plane tracking feature.
 */
export class XRPlaneTrackingManager extends XRTrackableManager<
  IXRPlaneTrackingDescriptor,
  IXRTrackedPlane,
  XRPlane,
  XRPlatformPlaneTracking
> {
  /**
   * Return the plane detection mode for WebXR.
   */
  get detectionMode(): XRPlaneDetectionMode {
    return this._platformFeature.trackingMode;
  }

  set detectionMode(value: XRPlaneDetectionMode) {
    this._platformFeature.trackingMode = value;
  }
}
