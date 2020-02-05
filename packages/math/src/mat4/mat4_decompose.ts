import { copy } from "./mat4_copy";
import { determinant } from "./mat4_determinant";
import { fromMat4 } from "../mat3/mat3_fromMat4";
import { create } from "../mat3/mat3_create";
import { fromMat3 } from "../quat/quat_fromMat3";

const m3 = create();
const te = new Float32Array(16);
/**
 * decompose matrix to TRS
 * @param {mat4} m the matrix
 * @param {vec3} position result position
 * @param {quat} quaternion result quat
 * @param {vec3} scale result scale
 */
export function decompose(m, position, quaternion, scale) {
  copy(te, m);

  let sx = Math.sqrt(te[0] * te[0] + te[1] * te[1] + te[2] * te[2]);
  const sy = Math.sqrt(te[4] * te[4] + te[5] * te[5] + te[6] * te[6]);
  const sz = Math.sqrt(te[8] * te[8] + te[9] * te[9] + te[10] * te[10]);

  // if determine is negative, we need to invert one scale
  const det = determinant(te);
  if (det < 0) sx = -sx;

  position[0] = te[12];
  position[1] = te[13];
  position[2] = te[14];

  // scale the rotation part

  const invSX = 1 / sx;
  const invSY = 1 / sy;
  const invSZ = 1 / sz;

  te[0] *= invSX;
  te[1] *= invSX;
  te[2] *= invSX;

  te[4] *= invSY;
  te[5] *= invSY;
  te[6] *= invSY;

  te[8] *= invSZ;
  te[9] *= invSZ;
  te[10] *= invSZ;

  fromMat4(m3, te);
  fromMat3(quaternion, m3);

  scale[0] = sx;
  scale[1] = sy;
  scale[2] = sz;
}
