import { XRManagerExtended, registerXRFeature } from "../../../XRManagerExtended";
import { XRFeatureType } from "../../XRFeatureType";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRPlaneMode } from "./XRPlaneMode";
import { XRRequestPlane } from "./XRRequestPlane";
import { XRTrackedPlane } from "./XRTrackedPlane";

/**
 * The manager of plane tracking feature.
 */
@registerXRFeature(XRFeatureType.PlaneTracking)
export class XRPlaneTracking extends XRTrackableFeature<XRTrackedPlane, XRRequestPlane> {
  /**
   * The plane detection mode.
   */
  get detectionMode(): XRPlaneMode {
    return this._requestTrackings[0].detectionMode;
  }

  /**
   * The tracked planes.
   */
  get trackedPlanes(): readonly XRTrackedPlane[] {
    return this._tracked;
  }

  /**
   * @param xrManager - The xr manager
   * @param detectionMode - The plane detection mode
   */
  constructor(xrManager: XRManagerExtended, detectionMode: XRPlaneMode = XRPlaneMode.EveryThing) {
    super(xrManager, XRFeatureType.PlaneTracking, detectionMode);
    this._addRequestTracking(new XRRequestPlane(detectionMode));
  }
}
