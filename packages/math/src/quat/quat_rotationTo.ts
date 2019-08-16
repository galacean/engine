import { create } from '../vec3/vec3_create';
import { fromValues } from '../vec3/vec3_fromValues';
import { dot } from '../vec3/vec3_dot';
import { len } from '../vec3/vec3_len';
import { cross } from '../vec3/vec3_cross';
import { normalize } from '../vec3/vec3_normalize';
import * as vec4_N from '../vec4/vec4_normalize';
import { setAxisAngle } from './quat_setAxisAngle';

/**
 * Sets a quaternion to represent the shortest rotation from one
 * vector to another.
 *
 * Both vectors are assumed to be unit length.
 *
 * @param {quat} out the receiving quaternion.
 * @param {vec3} a the initial vector
 * @param {vec3} b the destination vector
 * @returns {quat} out
 */
export const rotationTo = (function() {
  let tmpvec3 = create();
  let xUnitVec3 = fromValues(1,0,0);
  let yUnitVec3 = fromValues(0,1,0);

  return function(out, a, b) {
    let dotV = dot(a, b);
    if (dotV < -0.999999) {
      cross(tmpvec3, xUnitVec3, a);
      if (len(tmpvec3) < 0.000001)
        cross(tmpvec3, yUnitVec3, a);
      normalize(tmpvec3, tmpvec3);
      setAxisAngle(out, tmpvec3, Math.PI);
      return out;
    } else if (dotV > 0.999999) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      out[3] = 1;
      return out;
    } else {
      cross(tmpvec3, a, b);
      out[0] = tmpvec3[0];
      out[1] = tmpvec3[1];
      out[2] = tmpvec3[2];
      out[3] = 1 + dotV;
      return vec4_N.normalize(out, out);
    }
  };
})();
export default rotationTo;
