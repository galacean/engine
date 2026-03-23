import { AssetPromise, Engine, TextureCube, TextureCubeFace, TextureFormat } from "@galacean/engine-core";
import { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";
import { HDRDecoder } from "../../../HDRDecoder";

/**
 * Data format: [url] [mipmap(1B)] [filterMode(1B)] [anisoLevel(1B)] [wrapModeU(1B)] [wrapModeV(1B)]
 * [format(1B)] [faceSize(2B)] [isSRGBColorSpace(1B)] [Uint32(size) + faceBytes] × 6
 */
@decoder("TextureCube")
export class TextureCubeDecoder {
  static decode(engine: Engine, bufferReader: BufferReader, restoredTexture?: TextureCube): AssetPromise<TextureCube> {
    return new AssetPromise((resolve, reject) => {
      const url = bufferReader.nextStr();
      const mipmap = !!bufferReader.nextUint8();
      const filterMode = bufferReader.nextUint8();
      const anisoLevel = bufferReader.nextUint8();
      const wrapModeU = bufferReader.nextUint8();
      const wrapModeV = bufferReader.nextUint8();
      const format = bufferReader.nextUint8();
      const faceSize = bufferReader.nextUint16();
      const isSRGBColorSpace = !!bufferReader.nextUint8();

      const facesData = bufferReader.nextImagesData(6);

      // Detect format by first face's magic bytes
      const isHDR = facesData[0][0] === 0x23 && facesData[0][1] === 0x3f;
      const textureFormat = isHDR ? TextureFormat.R16G16B16A16 : format;
      const texture = restoredTexture || new TextureCube(engine, faceSize, textureFormat, mipmap, isSRGBColorSpace);
      texture.filterMode = filterMode;
      texture.anisoLevel = anisoLevel;
      texture.wrapModeU = wrapModeU;
      texture.wrapModeV = wrapModeV;

      if (isHDR) {
        for (let i = 0; i < 6; i++) {
          const { pixels } = HDRDecoder.decode(facesData[i]);
          texture.setPixelBuffer(TextureCubeFace.PositiveX + i, pixels, 0);
        }
        mipmap && texture.generateMipmaps();
        resolve(texture);
      } else {
        let loadedCount = 0;
        for (let i = 0; i < 6; i++) {
          const blob = new Blob([facesData[i]]);
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(img.src);
            texture.setImageSource(TextureCubeFace.PositiveX + i, img);
            if (++loadedCount === 6) {
              mipmap && texture.generateMipmaps();
              resolve(texture);
            }
          };
          img.onerror = reject;
          img.src = URL.createObjectURL(blob);
        }
      }
    });
  }
}
