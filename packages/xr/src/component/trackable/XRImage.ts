import { IXRReferenceImage, IXRTrackedImage } from "@galacean/engine-design";
import { XRFeatureType } from "@galacean/engine";
import { XRTrackedComponent } from "./XRTrackedComponent";
import { registerXRTrackedComponent } from "../../feature/trackable/XRTrackableManager";

@registerXRTrackedComponent(XRFeatureType.AnchorTracking)
/**
 * Tracked image in the XR world.
 */
export class XRImage extends XRTrackedComponent<IXRTrackedImage> {
  get referenceImage(): IXRReferenceImage {
    return null;
  }

  get measuredWidthInMeters(): number {
    return this._platformData.measuredWidthInMeters;
  }
}
