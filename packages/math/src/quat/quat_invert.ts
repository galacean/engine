/**
 * Calculates the inverse of a quat
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quat to calculate inverse of
 * @returns {quat} out
 */
export function invert(out, a) {
  let a0 = a[0],
    a1 = a[1],
    a2 = a[2],
    a3 = a[3];
  let dot = a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3;
  let invDot = dot ? 1.0 / dot : 0;

  // TODO: Would be faster to return [0,0,0,0] immediately if dot == 0

  out[0] = -a0 * invDot;
  out[1] = -a1 * invDot;
  out[2] = -a2 * invDot;
  out[3] = a3 * invDot;
  return out;
}
