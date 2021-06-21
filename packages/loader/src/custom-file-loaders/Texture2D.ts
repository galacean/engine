import { Engine, Texture2D } from "@oasis-engine/core";
import { loadImageBuffer } from "../Util";
import { BufferReader } from "./utils/BufferReader";

export class Texture2DDecoder {
  static decode(
    engine: Engine,
    arraybuffer: ArrayBuffer,
    byteOffset?: number,
    byteLength?: number
  ): Promise<Texture2D> {
    return new Promise((resolve, reject) => {
      const bufferReader = new BufferReader(arraybuffer, byteOffset, byteLength);

      const mipmap = bufferReader.nextUint8();
      const filterMode = bufferReader.nextUint8();
      const anisoLevel = bufferReader.nextUint8();
      const wrapModeU = bufferReader.nextUint8();
      const wrapModeV = bufferReader.nextUint8();
      const format = bufferReader.nextUint8();
      const width = bufferReader.nextUint16();
      const height = bufferReader.nextUint16();
      const imageData = bufferReader.nextImageData();

      const { buffer, type } = imageData;
      loadImageBuffer(buffer, type)
        .then((image) => {
          const texture2D = new Texture2D(engine, width, height, format, mipmap !== 0);
          texture2D.filterMode = filterMode;
          texture2D.anisoLevel = anisoLevel;
          texture2D.wrapModeU = wrapModeU;
          texture2D.wrapModeV = wrapModeV;
          texture2D.setImageSource(image);
          resolve(texture2D);
        })
        .catch((err) => {
          reject(err);
        });
    });
  }
}
