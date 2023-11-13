import { registerXRFeatureManager } from "../../../XRManager";
import { XRFeatureType } from "../../XRFeatureType";
import { IXRPlaneTrackingDescriptor } from "./IXRPlaneTrackingDescriptor";
import { IXRTrackedPlane } from "@galacean/engine-design";
import { XRPlatformPlaneTracking } from "./XRPlatformPlaneTracking";
import { XRTrackableManager } from "../XRTrackableManager";
import { XRPlaneDetectionMode } from "./XRPlaneDetectionMode";
import { XRPlane } from "../../../component/trackable/XRPlane";

@registerXRFeatureManager(XRFeatureType.PlaneTracking)
/**
 * The manager of plane tracking feature.
 */
export class XRPlaneTrackingManager extends XRTrackableManager<
  IXRPlaneTrackingDescriptor,
  XRPlatformPlaneTracking,
  IXRTrackedPlane,
  XRPlane
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
