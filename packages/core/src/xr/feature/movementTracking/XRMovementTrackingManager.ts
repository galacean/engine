import { IXRMovementTrackingDescriptor } from "./IXRMovementTrackingDescriptor";
import { XRFeatureManager } from "../XRFeatureManager";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";
import { registerXRFeatureManager } from "../../XRModule";
import { XRFeatureType } from "../XRFeatureType";
import { XRPlatformMovementTracking } from "./XRPlatformMovementTracking";

@registerXRFeatureManager(XRFeatureType.MovementTracking)
export class XRMovementTrackingManager extends XRFeatureManager<
  IXRMovementTrackingDescriptor,
  XRPlatformMovementTracking
> {
  get trackingMode(): XRMovementTrackingMode {
    return this._platformFeature.trackingMode;
  }

  set trackingMode(value: XRMovementTrackingMode) {
    this._platformFeature.trackingMode = value;
  }
}
