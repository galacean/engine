import { IXRRequestTracking } from "../IXRRequestTracking";
import { IXRTrackedPlane } from "./IXRTrackedPlane";

export interface IXRRequestPlane<T extends IXRTrackedPlane> extends IXRRequestTracking<T> {
  detectionMode: number;
}
