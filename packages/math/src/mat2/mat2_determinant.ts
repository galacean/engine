/**
 * Calculates the determinant of a mat2
 *
 * @param {mat2} a the source matrix
 * @returns {Number} determinant of a
 */
export function determinant(a) {
  return a[0] * a[3] - a[2] * a[1];
}
