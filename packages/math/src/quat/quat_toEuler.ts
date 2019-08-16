import { EPSILON } from '../MathUtil/MathUtil_EPSILON';

/**
 * get euler angle x, y, z from a given quat
 *
 * @param {vec3} out the euler angle
 * @param {quat} q quat to calculate euler angle of
 * @returns {vec3} out
 * @function
 */
export function toEuler(out, q) {


  let Threshold = 0.5 - EPSILON;

  let t = q[3]*q[1] - q[0]*q[2];

  if (t < -Threshold || t > Threshold) // 奇异姿态,俯仰角为±90°
  {
    let sign = Math.sign(t);

    out[2] = -2 * sign * Math.atan2(q[0], q[3]); // yaw
    out[1] = sign * (Math.PI / 2.0); // pitch
    out[0] = 0; // roll

  }
  else
  {
    out[0] = Math.atan2(2 * (q[0]*q[3] + q[1]*q[2]), 1 - 2 * (q[0]*q[0] + q[1]*q[1]));
    out[1] = Math.asin(2 * (q[3]*q[1] - q[2]*q[0]));
    out[2] = Math.atan2(2 * (q[0]*q[1] + q[2]*q[3]), 1 - 2 * (q[1]*q[1] + q[2]*q[2]));
  }

  let radToDegrees = 180.0 / Math.PI;
  out[0] *= radToDegrees;
  out[1] *= radToDegrees;
  out[2] *= radToDegrees;

  return out;
}
