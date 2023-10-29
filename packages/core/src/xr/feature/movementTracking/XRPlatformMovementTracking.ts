import { XRPlatformFeature } from "../XRPlatformFeature";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";

export abstract class XRPlatformMovementTracking extends XRPlatformFeature {
  trackingMode: XRMovementTrackingMode;
}
