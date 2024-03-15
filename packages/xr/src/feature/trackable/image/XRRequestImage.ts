import { IXRRequestImage } from "@galacean/engine-design";
import { XRRequestTracking } from "../XRRequestTracking";
import { XRReferenceImage } from "./XRReferenceImage";
import { XRTrackedImage } from "./XRTrackedImage";

/**
 * The request image in XR space.
 */
export class XRRequestImage extends XRRequestTracking<XRTrackedImage> implements IXRRequestImage {
  /**
   * @param image - The image to be tracked
   */
  constructor(public image: XRReferenceImage) {
    super();
  }
}
