import { IXRRequestTrackingAnchor } from "./IXRRequestTrackingAnchor";
import { IXRTrackable } from "./IXRTrackable";

export interface IXRTrackedAnchor extends IXRTrackable {
  requestTracking: IXRRequestTrackingAnchor;
}
