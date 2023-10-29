import { IXRTrackedImage } from "@galacean/engine-design";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRReferenceImage } from "./XRReferenceImage";

export abstract class XRPlatformImageTracking extends XRTrackableFeature<IXRTrackedImage> {
  addReferenceImage(image: XRReferenceImage): void {}
  removeReferenceImage(image: XRReferenceImage): void {}
}
