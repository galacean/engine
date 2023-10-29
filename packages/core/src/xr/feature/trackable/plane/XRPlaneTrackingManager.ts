import { registerXRFeatureManager } from "../../../XRModule";
import { XRFeatureType } from "../../XRFeatureType";
import { IXRPlaneTrackingDescriptor } from "./IXRPlaneTrackingDescriptor";
import { IXRTrackedPlane } from "@galacean/engine-design";
import { XRPlatformPlaneTracking } from "./XRPlatformPlaneTracking";
import { XRTrackableManager } from "../XRTrackableManager";
import { XRPlaneTrackingMode } from "./XRPlaneTrackingMode";

@registerXRFeatureManager(XRFeatureType.PlaneTracking)
export class XRPlaneTrackingManager extends XRTrackableManager<
  IXRPlaneTrackingDescriptor,
  XRPlatformPlaneTracking,
  IXRTrackedPlane
> {
  get trackingMode(): XRPlaneTrackingMode {
    return this.platformFeature.trackingMode;
  }

  set trackingMode(value: XRPlaneTrackingMode) {
    this.platformFeature.trackingMode = value;
  }
}
