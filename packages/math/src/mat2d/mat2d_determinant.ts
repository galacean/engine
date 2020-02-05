/**
 * Calculates the determinant of a mat2d
 *
 * @param {mat2d} a the source matrix
 * @returns {Number} determinant of a
 */
export function determinant(a) {
  return a[0] * a[3] - a[1] * a[2];
}
