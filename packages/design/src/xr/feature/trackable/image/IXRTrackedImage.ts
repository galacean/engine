import { IXRTracked } from "../IXRTracked";
import { IXRReferenceImage } from "./IXRReferenceImage";

export interface IXRTrackedImage extends IXRTracked {
  /** The reference image which was used to detect this image in the environment.  */
  referenceImage: IXRReferenceImage;
  /** The width of the image in meters in the physical world. */
  measuredWidthInMeters: number;
  /** The height of the image in meters in the physical world. */
  measuredHeightInMeters: number;
}
