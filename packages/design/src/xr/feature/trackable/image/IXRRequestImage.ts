import { IXRRequestTracking } from "../IXRRequestTracking";
import { IXRReferenceImage } from "./IXRReferenceImage";
import { IXRTrackedImage } from "./IXRTrackedImage";

export interface IXRRequestImage extends IXRRequestTracking<IXRTrackedImage> {
  image: IXRReferenceImage;
}
