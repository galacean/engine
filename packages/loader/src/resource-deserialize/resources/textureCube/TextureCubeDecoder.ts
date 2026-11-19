import { AssetPromise, Engine, TextureCube, TextureCubeFace, TextureFormat } from "@galacean/engine-core";
import { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";
import { HDRDecoder } from "../../../HDRDecoder";
import { ImageDecoder } from "../../../ImageDecoder";

/**
 * Data format: [url] [mipmap(1B)] [filterMode(1B)] [anisoLevel(1B)] [wrapModeU(1B)] [wrapModeV(1B)]
 * [format(1B)] [faceSize(2B)] [isSRGBColorSpace(1B)] [Uint32(size) + faceBytes] × 6
 */
@decoder("TextureCube")
class TextureCubeDecoder {
  static decode(engine: Engine, bufferReader: BufferReader, restoredTexture?: TextureCube): AssetPromise<TextureCube> {
    const url = bufferReader.nextStr();
    const mipmap = !!bufferReader.nextUint8();
    const filterMode = bufferReader.nextUint8();
    const anisoLevel = bufferReader.nextUint8();
    const wrapModeU = bufferReader.nextUint8();
    const wrapModeV = bufferReader.nextUint8();
    let format = bufferReader.nextUint8();
    const faceSize = bufferReader.nextUint16();
    let isSRGBColorSpace = !!bufferReader.nextUint8();

    const facesData = bufferReader.nextImagesData(6);
    // Detect format by first face's magic bytes
    const isHDR = facesData[0][0] === 0x23 && facesData[0][1] === 0x3f;
    if (isHDR) {
      format = TextureFormat.R16G16B16A16_SFloat;
      isSRGBColorSpace = false;
    }

    const getTexture = (): TextureCube => {
      if (restoredTexture) {
        return restoredTexture;
      }
      const generateMipmap = mipmap && engine._hardwareRenderer.supportsGenerateMipmaps(format, isSRGBColorSpace);
      const texture = new TextureCube(engine, faceSize, format, generateMipmap, isSRGBColorSpace);
      texture.filterMode = filterMode;
      texture.anisoLevel = anisoLevel;
      texture.wrapModeU = wrapModeU;
      texture.wrapModeV = wrapModeV;
      return texture;
    };

    if (isHDR) {
      return new AssetPromise((resolve) => {
        const faces = facesData.map((faceData) => HDRDecoder.decode(faceData).pixels);
        const texture = getTexture();
        for (let i = 0; i < 6; i++) {
          texture.setPixelBuffer(TextureCubeFace.PositiveX + i, faces[i], 0);
        }
        texture.generateMipmaps();
        resolve(texture);
      });
    }

    return AssetPromise.all(facesData.map((faceData) => ImageDecoder._decode(faceData, url))).then((images) => {
      const texture = getTexture();
      for (let i = 0; i < 6; i++) {
        texture.setImageSource(TextureCubeFace.PositiveX + i, images[i]);
      }
      texture.generateMipmaps();
      return texture;
    });
  }
}
