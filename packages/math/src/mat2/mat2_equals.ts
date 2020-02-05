import { EPSILON } from "../MathUtil/MathUtil_EPSILON";
/**
 * Returns whether or not the matrices have approximately the same elements in the same position.
 *
 * @param {mat2} a The first matrix.
 * @param {mat2} b The second matrix.
 * @returns {Boolean} True if the matrices are equal, false otherwise.
 */
export function equals(a, b) {
  let a0 = a[0],
    a1 = a[1],
    a2 = a[2],
    a3 = a[3];
  let b0 = b[0],
    b1 = b[1],
    b2 = b[2],
    b3 = b[3];
  return (
    Math.abs(a0 - b0) <= EPSILON * Math.max(1.0, Math.abs(a0), Math.abs(b0)) &&
    Math.abs(a1 - b1) <= EPSILON * Math.max(1.0, Math.abs(a1), Math.abs(b1)) &&
    Math.abs(a2 - b2) <= EPSILON * Math.max(1.0, Math.abs(a2), Math.abs(b2)) &&
    Math.abs(a3 - b3) <= EPSILON * Math.max(1.0, Math.abs(a3), Math.abs(b3))
  );
}
