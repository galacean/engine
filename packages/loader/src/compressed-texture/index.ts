import { CompressedTextureData } from "./type";
import { khronosTextureContainerParser } from "./KhronosTextureContainer";

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
