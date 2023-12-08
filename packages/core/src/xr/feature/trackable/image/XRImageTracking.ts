import { IXRReferenceImage } from "@galacean/engine-design";
import { XRManager, registerXRFeature } from "../../../XRManager";
import { XRFeatureType } from "../../XRFeatureType";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRRequestImage } from "./XRRequestImage";
import { XRTrackedImage } from "./XRTrackedImage";

/**
 * The manager of XR image tracking.
 */
@registerXRFeature(XRFeatureType.ImageTracking)
export class XRImageTracking extends XRTrackableFeature<XRTrackedImage, XRRequestImage> {
  /**
   * The image to tracking.
   */
  get requestImages(): readonly XRRequestImage[] {
    return this._requestTrackings;
  }

  /**
   * The tracked images.
   */
  get trackedImages(): readonly XRTrackedImage[] {
    return this._tracked;
  }

  /**
   * @param xrManager - The xr manager
   * @param images - The images to be tracked
   */
  constructor(xrManager: XRManager, images: IXRReferenceImage[]) {
    super(xrManager, XRFeatureType.ImageTracking, images);
    const imageLength = images ? images.length : 0;
    if (imageLength > 0) {
      for (let i = 0, n = images.length; i < n; i++) {
        this._addRequestTracking(new XRRequestImage(images[i]));
      }
    } else {
      console.warn("No image to be tracked.");
    }
  }
}
