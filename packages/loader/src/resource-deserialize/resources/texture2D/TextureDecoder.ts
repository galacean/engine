import { Engine, Texture2D } from "@galacean/engine-core";
import { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";

@decoder("Texture2D")
export class Texture2DDecoder {
  static decode(engine: Engine, bufferReader: BufferReader): Promise<Texture2D> {
    return new Promise((resolve, reject) => {
      const objectId = bufferReader.nextStr();
      const mipmap = !!bufferReader.nextUint8();
      const filterMode = bufferReader.nextUint8();
      const anisoLevel = bufferReader.nextUint8();
      const wrapModeU = bufferReader.nextUint8();
      const wrapModeV = bufferReader.nextUint8();
      const format = bufferReader.nextUint8();
      const width = bufferReader.nextUint16();
      const height = bufferReader.nextUint16();
      const isPixelBuffer = bufferReader.nextUint8();
      const isSRGBColorSpace = !!bufferReader.nextUint8();

      const mipCount = bufferReader.nextUint8();
      const imagesData = bufferReader.nextImagesData(mipCount);

      const texture2D = new Texture2D(engine, width, height, format, mipmap, undefined, isSRGBColorSpace);
      texture2D.filterMode = filterMode;
      texture2D.anisoLevel = anisoLevel;
      texture2D.wrapModeU = wrapModeU;
      texture2D.wrapModeV = wrapModeV;

      if (isPixelBuffer) {
        const pixelBuffer = imagesData[0];
        texture2D.setPixelBuffer(pixelBuffer);
        if (mipmap) {
          texture2D.generateMipmaps();
          for (let i = 1; i < mipCount; i++) {
            const pixelBuffer = imagesData[i];
            texture2D.setPixelBuffer(pixelBuffer, i);
          }
        }
        // @ts-ignore
        engine.resourceManager._objectPool[objectId] = texture2D;
        resolve(texture2D);
      } else {
        const blob = new window.Blob([imagesData[0]]);
        const img = new Image();
        img.onload = () => {
          texture2D.setImageSource(img);
          let completedCount = 0;
          const onComplete = () => {
            completedCount++;
            if (completedCount >= mipCount) {
              resolve(texture2D);
            }
          };
          onComplete();
          if (mipmap) {
            texture2D.generateMipmaps();
            for (let i = 1; i < mipCount; i++) {
              const blob = new window.Blob([imagesData[i]]);
              const img = new Image();
              img.onload = () => {
                texture2D.setImageSource(img, i);
                onComplete();
              };
              img.src = URL.createObjectURL(blob);
            }
          }
        };
        img.src = URL.createObjectURL(blob);
      }
    });
  }
}
