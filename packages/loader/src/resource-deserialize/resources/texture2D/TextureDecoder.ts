import { AssetPromise, Engine, Texture2D } from "@galacean/engine-core";
import { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";

@decoder("Texture2D")
export class Texture2DDecoder {
  static decode(engine: Engine, bufferReader: BufferReader): AssetPromise<Texture2D> {
    return new AssetPromise((resolve, reject) => {
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

      const mipCount = bufferReader.nextUint8();
      const imagesData = bufferReader.nextImagesData(mipCount);

      const texture2D = new Texture2D(engine, width, height, format, mipmap);
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
        let completedCount = 0;
        const onComplete = () => {
          completedCount++;
          if (completedCount >= mipCount) {
            resolve(texture2D);
          }
        };
        this._loadImageBuffer(imagesData[0]).then((img) => {
          texture2D.setImageSource(img);
          onComplete();
          if (mipmap) {
            texture2D.generateMipmaps();
            for (let i = 1; i < mipCount; i++) {
              this._loadImageBuffer(imagesData[i]).then((img) => {
                texture2D.setImageSource(img, i);
                onComplete();
              }, reject);
            }
          }
        }, reject);
      }
    });
  }

  private static _loadImageBuffer(imageBuffer: ArrayBuffer): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const blob = new window.Blob([imageBuffer]);
      const img = new Image();
      img.onerror = function () {
        reject(new Error("Failed to load image buffer"));
      };
      img.onload = function () {
        // Call requestAnimationFrame to avoid iOS's bug.
        requestAnimationFrame(() => {
          resolve(img);
          img.onload = null;
          img.onerror = null;
          img.onabort = null;
        });
      };
      img.crossOrigin = "anonymous";
      img.src = URL.createObjectURL(blob);
    });
  }
}
