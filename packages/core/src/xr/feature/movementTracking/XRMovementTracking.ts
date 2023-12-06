import { XRManager } from "../../XRManager";
import { XRFeature } from "../XRFeature";
import { XRFeatureType } from "../XRFeatureType";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";

/**
 * The manager of XR movement tracking.
 */
export class XRMovementTracking extends XRFeature {
  private _trackingMode: XRMovementTrackingMode;

  /**
   * Get the tracking mode.
   */
  get trackingMode(): XRMovementTrackingMode {
    return this._trackingMode;
  }

  /**
   * @param xrManager - The xr manager
   * @param trackingMode - The tracking mode
   */
  constructor(xrManager: XRManager, trackingMode: XRMovementTrackingMode = XRMovementTrackingMode.Dof6) {
    super(xrManager, XRFeatureType.MovementTracking, trackingMode);
    this._trackingMode = trackingMode;
  }
}
