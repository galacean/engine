import { AssetPromise, Engine, Texture2D, TextureFormat } from "@galacean/engine-core";
import { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";
import { HDRDecoder } from "../../../HDRDecoder";
import { ImageDecoder } from "../../../ImageDecoder";

/**
 * Data format: [url] [mipmap(1B)] [filterMode(1B)] [anisoLevel(1B)] [wrapModeU(1B)] [wrapModeV(1B)]
 * [format(1B)] [width(2B)] [height(2B)] [isSRGBColorSpace(1B)] [Uint32(imageSize) + imageBytes]
 */
@decoder("Texture2D")
class Texture2DDecoder {
  static decode(engine: Engine, bufferReader: BufferReader, restoredTexture?: Texture2D): AssetPromise<Texture2D> {
    const url = bufferReader.nextStr();
    const mipmap = !!bufferReader.nextUint8();
    const filterMode = bufferReader.nextUint8();
    const anisoLevel = bufferReader.nextUint8();
    const wrapModeU = bufferReader.nextUint8();
    const wrapModeV = bufferReader.nextUint8();
    let format = bufferReader.nextUint8();
    const width = bufferReader.nextUint16();
    const height = bufferReader.nextUint16();
    let isSRGBColorSpace = !!bufferReader.nextUint8();

    const imageData = bufferReader.nextImagesData(1)[0];
    const isHDR = imageData[0] === 0x23 && imageData[1] === 0x3f;
    if (isHDR) {
      format = TextureFormat.R16G16B16A16_SFloat;
      isSRGBColorSpace = false;
    }

    const getTexture = (): Texture2D => {
      if (restoredTexture) {
        return restoredTexture;
      }
      const generateMipmap = mipmap && engine._hardwareRenderer.supportsGenerateMipmaps(format, isSRGBColorSpace);
      const texture = new Texture2D(engine, width, height, format, generateMipmap, isSRGBColorSpace);
      texture.filterMode = filterMode;
      texture.anisoLevel = anisoLevel;
      texture.wrapModeU = wrapModeU;
      texture.wrapModeV = wrapModeV;
      return texture;
    };

    if (isHDR) {
      return new AssetPromise((resolve) => {
        const { pixels } = HDRDecoder.decode(imageData);
        const texture = getTexture();
        texture.setPixelBuffer(pixels);
        texture.generateMipmaps();
        resolve(texture);
      });
    }

    return ImageDecoder._withTextureSource(imageData, url, undefined, (img) => {
      const texture = getTexture();
      texture.setImageSource(img);
      texture.generateMipmaps();
      return texture;
    });
  }
}
