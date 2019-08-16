import { ARRAY_TYPE } from '../MathUtil/MathUtil_ARRAY_TYPE';
/**
 * 2 Dimensional Vector
 * @module vec2
 */

/**
 * Creates a new, empty vec2
 *
 * @returns {vec2} a new 2D vector
 */
export function create() {
  let out = new ARRAY_TYPE(2);
  out[0] = 0;
  out[1] = 0;
  return out;
}
