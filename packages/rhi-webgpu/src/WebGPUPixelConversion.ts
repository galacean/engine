import { TextureFormat } from "@galacean/engine-core";

/** Logical legacy pixel layouts stored in a native RGBA8 texture. */
export interface PixelPacking {
  bytes: number;
  bits?: readonly [number, number, number, number];
}
const rgb8: PixelPacking = { bytes: 3 };
const rgba4: PixelPacking = { bytes: 2, bits: [4, 4, 4, 4] };
const rgb5a1: PixelPacking = { bytes: 2, bits: [5, 5, 5, 1] };
const rgb565: PixelPacking = { bytes: 2, bits: [5, 6, 5, 0] };

/** getPixelBuffer's public layout can differ from its upload and GPU representations. */
export function readPixelBytes(format: TextureFormat, nativeBytes: number): number {
  switch (format) {
    case TextureFormat.R8G8B8_UNorm:
      return 4;
    case TextureFormat.R16_UNorm:
      return 8;
    case TextureFormat.R16_SFloat:
    case TextureFormat.R16G16_SFloat:
    case TextureFormat.R16G16B16A16_SFloat:
    case TextureFormat.R32_SFloat:
    case TextureFormat.R32G32_SFloat:
    case TextureFormat.R11G11B10_UFloat:
      return 16;
    default:
      return pixelPacking(format)?.bytes ?? nativeBytes;
  }
}

/** Decode a five-bit-exponent float with the specified mantissa width (half, R11/G11 or B10). */
function smallFloat(bits: number, mantissa: number): number {
  const fraction = bits & ((1 << mantissa) - 1),
    exponent = bits >> mantissa;
  if (exponent === 31) return fraction ? NaN : Infinity;
  return (exponent ? 1 + fraction / (1 << mantissa) : fraction / (1 << mantissa)) * 2 ** ((exponent || 1) - 15);
}

export function expandReadRow(
  format: TextureFormat,
  source: DataView,
  src: number,
  out: DataView,
  dst: number,
  width: number
): boolean {
  const half =
    format === TextureFormat.R16_SFloat ||
    format === TextureFormat.R16G16_SFloat ||
    format === TextureFormat.R16G16B16A16_SFloat;
  const full = format === TextureFormat.R32_SFloat || format === TextureFormat.R32G32_SFloat;
  const unorm = format === TextureFormat.R16_UNorm,
    packed = format === TextureFormat.R11G11B10_UFloat;
  if (!half && !full && !unorm && !packed) return false;
  const channels =
    format === TextureFormat.R16G16B16A16_SFloat
      ? 4
      : format === TextureFormat.R16G16_SFloat || format === TextureFormat.R32G32_SFloat
        ? 2
        : 1;
  for (let i = 0; i < width; i++) {
    if (unorm) {
      out.setUint16(dst, source.getUint16(src, true), true);
      out.setUint16(dst + 2, 0, true);
      out.setUint16(dst + 4, 0, true);
      out.setUint16(dst + 6, 65535, true);
      src += 2;
      dst += 8;
    } else if (packed) {
      const word = source.getUint32(src, true);
      out.setFloat32(dst, smallFloat(word & 0x7ff, 6), true);
      out.setFloat32(dst + 4, smallFloat((word >>> 11) & 0x7ff, 6), true);
      out.setFloat32(dst + 8, smallFloat(word >>> 22, 5), true);
      out.setFloat32(dst + 12, 1, true);
      src += 4;
      dst += 16;
    } else {
      for (let c = 0; c < 4; c++) {
        let v = c === 3 ? 1 : 0;
        if (c < channels) {
          if (half) {
            const u = source.getUint16(src, true);
            v = (u & 0x8000 ? -1 : 1) * smallFloat(u & 0x7fff, 10);
            src += 2;
          } else {
            v = source.getFloat32(src, true);
            src += 4;
          }
        }
        out.setFloat32(dst, v, true);
        dst += 4;
      }
    }
  }
  return true;
}

function unsignedFloat(value: number, mantissa: number): number {
  const scale = 1 << mantissa;
  if (Number.isNaN(value)) return 31 * scale + 1;
  if (value <= 0) return 0;
  if (!Number.isFinite(value)) return 31 * scale;
  const exponent = Math.max(-14, Math.floor(Math.log2(value)));
  if (exponent > 15) return 31 * scale;
  const normal = value >= 2 ** -14;
  const fraction = (value * 2 ** -exponent - (normal ? 1 : 0)) * scale;
  const lower = Math.floor(fraction),
    tail = fraction - lower;
  const rounded = lower + Number(tail > 0.5 || (tail === 0.5 && !!(lower & 1)));
  return (normal ? exponent + 15 : 0) * scale + rounded;
}

export function packR11G11B10(input: ArrayBufferView, pixelCount: number): Uint32Array {
  if (input.byteLength < pixelCount * 12) throw new RangeError("RGB float upload source is too small.");
  const src = new DataView(input.buffer, input.byteOffset, input.byteLength),
    out = new Uint32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const start = i * 12;
    out[i] =
      unsignedFloat(src.getFloat32(start, true), 6) |
      (unsignedFloat(src.getFloat32(start + 4, true), 6) << 11) |
      (unsignedFloat(src.getFloat32(start + 8, true), 5) << 22);
  }
  return out;
}

export function pixelPacking(format: TextureFormat): PixelPacking | undefined {
  switch (format) {
    case TextureFormat.R8G8B8_UNorm:
      return rgb8;
    case TextureFormat.R4G4B4A4_UNorm:
      return rgba4;
    case TextureFormat.R5G5B5A1_UNorm:
      return rgb5a1;
    case TextureFormat.R5G6B5_UNorm:
      return rgb565;
  }
}

export function unpackRGBA8(input: ArrayBufferView, pixelCount: number, packing: PixelPacking): Uint8Array {
  if (input.byteLength < pixelCount * packing.bytes) throw new RangeError("Packed texture upload is too small.");
  const bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const out = new Uint8Array(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const src = i * packing.bytes,
      dst = i * 4;
    if (!packing.bits) {
      out[dst] = bytes[src];
      out[dst + 1] = bytes[src + 1];
      out[dst + 2] = bytes[src + 2];
      out[dst + 3] = 255;
    } else {
      const value = bytes[src] | (bytes[src + 1] << 8);
      let shift = 16;
      for (let channel = 0; channel < 4; channel++) {
        const bits = packing.bits[channel],
          mask = (1 << bits) - 1;
        shift -= bits;
        out[dst + channel] = bits ? Math.round((((value >> shift) & mask) * 255) / mask) : 255;
      }
    }
  }
  return out;
}

export function packRGBA8Row(
  src: Uint8Array,
  srcStart: number,
  dst: Uint8Array,
  dstStart: number,
  width: number,
  packing: PixelPacking
): void {
  for (let i = 0; i < width; i++) {
    const read = srcStart + i * 4,
      write = dstStart + i * packing.bytes;
    if (!packing.bits) {
      dst[write] = src[read];
      dst[write + 1] = src[read + 1];
      dst[write + 2] = src[read + 2];
    } else {
      let value = 0;
      for (let channel = 0; channel < 4; channel++) {
        const bits = packing.bits[channel],
          mask = (1 << bits) - 1;
        value = (value << bits) | Math.round((src[read + channel] * mask) / 255);
      }
      dst[write] = value & 255;
      dst[write + 1] = value >> 8;
    }
  }
}
