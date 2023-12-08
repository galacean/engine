import { IXRRequestTracking } from "../IXRRequestTracking";
import { IXRReferenceImage } from "./IXRReferenceImage";
import { IXRTrackedImage } from "./IXRTrackedImage";

export interface IXRRequestImage<T extends IXRTrackedImage> extends IXRRequestTracking<T> {
  image: IXRReferenceImage;
}
