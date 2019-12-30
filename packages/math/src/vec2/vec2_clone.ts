import { ARRAY_TYPE } from "../MathUtil/MathUtil_ARRAY_TYPE";
/**
 * Creates a new vec2 initialized with values from an existing vector
 *
 * @param {vec2} a vector to clone
 * @returns {vec2} a new 2D vector
 */
export function clone(a) {
  let out = new ARRAY_TYPE(2);
  out[0] = a[0];
  out[1] = a[1];
  return out;
}
