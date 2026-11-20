import { isImmutableWaterSnapshot } from "../../authoring/identity/WaterImmutableSnapshot";

const immutableNumericIdentityCache = new WeakMap<object, string>();
const scratchBuffer = new ArrayBuffer(8);
const scratchView = new DataView(scratchBuffer);
const scratchBytes = new Uint8Array(scratchBuffer);

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
  const view = scratchView;
  const bytes = scratchBytes;
  const len = values.length;
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
  const identity = `f64-v1:${len}:${low.toString(16)}:${(high >>> 0).toString(16)}`;
  if (immutable) immutableNumericIdentityCache.set(values, identity);
  return identity;
}
