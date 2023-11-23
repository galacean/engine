import {
  IXRTrackedPlane,
  IXRPlaneTracking,
  IXRPlaneTrackingConfig,
  IXRRequestPlaneTracking
} from "@galacean/engine-design";
import { XRPlaneMode } from "./XRPlaneMode";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRFeatureType } from "../../XRFeatureType";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { Engine } from "../../../../Engine";

/**
 * The manager of plane tracking feature.
 */
export class XRPlaneTracking extends XRTrackableFeature<
  IXRPlaneTrackingConfig,
  IXRTrackedPlane,
  IXRRequestPlaneTracking,
  IXRPlaneTracking
> {
  /**
   * Return the plane detection mode for XR.
   */
  get detectionMode(): XRPlaneMode {
    return this._requestTrackings[0].detectionMode;
  }

  set detectionMode(value: XRPlaneMode) {
    this._requestTrackings[0].detectionMode = value;
  }

  /**
   * @param engine - The engine
   * @param detectionMode - The plane detection mode
   */
  constructor(engine: Engine, detectionMode: XRPlaneMode = XRPlaneMode.EveryThing) {
    super(engine);
    this._config = { type: XRFeatureType.PlaneTracking, mode: detectionMode };
    this._platformFeature = <IXRPlaneTracking>engine.xrManager._xrDevice.createFeature(XRFeatureType.PlaneTracking);
    this._addRequestTracking({
      state: XRRequestTrackingState.None,
      detectionMode,
      tracked: []
    });
  }

  override _generateConfig(): IXRPlaneTrackingConfig {
    this._config.mode = this._requestTrackings[0].detectionMode;
    return this._config;
  }
}
