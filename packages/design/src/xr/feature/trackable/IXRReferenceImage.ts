export interface IXRReferenceImage {
  name: string;
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
  physicalWidth: number;
  physicalHeight: number;
  trackable: boolean;
}
