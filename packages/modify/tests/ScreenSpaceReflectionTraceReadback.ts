import { RenderTarget, Texture2D, TextureFormat } from "@galacean/engine";

const BYTE_MAX = 255;
const HALF_SIGN_SHIFT = 15;
const HALF_EXPONENT_MASK = 0x1f;
const HALF_MANTISSA_BITS = 10;
const HALF_MANTISSA_SCALE = 1024;
const HALF_EXPONENT_BIAS = 15;
const HALF_EXPONENT_SPECIAL = 31;

function decodeHalf(bits: number): number {
  const sign = bits >> HALF_SIGN_SHIFT ? -1 : 1;
  const exponent = (bits >> HALF_MANTISSA_BITS) & HALF_EXPONENT_MASK;
  const mantissa = bits & (HALF_MANTISSA_SCALE - 1);
  if (exponent === 0) return sign * 2 ** (1 - HALF_EXPONENT_BIAS) * (mantissa / HALF_MANTISSA_SCALE);
  if (exponent === HALF_EXPONENT_SPECIAL) return mantissa ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - HALF_EXPONENT_BIAS) * (1 + mantissa / HALF_MANTISSA_SCALE);
}

/** Read the first colour attachment of an SSR trace target as RGBA floats, whatever its storage format. */
export function readTraceTarget(target: RenderTarget, size: number): Float32Array {
  const texture = target.getColorTexture(0) as Texture2D;
  const values = new Float32Array(size * size * 4);
  if (texture.format === TextureFormat.R16G16B16A16) {
    const halves = new Uint16Array(size * size * 4);
    texture.getPixelBuffer(0, 0, size, size, 0, halves);
    for (let i = 0; i < halves.length; i++) values[i] = decodeHalf(halves[i]);
  } else {
    const bytes = new Uint8Array(size * size * 4);
    texture.getPixelBuffer(0, 0, size, size, 0, bytes);
    for (let i = 0; i < bytes.length; i++) values[i] = bytes[i] / BYTE_MAX;
  }
  return values;
}
