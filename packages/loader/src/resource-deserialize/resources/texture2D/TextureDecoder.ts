import { AssetPromise, Engine, Texture2D } from "@galacean/engine-core";
import { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";

/**
 * Data format: [url] [mipmap(1B)] [filterMode(1B)] [anisoLevel(1B)] [wrapModeU(1B)] [wrapModeV(1B)]
 * [format(1B)] [width(2B)] [height(2B)] [isPixelBuffer(1B)] [isSRGBColorSpace(1B)] [mipCount(1B)] [imageData...]
 */
@decoder("Texture2D")
export class Texture2DDecoder {
  static decode(engine: Engine, bufferReader: BufferReader, restoredTexture?: Texture2D): AssetPromise<Texture2D> {
    return new AssetPromise((resolve, reject) => {
      const url = bufferReader.nextStr();
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

      const texture2D = restoredTexture || new Texture2D(engine, width, height, format, mipmap, isSRGBColorSpace);
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
        engine.resourceManager._objectPool[url] = texture2D;
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
