import { IXRMovementTracking, IXRMovementTrackingConfig } from "@galacean/engine-design";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";
import { registerXRFeature } from "../../XRManager";
import { XRFeatureType } from "../XRFeatureType";
import { XRFeature } from "../XRFeature";
import { Engine } from "../../../Engine";

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
    this._config.mode = value;
    this._platformFeature.trackingMode = value;
  }

  constructor(engine: Engine) {
    super(engine);
    this._config = {
      type: XRFeatureType.MovementTracking,
      mode: XRMovementTrackingMode.Dof6
    };
    this._platformFeature = <IXRMovementTracking>(
      engine.xrManager._xrDevice.createFeature(XRFeatureType.MovementTracking)
    );
  }
}
