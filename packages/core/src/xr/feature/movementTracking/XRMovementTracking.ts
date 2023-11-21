import { IXRMovementTracking, IXRMovementTrackingConfig } from "@galacean/engine-design";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";
import { registerXRFeature } from "../../XRManager";
import { XRFeatureType } from "../XRFeatureType";
import { XRFeature } from "../XRFeature";

@registerXRFeature(XRFeatureType.MovementTracking)
/**
 * The manager of XR movement tracking.
 */
export class XRMovementTracking extends XRFeature<IXRMovementTrackingConfig, IXRMovementTracking> {
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
