import { IXRReferenceImage } from "@galacean/engine-design";

/**
 *  A reference image is an image to look for in the physical environment.
 */
export class XRReferenceImage implements IXRReferenceImage {
  constructor(
    public name: string,
    public src:
      | string
      | HTMLImageElement
      | SVGImageElement
      | HTMLVideoElement
      | HTMLCanvasElement
      | Blob
      | ImageData
      | ImageBitmap
      | OffscreenCanvas,
    public physicalWidth: number = undefined,
    public physicalHeight: number = undefined
  ) {}
}
