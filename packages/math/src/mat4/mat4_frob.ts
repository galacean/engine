/**
 * Returns Frobenius norm of a mat4
 *
 * @param {mat4} a the matrix to calculate Frobenius norm of
 * @returns {Number} Frobenius norm
 */
export function frob(a) {
  return Math.sqrt(
    Math.pow(a[0], 2) +
      Math.pow(a[1], 2) +
      Math.pow(a[2], 2) +
      Math.pow(a[3], 2) +
      Math.pow(a[4], 2) +
      Math.pow(a[5], 2) +
      Math.pow(a[6], 2) +
      Math.pow(a[7], 2) +
      Math.pow(a[8], 2) +
      Math.pow(a[9], 2) +
      Math.pow(a[10], 2) +
      Math.pow(a[11], 2) +
      Math.pow(a[12], 2) +
      Math.pow(a[13], 2) +
      Math.pow(a[14], 2) +
      Math.pow(a[15], 2)
  );
}
