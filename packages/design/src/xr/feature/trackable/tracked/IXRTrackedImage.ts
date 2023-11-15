import { IXRTracked } from "./IXRTracked";

/**
 * The interface of tracked image in XR.
 */
export interface IXRTrackedImage extends IXRTracked {
  /** The width of the image in meters in the physical world. */
  measuredWidthInMeters: number;
}
