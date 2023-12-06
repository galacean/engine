import { IXRRequestPlaneTracking, IXRTrackedPlane } from "@galacean/engine-design";
import { XRManager } from "../../../XRManager";
import { XRFeatureType } from "../../XRFeatureType";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRPlaneMode } from "./XRPlaneMode";

/**
 * The manager of plane tracking feature.
 */
export class XRPlaneTracking extends XRTrackableFeature<IXRTrackedPlane, IXRRequestPlaneTracking> {
  /**
   * @param xrManager - The xr manager
   * @param detectionMode - The plane detection mode
   */
  constructor(xrManager: XRManager, detectionMode: XRPlaneMode = XRPlaneMode.EveryThing) {
    super(xrManager, XRFeatureType.PlaneTracking, detectionMode);
    this._addRequestTracking({
      state: XRRequestTrackingState.None,
      detectionMode,
      tracked: []
    });
  }
}
