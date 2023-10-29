import { IXRTrackedPlane } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "../XRTrackablePlatformFeature";
import { XRPlaneTrackingMode } from "./XRPlaneTrackingMode";

export abstract class XRPlatformPlaneTracking extends XRTrackablePlatformFeature<IXRTrackedPlane> {
  trackingMode: XRPlaneTrackingMode;
}
