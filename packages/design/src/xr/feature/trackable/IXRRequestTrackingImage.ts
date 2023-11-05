import { IXRReferenceImage } from "./IXRReferenceImage";
import { IXRTrackedImage } from "./IXRTrackedImage";

export interface IXRRequestTrackingImage {
  state: number;
  image: IXRReferenceImage;
  trackedResult?: IXRTrackedImage;
  dispose?: (image: IXRRequestTrackingImage) => any;
}
