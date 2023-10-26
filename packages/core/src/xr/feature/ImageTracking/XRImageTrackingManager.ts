import { XRFeatureManager } from "../XRFeatureManager";
import { UpdateFlagManager } from "../../../UpdateFlagManager";
import { registerXRFeatureManager } from "../../XRModule";
import { EnumXRFeature } from "../../enum/EnumXRFeature";
import { XRReferenceImage } from "./XRReferenceImage";

@registerXRFeatureManager(EnumXRFeature.ImageTracking)
export class XRImageTrackingManager extends XRFeatureManager {
  private _referenceImages: XRReferenceImage[] = [];

  /** @internal */
  _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  addReferenceImage(image: XRReferenceImage): void {
    const { _referenceImages: referenceImages } = this;
    if (referenceImages.indexOf(image) < 0) {
      referenceImages.push(image);
    }
  }

  removeReferenceImage(image: XRReferenceImage): void {
    const { _referenceImages: referenceImages } = this;
    const idx = referenceImages.indexOf(image);
    const lastIdx = referenceImages.length - 1;
    if (idx >= 0) {
      if (idx !== lastIdx) {
        referenceImages[idx] = referenceImages[lastIdx];
      }
      referenceImages.length = lastIdx;
    }
  }

  addListener(fun: (type?: number, param?: Object) => any) {
    this._updateFlagManager.addListener(fun);
  }
}

export enum XRTrackingChangeFlags {
  add = 0x1,
  remove = 0x2,
  update = 0x4,
  all = 0x7
}
