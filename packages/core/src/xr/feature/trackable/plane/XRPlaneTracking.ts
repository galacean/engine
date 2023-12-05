import {
  IXRPlaneTracking,
  IXRPlaneTrackingConfig,
  IXRRequestPlaneTracking,
  IXRTrackedPlane
} from "@galacean/engine-design";
import { XRManager } from "../../../XRManager";
import { XRFeatureType } from "../../XRFeatureType";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRPlaneMode } from "./XRPlaneMode";

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
   * @param xrManager - The xr manager
   * @param detectionMode - The plane detection mode
   */
  constructor(xrManager: XRManager, detectionMode: XRPlaneMode = XRPlaneMode.EveryThing) {
    super(xrManager);
    this._platformFeature = <IXRPlaneTracking>xrManager._platformDevice.createFeature(XRFeatureType.PlaneTracking);
    this._addRequestTracking({
      state: XRRequestTrackingState.None,
      detectionMode,
      tracked: []
    });
  }

  override _generateConfig(): IXRPlaneTrackingConfig {
    return { type: XRFeatureType.PlaneTracking, mode: this._requestTrackings[0].detectionMode };
  }
}
