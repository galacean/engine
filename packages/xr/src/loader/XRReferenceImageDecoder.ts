import { AssetPromise, BufferReader, Engine, decoder } from "@galacean/engine";
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
      img.src = URL.createObjectURL(new window.Blob([bufferReader.nextImagesData(1)[0]]));
    });
  }
}
