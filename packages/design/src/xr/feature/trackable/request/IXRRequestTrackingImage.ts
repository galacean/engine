import { IXRReferenceImage } from "../IXRReferenceImage";
import { IXRTrackedImage } from "../tracked/IXRTrackedImage";
import { IXRRequestTracking } from "./IXRRequestTracking";

export interface IXRRequestTrackingImage extends IXRRequestTracking<IXRTrackedImage> {
  image: IXRReferenceImage;
}
