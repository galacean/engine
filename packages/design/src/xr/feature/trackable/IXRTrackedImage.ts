import { IXRTrackable } from "./IXRTrackable";
import { IXRRequestTrackingImage } from "./IXRRequestTrackingImage";

export interface IXRTrackedImage extends IXRTrackable {
  requestTracking: IXRRequestTrackingImage;
  measuredWidthInMeters: number;
}
