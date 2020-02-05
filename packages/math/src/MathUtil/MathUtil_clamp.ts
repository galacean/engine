/**
 * clamp value between min and max
 *
 * @param {Number} value - the value clamp to
 * @param {number} min - the floor of clamp
 * @param {number} max - the ceil of clamp
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
