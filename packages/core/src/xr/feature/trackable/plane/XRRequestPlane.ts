import { XRRequestTracking } from "../XRRequestTracking";
import { XRTrackedPlane } from "./XRTrackedPlane";

/**
 * The request plane in XR space.
 */
export class XRRequestPlane extends XRRequestTracking<XRTrackedPlane> {
  /**
   * @param detectionMode - The plane detection mode
   */
  constructor(public detectionMode: number) {
    super();
  }
}
