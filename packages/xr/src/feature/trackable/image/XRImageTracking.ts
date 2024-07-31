import { XRManagerExtended, registerXRFeature } from "../../../XRManagerExtended";
import { XRFeatureType } from "../../XRFeatureType";
import { XRTrackableFeature } from "../XRTrackableFeature";
import { XRReferenceImage } from "./XRReferenceImage";
import { XRRequestImage } from "./XRRequestImage";
import { XRTrackedImage } from "./XRTrackedImage";

/**
 * The manager of XR image tracking.
 */
@registerXRFeature(XRFeatureType.ImageTracking)
export class XRImageTracking extends XRTrackableFeature<XRTrackedImage, XRRequestImage> {
  private _trackingImages: XRReferenceImage[];
  /**
   * The image to tracking.
   */
  get trackingImages(): readonly XRReferenceImage[] {
    return this._trackingImages;
  }

  /**
   * The tracked images.
   */
  get trackedImages(): readonly XRTrackedImage[] {
    return this._tracked;
  }

  /**
   * @param xrManager - The xr manager
   * @param trackingImages - The images to be tracked
   */
  constructor(xrManager: XRManagerExtended, trackingImages: XRReferenceImage[]) {
    super(xrManager, XRFeatureType.ImageTracking, trackingImages);
    this._trackingImages = trackingImages;
    const imageLength = trackingImages ? trackingImages.length : 0;
    if (imageLength > 0) {
      for (let i = 0, n = trackingImages.length; i < n; i++) {
        this._addRequestTracking(new XRRequestImage(trackingImages[i]));
      }
    } else {
      console.warn("No image to be tracked.");
    }
  }

  protected override _generateTracked(): XRTrackedImage {
    const image = new XRTrackedImage();
    image.id = XRTrackableFeature._uuid++;
    return image;
  }
}
