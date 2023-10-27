import { XRReferenceImage } from "../feature/ImageTracking/XRReferenceImage";
import { XRTrackable } from "./XRTrackable";

export class XRTrackingImage extends XRTrackable {
  private _referenceImage: XRReferenceImage;

  get referenceImage(): XRReferenceImage {
    return this._referenceImage;
  }

  set referenceImage(value: XRReferenceImage) {
    this._referenceImage = value;
  }
}
