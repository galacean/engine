import { IXRRequestTracking } from "../IXRRequestTracking";
import { IXRReferenceImage } from "./IXRReferenceImage";
import { IXRTrackedImage } from "./IXRTrackedImage";

export interface IXRRequestImageTracking extends IXRRequestTracking<IXRTrackedImage> {
  image: IXRReferenceImage;
}
