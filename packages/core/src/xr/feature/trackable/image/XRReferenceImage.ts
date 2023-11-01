import { IXRReferenceImage } from "@galacean/engine-design/types/xr/feature/trackable/IXRReferenceImage";

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
    public physicalHeight: number = undefined,
    public trackable: boolean = false
  ) {}

  dispose() {
    this.name = this.src = null;
  }
}
