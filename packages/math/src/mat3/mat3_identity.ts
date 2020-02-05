/**
 * Set a mat3 to the identity matrix
 *
 * @param {mat3} out the receiving matrix
 * @returns {mat3} out
 */
export function identity(out) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
  return out;
}
