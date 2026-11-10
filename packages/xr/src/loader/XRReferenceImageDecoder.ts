import { AssetPromise, BufferReader, Engine, ImageDecoder, decoder } from "@galacean/engine";
import { XRReferenceImage } from "../feature/trackable/image/XRReferenceImage";

@decoder("XRReferenceImage")
export class XRReferenceImageDecoder {
  static decode(engine: Engine, bufferReader: BufferReader): AssetPromise<XRReferenceImage> {
    return new AssetPromise((resolve, reject) => {
      const physicalWidth = bufferReader.nextFloat32();
      bufferReader.nextUint8();
      const img = new Image();
      img.onload = () => {
        resolve(new XRReferenceImage("", img, physicalWidth));
      };
      const imageData = bufferReader.nextImagesData(1)[0];
      img.src = URL.createObjectURL(new window.Blob([imageData], { type: ImageDecoder.getMimeType(imageData) }));
    });
  }
}
