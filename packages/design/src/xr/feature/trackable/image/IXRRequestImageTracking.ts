import { IXRRequestTracking } from "../IXRRequestTracking";
import { IXRTrackedImage } from "./IXRTrackedImage";

export interface IXRRequestImageTracking extends IXRRequestTracking<IXRTrackedImage> {
  image: any;
}
