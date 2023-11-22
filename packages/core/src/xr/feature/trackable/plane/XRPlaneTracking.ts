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
    return this._platformFeature.detectionMode;
  }

  set detectionMode(value: XRPlaneMode) {
    this._platformFeature.detectionMode = value;
  }

  constructor(engine: Engine, detectionMode: XRPlaneMode.EveryThing) {
    super(engine);
    this._config = { type: XRFeatureType.PlaneTracking, mode: detectionMode };
    this._platformFeature = <IXRPlaneTracking>engine.xrManager._xrDevice.createFeature(XRFeatureType.PlaneTracking);
    this._addRequestTracking({
      state: XRRequestTrackingState.None,
      detectionMode,
      tracked: []
    });
  }
}
