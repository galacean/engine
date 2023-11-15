/**
 * An interface that defines a reference image.
 */
export interface IXRReferenceImage {
  /** The name of the image. */
  name: string;
  /** The src of the image. */
  src:
    | string
    | HTMLImageElement
    | SVGImageElement
    | HTMLVideoElement
    | HTMLCanvasElement
    | Blob
    | ImageData
    | ImageBitmap
    | OffscreenCanvas;
  /** The width of the image in meters. */
  physicalWidth: number;
  /** The height of the image in meters. */
  physicalHeight: number;
}
