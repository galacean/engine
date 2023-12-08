import { XRRequestTracking } from "../XRRequestTracking";
import { XRTrackedPlane } from "./XRTrackedPlane";

export class XRRequestPlane extends XRRequestTracking<XRTrackedPlane> {
  constructor(public detectionMode: number) {
    super();
  }
}
