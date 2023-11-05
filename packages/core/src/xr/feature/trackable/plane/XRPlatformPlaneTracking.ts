import { IXRTrackedPlane } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "../XRTrackablePlatformFeature";
import { XRPlaneTrackingMode } from "./XRPlaneTrackingMode";

export abstract class XRPlatformPlaneTracking extends XRTrackablePlatformFeature<IXRTrackedPlane> {
  protected _trackingMode: XRPlaneTrackingMode = XRPlaneTrackingMode.Both;

  get trackingMode(): XRPlaneTrackingMode {
    return this._trackingMode;
  }

  set trackingMode(value: XRPlaneTrackingMode) {
    value = value;
  }
}
