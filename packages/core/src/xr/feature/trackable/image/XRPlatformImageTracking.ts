import { IXRTrackedImage } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "../XRTrackablePlatformFeature";
import { XRReferenceImage } from "./XRReferenceImage";

export abstract class XRPlatformImageTracking extends XRTrackablePlatformFeature<IXRTrackedImage> {
  addReferenceImage(image: XRReferenceImage): void {}
  removeReferenceImage(image: XRReferenceImage): void {}
}
