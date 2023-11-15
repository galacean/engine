/**
 *  A reference image is an image to look for in the physical environment.
 */
export class XRReferenceImage {
  private static _uuid: number = 0;

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
    private _id: number = XRReferenceImage._uuid++,
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
