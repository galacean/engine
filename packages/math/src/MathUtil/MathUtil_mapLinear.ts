/**
 * Linear mapping from range <a1, a2> to range <b1, b2>
 *
 * @param {Number} x - Value to be mapped.
 * @param {Number} a1 — Minimum value for range A.
 * @param {Number} a2 — Maximum value for range A.
 * @param {Number} b1 — Minimum value for range B.
 * @param {Number} b2 — Maximum value for range B.
 */
export function mapLinear(x, a1, a2, b1, b2) {
  return b1 + ((x - a1) * (b2 - b1)) / (a2 - a1);
}
