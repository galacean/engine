import { IXRMovementTracking, IXRMovementTrackingConfig } from "@galacean/engine-design";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";
import { XRFeatureType } from "../XRFeatureType";
import { XRFeature } from "../XRFeature";
import { Engine } from "../../../Engine";

/**
 * The manager of XR movement tracking.
 */
export class XRMovementTracking extends XRFeature<IXRMovementTrackingConfig, IXRMovementTracking> {
  /**
   * Get the tracking mode.
   */
  get trackingMode(): XRMovementTrackingMode {
    return this._config.mode;
  }

  constructor(engine: Engine, trackingMode: XRMovementTrackingMode = XRMovementTrackingMode.Dof6) {
    super(engine);
    this._config = { type: XRFeatureType.MovementTracking, mode: trackingMode };
    this._platformFeature = <IXRMovementTracking>(
      engine.xrManager._xrDevice.createFeature(XRFeatureType.MovementTracking)
    );
  }
}
