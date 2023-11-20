import { IXRMovementTracking, IXRMovementTrackingDescriptor } from "@galacean/engine-design";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";
import { registerXRFeatureManager } from "../../XRManager";
import { XRFeatureType } from "../XRFeatureType";
import { XRFeatureManager } from "../XRFeatureManager";

@registerXRFeatureManager(XRFeatureType.MovementTracking)
/**
 * The manager of XR movement tracking.
 */
export class XRMovementTrackingManager extends XRFeatureManager<IXRMovementTrackingDescriptor, IXRMovementTracking> {
  /**
   * Get the tracking mode.
   */
  get trackingMode(): XRMovementTrackingMode {
    return this._platformFeature.trackingMode;
  }

  set trackingMode(value: XRMovementTrackingMode) {
    this._platformFeature.trackingMode = value;
  }
}
