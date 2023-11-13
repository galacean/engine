import { IXRReferenceImage, IXRTrackedImage } from "@galacean/engine-design";
import { XRTracked } from "./XRTracked";
import { registerXRComponent } from "../../XRManager";
import { XRFeatureType } from "../../feature/XRFeatureType";

@registerXRComponent(XRFeatureType.ImageTracking)
/**
 * Tracked image in the XR world.
 */
export class XRImage extends XRTracked<IXRTrackedImage> {
  get referenceImage(): IXRReferenceImage {
    return this._platformData.requestTracking.image;
  }

  get measuredWidthInMeters(): number {
    return this._platformData.measuredWidthInMeters;
  }
}
