import { isImmutableWaterSnapshot } from "../../authoring/identity/WaterImmutableSnapshot";

const immutableNumericIdentityCache = new WeakMap<object, string>();
const scratchBuffer = new ArrayBuffer(8);
const scratchView = new DataView(scratchBuffer);
const scratchBytes = new Uint8Array(scratchBuffer);

// Precompute exact IEEE-754 little-endian Float64 bytes for 0..255 so Uint8Array/Uint8ClampedArray
// hashing skips millions of DataView.setFloat64 calls while remaining bit-for-bit identical.
const uint8Float64Bytes = new Uint8Array(256 * 8);
{
  const initView = new DataView(uint8Float64Bytes.buffer);
  for (let i = 0; i < 256; i++) {
    initView.setFloat64(i * 8, i, true);
  }
}

/** Exact, ordered IEEE-754 content identity for numeric buffers, independent of their container.
 * This is a cache key, not a quantizer. Every value and every byte participates.
 */
export function numericContentIdentity(values: ArrayLike<number>): string {
  const immutable = isImmutableWaterSnapshot(values);
  if (immutable) {
    const cached = immutableNumericIdentityCache.get(values);
    if (cached !== undefined) return cached;
  }
  let low = 0x811c9dc5,
    high = 0x9e3779b9;
  const len = values.length;
  if (values instanceof Uint8Array || values instanceof Uint8ClampedArray) {
    const lut = uint8Float64Bytes;
    for (let index = 0; index < len; index++) {
      const off = values[index]! * 8;
      let b = lut[off]!;
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      b = lut[off + 1]!;
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      b = lut[off + 2]!;
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      b = lut[off + 3]!;
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      b = lut[off + 4]!;
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      b = lut[off + 5]!;
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      b = lut[off + 6]!;
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      b = lut[off + 7]!;
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
    }
  } else {
    const view = scratchView;
    const bytes = scratchBytes;
    for (let index = 0; index < len; index++) {
      view.setFloat64(0, values[index], true);
      let b = bytes[0];
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      b = bytes[1];
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      b = bytes[2];
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      b = bytes[3];
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      b = bytes[4];
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      b = bytes[5];
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      b = bytes[6];
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      b = bytes[7];
      low = Math.imul(low ^ b, 0x01000193) >>> 0;
      high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
    }
  }
  const identity = `f64-v1:${len}:${low.toString(16)}:${(high >>> 0).toString(16)}`;
  if (immutable) immutableNumericIdentityCache.set(values, identity);
  return identity;
}
