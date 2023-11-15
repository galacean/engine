import { IXRReferenceImage } from "@galacean/engine-design";

/**
 *  A reference image is an image to look for in the physical environment.
 */
export class XRReferenceImage implements IXRReferenceImage {
  private static _uuid: number = 0;

  private _id: number;
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
  ) {
    this._id = XRReferenceImage._uuid++;
  }

  get id(): number {
    return this._id;
  }

  dispose() {
    this.name = this.src = null;
  }
}
