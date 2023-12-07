import { IXRReferenceImage, IXRRequestImageTracking, IXRTrackedImage } from "@galacean/engine-design";
import { XRManager, registerXRFeature } from "../../../XRManager";
import { XRFeatureType } from "../../XRFeatureType";
import { XRRequestTrackingState } from "../XRRequestTrackingState";
import { XRTrackableFeature } from "../XRTrackableFeature";

/**
 * The manager of XR image tracking.
 */
@registerXRFeature(XRFeatureType.ImageTracking)
export class XRImageTracking extends XRTrackableFeature<IXRTrackedImage, IXRRequestImageTracking> {
  private _images: IXRReferenceImage[];
  /**
   * The images to be tracked
   */
  get images(): readonly IXRReferenceImage[] {
    return this._images;
  }

  /**
   * @param xrManager - The xr manager
   * @param images - The images to be tracked
   */
  constructor(xrManager: XRManager, images: IXRReferenceImage[]) {
    super(xrManager, XRFeatureType.ImageTracking, images);
    this._images = images;
    const imageLength = images ? images.length : 0;
    if (imageLength > 0) {
      for (let i = 0, n = images.length; i < n; i++) {
        this._addRequestTracking({
          image: images[i],
          state: XRRequestTrackingState.None,
          tracked: []
        });
      }
    } else {
      console.warn("No image to be tracked.");
    }
  }
}
