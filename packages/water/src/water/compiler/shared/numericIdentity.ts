/** Exact, ordered IEEE-754 content identity for numeric buffers, independent of their container.
 * This is a cache key, not a quantizer. Every value and every byte participates.
 */
export function numericContentIdentity(values: ArrayLike<number>): string {
  let low = 0x811c9dc5,
    high = 0x9e3779b9;
  const view = new DataView(new ArrayBuffer(8));
  for (let index = 0; index < values.length; index++) {
    view.setFloat64(0, values[index], true);
    for (let i = 0; i < 8; i++) {
      const byte = view.getUint8(i);
      low = Math.imul(low ^ byte, 0x01000193) >>> 0;
      high = Math.imul(high ^ byte, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
    }
  }
  return `f64-v1:${values.length}:${low.toString(16)}:${(high >>> 0).toString(16)}`;
}
