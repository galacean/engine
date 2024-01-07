/**
 *  A reference image is an image to look for in the physical environment.
 */
export interface IXRReferenceImage {
  name: string;
  imageSource: ImageBitmapSource;
  physicalWidth: number;
}
