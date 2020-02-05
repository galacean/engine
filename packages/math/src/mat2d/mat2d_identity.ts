/**
 * Set a mat2d to the identity matrix
 *
 * @param {mat2d} out the receiving matrix
 * @returns {mat2d} out
 */
export function identity(out) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
  out[4] = 0;
  out[5] = 0;
  return out;
}
