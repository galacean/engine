import { IXRRequestPlaneTracking, IXRTrackedPlane } from "@galacean/engine-design";
import { XRManager, registerXRFeature } from "../../../XRManager";
import { XRFeatureType } from "../../XRFeatureType";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRPlaneMode } from "./XRPlaneMode";

/**
 * The manager of plane tracking feature.
 */
@registerXRFeature(XRFeatureType.PlaneTracking)
export class XRPlaneTracking extends XRTrackableFeature<IXRTrackedPlane, IXRRequestPlaneTracking> {
  private _detectionMode: XRPlaneMode;
  /**
   * The plane detection mode.
   */
  get detectionMode(): XRPlaneMode {
    return this._detectionMode;
  }

  /**
   * @param xrManager - The xr manager
   * @param detectionMode - The plane detection mode
   */
  constructor(xrManager: XRManager, detectionMode: XRPlaneMode = XRPlaneMode.EveryThing) {
    super(xrManager, XRFeatureType.PlaneTracking, detectionMode);
    this._detectionMode = detectionMode;
    this._addRequestTracking({
      state: XRRequestTrackingState.None,
      detectionMode,
      tracked: []
    });
  }
}
