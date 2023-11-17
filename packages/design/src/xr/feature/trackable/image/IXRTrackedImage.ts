import { IXRTracked } from "../IXRTracked";

export interface IXRTrackedImage extends IXRTracked {
  /** The width of the image in meters in the physical world. */
  measuredWidthInMeters: number;
}
