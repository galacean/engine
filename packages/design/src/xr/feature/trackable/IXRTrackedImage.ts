import { IXRTrackable } from "./IXRTrackable";
import { IXRReferenceImage } from "./IXRReferenceImage";

export interface IXRTrackedImage extends IXRTrackable {
  referenceImage: IXRReferenceImage;
  measuredWidthInMeters: number;
}
