import { XRFeatureManager } from "../XRFeatureManager";
import { UpdateFlagManager } from "../../../UpdateFlagManager";
import { registerXRFeatureManager } from "../../XRModule";
import { EnumXRFeature } from "../../enum/EnumXRFeature";
import { XRReferenceImage } from "./XRReferenceImage";
import { IXRImageTrackingDescriptor } from "./IXRImageTrackingDescriptor";
import { EnumXRFeatureChangeFlag } from "../../enum/EnumXRFeatureChangeFlag";

@registerXRFeatureManager(EnumXRFeature.ImageTracking)
export class XRImageTrackingManager extends XRFeatureManager {
  /** @internal */
  _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

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
    this.platformFeature._onFlagChange(EnumXRFeatureChangeFlag.Descriptor, this._descriptor);
  }

  addListener(fun: (type?: XRTrackingChangeFlags, param?: Object) => any) {
    this._updateFlagManager.addListener(fun);
  }
}

export enum XRTrackingChangeFlags {
  add = 0x1,
  remove = 0x2,
  update = 0x4,
  all = 0x7
}
