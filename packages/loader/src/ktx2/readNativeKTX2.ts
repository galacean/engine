import { TextureFormat, TextureUtils } from "@galacean/engine-core";
import { KTX2Container, SupercompressionScheme } from "./KTX2Container";

const nativeFormats: Partial<Record<number, [TextureFormat, Uint16ArrayConstructor | Float32ArrayConstructor]>> = {
  70: [TextureFormat.R16_UNORM, Uint16Array], // VK_FORMAT_R16_UNORM
  76: [TextureFormat.R16, Uint16Array], // VK_FORMAT_R16_SFLOAT
  83: [TextureFormat.R16G16, Uint16Array], // VK_FORMAT_R16G16_SFLOAT
  100: [TextureFormat.R32, Float32Array], // VK_FORMAT_R32_SFLOAT
  103: [TextureFormat.R32G32, Float32Array] // VK_FORMAT_R32G32_SFLOAT
};

export function readNativeKTX2(container: KTX2Container) {
  const layout = nativeFormats[container.vkFormat];
  if (!layout) return;

  const [format, ArrayType] = layout;
  const { pixelWidth: width, pixelHeight: height, levels } = container;
  const elementSize = ArrayType.BYTES_PER_ELEMENT;
  if (
    !width ||
    !height ||
    container.pixelDepth !== 0 ||
    container.layerCount !== 0 ||
    container.faceCount !== 1 ||
    container.typeSize !== elementSize ||
    container.isSRGB ||
    container.supercompressionScheme !== SupercompressionScheme.None
  ) {
    throw new Error("KTX2 native requires an unsupercompressed, linear 2D texture");
  }
  const fullMipCount = Math.floor(Math.log2(Math.max(width, height))) + 1;
  if (container.generateMipmaps || (levels.length !== 1 && levels.length !== fullMipCount)) {
    throw new Error("KTX2 native requires one explicit level or a complete mip chain");
  }
  const mipmaps = levels.map(({ levelData, uncompressedByteLength }, level) => {
    const mipWidth = Math.max(1, Math.floor(width / 2 ** level));
    const mipHeight = Math.max(1, Math.floor(height / 2 ** level));
    const byteLength = TextureUtils.getMipLevelByteCount(format, mipWidth, mipHeight);
    if (
      levelData.byteOffset % elementSize ||
      levelData.byteLength !== byteLength ||
      uncompressedByteLength !== byteLength
    ) {
      throw new Error(`Invalid KTX2 native data at mip level ${level}`);
    }
    return { data: new ArrayType(levelData.buffer, levelData.byteOffset, byteLength / elementSize) };
  });
  return { width, height, format, faces: [mipmaps] };
}
