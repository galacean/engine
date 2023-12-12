import { IXRRequestTracking } from "../IXRRequestTracking";
import { IXRTrackedPlane } from "./IXRTrackedPlane";

export interface IXRRequestPlane extends IXRRequestTracking<IXRTrackedPlane> {
  detectionMode: number;
}
