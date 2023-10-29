import { registerXRFeatureManager } from "../../../XRModule";
import { XRFeatureType } from "../../XRFeatureType";
import { XRReferenceImage } from "./XRReferenceImage";
import { IXRImageTrackingDescriptor } from "./IXRImageTrackingDescriptor";
import { XRTrackableManager } from "../XRTrackableManager";
import { IXRTrackedImage } from "@galacean/engine-design";
import { XRPlatformImageTracking } from "./XRPlatformImageTracking";

@registerXRFeatureManager(XRFeatureType.ImageTracking)
export class XRImageTrackingManager extends XRTrackableManager<
  IXRImageTrackingDescriptor,
  XRPlatformImageTracking,
  IXRTrackedImage
> {
  addReferenceImage(image: XRReferenceImage): void {
    const { referenceImages } = <IXRImageTrackingDescriptor>this._descriptor;
    if (referenceImages.indexOf(image) < 0) {
      referenceImages.push(image);
      this.platformFeature.addReferenceImage(image);
    }
  }

  removeReferenceImage(image: XRReferenceImage): void {
    const { referenceImages } = <IXRImageTrackingDescriptor>this._descriptor;
    const idx = referenceImages.indexOf(image);
    const lastIdx = referenceImages.length - 1;
    if (idx >= 0) {
      if (idx !== lastIdx) {
        referenceImages[idx] = referenceImages[lastIdx];
      }
      referenceImages.length = lastIdx;
      this.platformFeature.removeReferenceImage(image);
    }
  }
}
