import { IXRReferenceImage } from "@galacean/engine-design";

/**
 *  A reference image is an image to look for in the physical environment.
 */
export class XRReferenceImage implements IXRReferenceImage {
  /**
   * Create a reference image.
   * @param name - The name of the image to be tracked
   * @param imageSource - The image to be tracked
   * @param physicalWidth - The expected physical width measurement for the real-world image being tracked in meters
   */
  constructor(
    public name: string,
    public imageSource: ImageBitmapSource,
    public physicalWidth: number
  ) {}
}
