import { Engine, TextureCubeFace, TextureCubeMap } from "@oasis-engine/core";
import { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";

@decoder("TextureCube")
export class textureCubeDecoder {
  static decode(
    engine: Engine,
    arraybuffer: ArrayBuffer,
    byteOffset?: number,
    byteLength?: number
  ): Promise<TextureCubeMap> {
    return new Promise((resolve, reject) => {
      const bufferReader = new BufferReader(arraybuffer, byteOffset, byteLength);

      const objectId = bufferReader.nextStr();
      const mipmap = !!bufferReader.nextUint8();
      const filterMode = bufferReader.nextUint8();
      const anisoLevel = bufferReader.nextUint8();
      const wrapModeU = bufferReader.nextUint8();
      const wrapModeV = bufferReader.nextUint8();
      const format = bufferReader.nextUint8();
      const size = bufferReader.nextUint16();
      const mipCount = bufferReader.nextUint8();
      const imagesData = bufferReader.nextImagesData(mipCount);

      const textureCube = new TextureCubeMap(engine, size, format, mipmap);
      textureCube.filterMode = filterMode;
      textureCube.anisoLevel = anisoLevel;
      textureCube.wrapModeU = wrapModeU;
      textureCube.wrapModeV = wrapModeV;

      for (let i = 0; i < 6; i++) {
        const pixelBuffer = new Uint8Array(imagesData[i].buffer);
        textureCube.setPixelBuffer(TextureCubeFace.PositiveX + i, pixelBuffer);
      }

      if (mipmap) {
        textureCube.generateMipmaps();
        for (let i = 1; i < mipCount; i++) {
          for (let j = 0; j < 6; j++) {
            const pixelBuffer = new Uint8Array(imagesData[6 * i + j].buffer);
            textureCube.setPixelBuffer(TextureCubeFace.PositiveX + i, pixelBuffer);
          }
        }
      }

      // @ts-ignore
      engine.resourceManager._objectPool[objectId] = textureCube;

      resolve(textureCube);
    });
  }
}
