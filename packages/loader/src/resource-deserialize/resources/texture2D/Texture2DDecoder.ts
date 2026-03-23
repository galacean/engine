import { AssetPromise, Engine, Texture2D, TextureFormat } from "@galacean/engine-core";
import { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";
import { HDRDecoder } from "../../../HDRDecoder";

/**
 * Data format: [url] [mipmap(1B)] [filterMode(1B)] [anisoLevel(1B)] [wrapModeU(1B)] [wrapModeV(1B)]
 * [format(1B)] [width(2B)] [height(2B)] [isSRGBColorSpace(1B)] [Uint32(imageSize) + imageBytes]
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
      const isSRGBColorSpace = !!bufferReader.nextUint8();

      const imageData = bufferReader.nextImagesData(1)[0];

      const isHDR = imageData[0] === 0x23 && imageData[1] === 0x3f;
      const textureFormat = isHDR ? TextureFormat.R16G16B16A16 : format;
      const texture =
        restoredTexture ||
        new Texture2D(engine, width, height, textureFormat, mipmap, isHDR ? false : isSRGBColorSpace);
      texture.filterMode = filterMode;
      texture.anisoLevel = anisoLevel;
      texture.wrapModeU = wrapModeU;
      texture.wrapModeV = wrapModeV;

      if (isHDR) {
        const { pixels } = HDRDecoder.decode(imageData);
        texture.setPixelBuffer(pixels);
        mipmap && texture.generateMipmaps();
        resolve(texture);
      } else {
        const blob = new Blob([imageData]);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(img.src);
          texture.setImageSource(img);
          mipmap && texture.generateMipmaps();
          resolve(texture);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
      }
    });
  }
}
