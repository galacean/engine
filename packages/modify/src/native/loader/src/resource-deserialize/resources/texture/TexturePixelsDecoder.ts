import {
  AssetPromise,
  Engine,
  Texture2D,
  Texture2DArray,
  TextureCube,
  TextureFormat,
  TextureFilterMode,
  TextureWrapMode
} from "@galacean/engine-core";
import { BufferReader } from "../../utils/BufferReader";
import { FileHeader } from "../../utils/FileHeader";
import { decoder } from "../../utils/Decorator";

type PixelTexture = Texture2D | Texture2DArray | TextureCube;
interface EncodedTexturePixels {
  version: 1;
  dimension: "2d" | "2d-array" | "cube";
  width: number;
  height: number;
  layers: number;
  format: TextureFormat.R8G8B8A8 | TextureFormat.R32G32B32A32_UInt;
  srgb: boolean;
  filterMode: TextureFilterMode;
  wrapModeU: TextureWrapMode;
  wrapModeV: TextureWrapMode;
  anisoLevel: number;
  levels: { start: number; end: number }[];
}

/** Raw native texture payload, including explicit mips and array layers.
 * KTX2 remains a separate transport; materials reference a Texture in either case. */
@decoder("TexturePixels")
export class TexturePixelsDecoder {
  static decode(engine: Engine, reader: BufferReader, restored?: PixelTexture): AssetPromise<PixelTexture> {
    return new AssetPromise((resolve, reject) => {
      let texture: PixelTexture | undefined;
      try {
        const { data, payloads } = readTexturePixels(reader);
        const { dimension, width, height, layers, format, levels } = data;
        const Type = dimension === "cube" ? TextureCube : dimension === "2d-array" ? Texture2DArray : Texture2D;
        if (
          restored &&
          (!(restored instanceof Type) ||
            restored.width !== width ||
            restored.height !== height ||
            restored.format !== format ||
            (restored instanceof Texture2DArray && restored.length !== layers) ||
            restored.mipmapCount !== levels.length ||
            restored.isSRGBColorSpace !== data.srgb)
        )
          throw Error("Cannot restore a different texture layout");
        texture =
          restored ??
          (dimension === "cube"
            ? new TextureCube(engine, width, format, levels.length > 1, data.srgb)
            : dimension === "2d-array"
              ? new Texture2DArray(engine, width, height, layers, format, levels.length > 1, data.srgb)
              : new Texture2D(engine, width, height, format, levels.length > 1, data.srgb));
        payloads.forEach((payload, mip) => {
          if (texture instanceof Texture2DArray) texture.setPixelBuffer(0, payload, mip);
          else if (texture instanceof TextureCube) {
            const length = payload.length / 6;
            for (let face = 0; face < 6; face++)
              texture.setPixelBuffer(face, payload.subarray(face * length, (face + 1) * length), mip);
          } else texture!.setPixelBuffer(payload, mip);
        });
        texture.filterMode = data.filterMode;
        texture.wrapModeU = data.wrapModeU;
        texture.wrapModeV = data.wrapModeV;
        texture.anisoLevel = data.anisoLevel;
        resolve(texture);
      } catch (error) {
        if (!restored) texture?.destroy();
        reject(error);
      }
    });
  }
}

/** Shared CPU validation for native texture imports. */
export function parseTexturePixelsData(buffer: ArrayBuffer) {
  if (!FileHeader.checkMagic(buffer)) throw Error("Expected native TexturePixels asset");
  const header = FileHeader.decode(buffer);
  if (header.type !== "TexturePixels") throw Error("Expected native TexturePixels asset");
  return readTexturePixels(new BufferReader(new Uint8Array(buffer), header.headerLength, header.dataLength));
}
function readTexturePixels(reader: BufferReader) {
  const data: EncodedTexturePixels = JSON.parse(reader.nextStr());
  const { dimension, width, height, layers, format, levels } = data;
  if (
    typeof data.srgb !== "boolean" ||
    (format === TextureFormat.R32G32B32A32_UInt && data.srgb) ||
    data.version !== 1 ||
    !["2d", "2d-array", "cube"].includes(dimension) ||
    ![width, height, layers].every((n) => Number.isSafeInteger(n) && n > 0 && n < 0x40000000) ||
    (dimension === "2d" && layers !== 1) ||
    (dimension === "cube" && (layers !== 6 || width !== height)) ||
    ![TextureFormat.R8G8B8A8, TextureFormat.R32G32B32A32_UInt].includes(format)
  )
    throw Error("Invalid native texture pixels header");
  const mipCount = 1 + Math.floor(Math.log2(Math.max(width, height)));
  if (!Array.isArray(levels) || (levels.length !== 1 && levels.length !== mipCount))
    throw Error("Native texture requires a complete mip chain");
  const offset = Math.ceil(reader.offset / 4) * 4;
  const pixelSize = format === TextureFormat.R8G8B8A8 ? 4 : 16;
  const payloads = levels.map(({ start, end }, mip) => {
    const length = Math.max(1, width >> mip) * Math.max(1, height >> mip) * layers * pixelSize;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start % 4 ||
      end - start !== length ||
      offset + end > reader.data.length
    )
      throw Error("Native texture mip size/range differs");
    const bytes = reader.data.subarray(offset + start, offset + end);
    return format === TextureFormat.R8G8B8A8
      ? bytes
      : new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  });
  if (
    ![0, 1, 2].includes(data.filterMode) ||
    ![0, 1, 2].includes(data.wrapModeU) ||
    ![0, 1, 2].includes(data.wrapModeV) ||
    !Number.isFinite(data.anisoLevel) ||
    data.anisoLevel < 1 ||
    (format === TextureFormat.R32G32B32A32_UInt && data.filterMode !== TextureFilterMode.Point)
  )
    throw Error("Invalid native texture sampling");
  return { data, payloads };
}
