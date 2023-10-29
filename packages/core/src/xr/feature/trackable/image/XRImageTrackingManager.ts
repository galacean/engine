import { registerXRFeatureManager } from "../../../XRModule";
import { XRFeatureType } from "../../XRFeatureType";
import { XRReferenceImage } from "./XRReferenceImage";
import { IXRImageTrackingDescriptor } from "./IXRImageTrackingDescriptor";
import { XRFeatureChangeFlag } from "../../XRFeatureChangeFlag";
import { XRTrackableManager } from "../XRTrackableManager";
import { IXRTrackedImage } from "@galacean/engine-design";

@registerXRFeatureManager(XRFeatureType.ImageTracking)
export class XRImageTrackingManager extends XRTrackableManager<IXRImageTrackingDescriptor, IXRTrackedImage> {
  addReferenceImage(image: XRReferenceImage): void {
    const { referenceImages } = <IXRImageTrackingDescriptor>this._descriptor;
    if (referenceImages.indexOf(image) < 0) {
      referenceImages.push(image);
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
    }
    this.platformFeature._onFeatureChange(XRFeatureChangeFlag.Descriptor, this._descriptor);
  }
}
