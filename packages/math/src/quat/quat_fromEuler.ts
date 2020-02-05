/**
 * Creates a quaternion from the given euler angle x, y, z.
 *
 * @param {quat} out the receiving quaternion
 * @param {x} Angle to rotate around X axis in degrees.
 * @param {y} Angle to rotate around Y axis in degrees.
 * @param {z} Angle to rotate around Z axis in degrees.
 * @returns {quat} out
 * @function
 */
export function fromEuler(out, x, y, z) {
  let halfToRad = (0.5 * Math.PI) / 180.0;
  x *= halfToRad;
  y *= halfToRad;
  z *= halfToRad;

  let sx = Math.sin(x);
  let cx = Math.cos(x);
  let sy = Math.sin(y);
  let cy = Math.cos(y);
  let sz = Math.sin(z);
  let cz = Math.cos(z);

  out[0] = sx * cy * cz - cx * sy * sz;
  out[1] = cx * sy * cz + sx * cy * sz;
  out[2] = cx * cy * sz - sx * sy * cz;
  out[3] = cx * cy * cz + sx * sy * sz;

  return out;
}
