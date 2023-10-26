export class XRReferenceImage {
  name: string;
  src: string | ImageBitmap;
  physicalWidth: number = undefined;
  physicalHeight: number = undefined;

  dispose() {
    this.name = this.src = null;
  }
}
