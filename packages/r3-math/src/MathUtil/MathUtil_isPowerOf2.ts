
/**
 * Check is power of 2
 *
 * @param {Number} a Input number
 */
export function isPowerOf2( v ) {

  return ( v & ( v - 1 ) ) === 0;

}
