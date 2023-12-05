import { IXRMovementTracking, IXRMovementTrackingConfig } from "@galacean/engine-design";
import { XRManager } from "../../XRManager";
import { XRFeature } from "../XRFeature";
import { XRFeatureType } from "../XRFeatureType";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";

/**
 * The manager of XR movement tracking.
 */
export class XRMovementTracking extends XRFeature<IXRMovementTrackingConfig, IXRMovementTracking> {
  private _trackingMode: XRMovementTrackingMode;

  /**
   * Get the tracking mode.
   */
  get trackingMode(): XRMovementTrackingMode {
    return this._trackingMode;
  }

  set trackingMode(value: XRMovementTrackingMode) {
    if (this._xrManager.sessionManager._platformSession) {
      throw new Error("Cannot set tracking mode when the session is Initialized.");
    }
    this._trackingMode = value;
  }

  /**
   * @param xrManager - The xr manager
   * @param trackingMode - The tracking mode
   */
  constructor(xrManager: XRManager, trackingMode: XRMovementTrackingMode = XRMovementTrackingMode.Dof6) {
    super(xrManager);
    this._trackingMode = trackingMode;
    this._platformFeature = <IXRMovementTracking>(
      xrManager._platformDevice.createFeature(XRFeatureType.MovementTracking)
    );
  }

  override _generateConfig(): IXRMovementTrackingConfig {
    return { type: XRFeatureType.MovementTracking, mode: this._trackingMode };
  }
}
