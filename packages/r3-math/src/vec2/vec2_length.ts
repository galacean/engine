/**
 * Calculates the length of a vec2
 *
 * @param {vec2} a vector to calculate length of
 * @returns {Number} length of a
 */
export function length(a) {
  var x = a[0], y = a[1];
  return Math.sqrt(x*x + y*y);
};