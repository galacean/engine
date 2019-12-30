import { ARRAY_TYPE } from "../MathUtil/MathUtil_ARRAY_TYPE";
/**
 * Creates a new vec2 initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @returns {vec2} a new 2D vector
 */
export function fromValues(x, y) {
  let out = new ARRAY_TYPE(2);
  out[0] = x;
  out[1] = y;
  return out;
}
