import { Engine, Texture2D } from "@oasis-engine/core";
import { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";

@decoder("Texture2D")
export class Texture2DDecoder {
  static decode(
    engine: Engine,
    arraybuffer: ArrayBuffer,
    byteOffset?: number,
    byteLength?: number
  ): Promise<Texture2D> {
    return new Promise((resolve, reject) => {
      const bufferReader = new BufferReader(arraybuffer, byteOffset, byteLength);

      const objectId = bufferReader.nextStr();
      const mipmap = !!bufferReader.nextUint8();
      const filterMode = bufferReader.nextUint8();
      const anisoLevel = bufferReader.nextUint8();
      const wrapModeU = bufferReader.nextUint8();
      const wrapModeV = bufferReader.nextUint8();
      const format = bufferReader.nextUint8();
      const width = bufferReader.nextUint16();
      const height = bufferReader.nextUint16();
      const imageDataCount = bufferReader.nextUint8();
      const imagesData = bufferReader.nextImagesData(imageDataCount);

      const texture2D = new Texture2D(engine, width, height, format, mipmap);
      texture2D.filterMode = filterMode;
      texture2D.anisoLevel = anisoLevel;
      texture2D.wrapModeU = wrapModeU;
      texture2D.wrapModeV = wrapModeV;

      const pixelBuffer = new Uint8Array(imagesData[0].buffer);
      texture2D.setPixelBuffer(pixelBuffer);

      if (mipmap) {
        texture2D.generateMipmaps();
        for (let i = 1; i < imageDataCount; i++) {
          const pixelBuffer = new Uint8Array(imagesData[i].buffer);
          texture2D.setPixelBuffer(pixelBuffer, i);
        }
      }

      // @ts-ignore
      engine.resourceManager._objectPool[objectId] = texture2D;

      resolve(texture2D);
    });
  }
}
