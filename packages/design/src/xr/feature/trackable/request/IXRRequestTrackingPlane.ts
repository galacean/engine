import { IXRTrackedPlane } from "../tracked/IXRTrackedPlane";
import { IXRRequestTracking } from "./IXRRequestTracking";

/**
 * The interface for request tracking plane in XR.
 */
export interface IXRRequestTrackingPlane extends IXRRequestTracking<IXRTrackedPlane> {
  /**
   * Rules for detecting planes，which can be horizontal, vertical or everything.
   */
  orientation: number;
}
