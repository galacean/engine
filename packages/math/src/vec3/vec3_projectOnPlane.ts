import { projectOnVector } from "./vec3_projectOnVector";
import { subtract } from "./vec3_subtract";
import { create } from "./vec3_create";

var v = create();

/**
 * Returns project vector on a vector
 *
 * @param {vec3} a Vector cast projection
 * @param {vec3} n Normal vector of plane
 * @returns {vec3} out Project vector
 */
export function projectOnPlane(out, a, n) {
  projectOnVector(v, a, n);

  subtract(out, a, v);
  return out;
}
