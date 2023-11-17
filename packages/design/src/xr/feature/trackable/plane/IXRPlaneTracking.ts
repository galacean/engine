import { IXRRequestPlaneTracking } from "./IXRRequestPlaneTracking";
import { IXRTrackableFeature } from "../IXRTrackableFeature";
import { IXRTrackedPlane } from "./IXRTrackedPlane";

export interface IXRPlaneTracking extends IXRTrackableFeature<IXRTrackedPlane, IXRRequestPlaneTracking> {
  get detectionMode(): number;
  set detectionMode(mode: number);
}
