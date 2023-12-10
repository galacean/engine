import { XRTracked } from "../XRTracked";

/**
 * A tracked image in XR space.
 */
export class XRTrackedImage extends XRTracked {
  /** The width of the image in meters in the physical world. */
  measuredWidthInMeters: number;
}
