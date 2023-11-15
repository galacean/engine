import { IXRTrackedPlane } from "../tracked/IXRTrackedPlane";
import { IXRRequestTracking } from "./IXRRequestTracking";

export interface IXRRequestTrackingPlane extends IXRRequestTracking<IXRTrackedPlane> {
  orientation: number;
}
