import { IXRReferenceImage } from "../IXRReferenceImage";
import { IXRTrackedImage } from "../tracked/IXRTrackedImage";
import { IXRRequestTracking } from "./IXRRequestTracking";

/**
 * The interface for request tracking image in XR.
 */
export interface IXRRequestTrackingImage extends IXRRequestTracking<IXRTrackedImage> {
  /**
   * The reference image to be tracked.
   */
  image: IXRReferenceImage;
}
