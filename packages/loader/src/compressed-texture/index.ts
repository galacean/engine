import { CompressedTextureData, CompressedCubeData } from "./type";
import { khronosTextureContainerParser } from "./KhronosTextureContainer";
import { TextureFormat } from "@galacean/engine-core";

export function parseSingleKTX(data: ArrayBuffer): CompressedTextureData {
  const ktx = khronosTextureContainerParser.parse(data, 1, true, true);
  return {
    mipmaps: ktx.mipmaps,
    engineFormat: ktx.engineFormat,
    internalFormat: ktx.glInternalFormat,
    width: ktx.pixelWidth,
    height: ktx.pixelHeight
  };
}

export function parseCubeKTX(dataArray: ArrayBuffer[]): CompressedCubeData {
  const mipmapsFaces = [];
  let internalFormat: number;
  let engineFormat: TextureFormat;
  let width: number;
  let height: number;
  for (let i = 0; i < dataArray.length; i++) {
    const ktx = khronosTextureContainerParser.parse(dataArray[i], 1, true, true);
    mipmapsFaces.push(ktx.mipmaps);
    if (i === 0) {
      width = ktx.pixelWidth;
      height = ktx.pixelHeight;
      internalFormat = ktx.glInternalFormat;
      engineFormat = ktx.engineFormat;
    }
  }
  return {
    mipmapsFaces,
    engineFormat,
    internalFormat,
    width,
    height
  };
}
