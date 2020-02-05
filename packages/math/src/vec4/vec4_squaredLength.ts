/**
 * Calculates the squared length of a vec4
 *
 * @param {vec4} a vector to calculate squared length of
 * @returns {Number} squared length of a
 */
export function squaredLength(a) {
  let x = a[0];
  let y = a[1];
  let z = a[2];
  let w = a[3];
  return x * x + y * y + z * z + w * w;
}
