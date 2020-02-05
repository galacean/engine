import { RANDOM } from "../MathUtil/MathUtil_RANDOM";
import { normalize } from "./vec4_normalize";
import { scale } from "./vec4_scale";

/**
 * Generates a random vector with the given scale
 *
 * @param {vec4} out the receiving vector
 * @param {Number} [scale] Length of the resulting vector. If ommitted, a unit vector will be returned
 * @returns {vec4} out
 */
export function random(out, vectorScale) {
  vectorScale = vectorScale || 1.0;

  //TODO: This is a pretty awful way of doing this. Find something better.
  out[0] = RANDOM();
  out[1] = RANDOM();
  out[2] = RANDOM();
  out[3] = RANDOM();
  normalize(out, out);
  scale(out, out, vectorScale);
  return out;
}
