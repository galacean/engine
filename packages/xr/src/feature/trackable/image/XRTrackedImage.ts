import { IXRTrackedImage } from "@galacean/engine-design";
import { XRTracked } from "../XRTracked";
import { XRReferenceImage } from "./XRReferenceImage";

/**
 * A tracked image in XR space.
 */
export class XRTrackedImage extends XRTracked implements IXRTrackedImage {
  /** The reference image which was used to detect this image in the environment.  */
  referenceImage: XRReferenceImage;
  /** The width of the image in meters in the physical world. */
  measuredWidthInMeters: number;
  /** The height of the image in meters in the physical world. */
  measuredHeightInMeters: number;
}
