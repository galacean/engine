import { IXRMovementTrackingDescriptor } from "./IXRMovementTrackingDescriptor";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";
import { registerXRFeatureManager } from "../../XRManager";
import { XRFeatureType } from "../XRFeatureType";
import { XRFeatureManager } from "../XRFeatureManager";
import { IXRMovementTracking } from "@galacean/engine-design";

@registerXRFeatureManager(XRFeatureType.MovementTracking)
/**
 * The manager of XR movement tracking.
 */
export class XRMovementTrackingManager extends XRFeatureManager<IXRMovementTrackingDescriptor, IXRMovementTracking> {
  get trackingMode(): XRMovementTrackingMode {
    return this._platformFeature.trackingMode;
  }

  set trackingMode(value: XRMovementTrackingMode) {
    this._platformFeature.trackingMode = value;
  }
}
