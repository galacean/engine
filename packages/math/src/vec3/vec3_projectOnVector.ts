import { normalize } from "./vec3_normalize";
import { dot } from "./vec3_dot";

/**
 * Returns project vector on a vector
 *
 * @param {vec3} a Vector cast projection
 * @param {vec3} p Vector recieve projection
 * @returns {vec3} out Project vector
 */
export function projectOnVector(out, a, p) {
  normalize(p, p);

  const d = dot(a, p);

  out[0] = p[0] * d;
  out[1] = p[1] * d;
  out[2] = p[2] * d;

  return out;
}
