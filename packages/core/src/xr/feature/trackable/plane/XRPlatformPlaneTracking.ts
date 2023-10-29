import { IXRTrackedPlane } from "@galacean/engine-design";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRPlaneTrackingMode } from "./XRPlaneTrackingMode";

export abstract class XRPlatformPlaneTracking extends XRTrackableFeature<IXRTrackedPlane> {
  trackingMode: XRPlaneTrackingMode;
}
