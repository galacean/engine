import { ARRAY_TYPE } from "../MathUtil/MathUtil_ARRAY_TYPE";
/**
 * 2x3 Matrix
 * @module mat2d
 */

/**
 * Creates a new identity mat2d
 *
 * @returns {mat2d} a new 2x3 matrix
 */
export function create() {
  let out = new ARRAY_TYPE(6);
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
  out[4] = 0;
  out[5] = 0;
  return out;
}
