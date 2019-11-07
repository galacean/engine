import { vec3, mat4 } from '@alipay/o3-math';

export function transformDirection(out, a, m) {
  const x = a[0];
  const y = a[1];
  const z = a[2];
  out[0] = x * m[0] + y * m[4] + z * m[8];
  out[1] = x * m[1] + y * m[5] + z * m[9];
  out[2] = x * m[2] + y * m[6] + z * m[10];
  const normalized = vec3.create();
  vec3.normalize(normalized, out);
  return out;
}

export function fromBufferAttribute(attribute, index, size = 3) {
  const x = attribute[index * size];
  const y = attribute[index * size + 1];
  const z = attribute[index * size + 2];
  return [x, y, z];
}

export function getXFromIndex(array, index) {
  return array[ index ];
}

export function getNormal(a, b, c) {
  const temp1 = vec3.create();
  const temp2 = vec3.create();
  const temp3 = vec3.create();
  const v0 = vec3.subtract(temp1, c, b);
  const v1 = vec3.subtract(temp2, a, b);

  const target = vec3.cross(temp3, v0, v1);

  const targetLengthSq = 
  target[0] * target[0] + target[1] * target[1] + target[2] * target[2];
  const sqrtLen = Math.sqrt(targetLengthSq);

  if ( targetLengthSq > 0 ) {

    return [
      target[0] / sqrtLen,
      target[1] / sqrtLen,
      target[2] / sqrtLen,
    ];

  }
  return [0, 0, 0];
}

export function distanceTo(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function setPosition(out, vec3) {
  out[12] = vec3[0];
  out[13] = vec3[1];
  out[14] = vec3[2];

  return out;
}

export function makeRotationFromQuaternion(q) {
  const one = [1, 1, 1];
  const zero = [0, 0, 0];
  return compose(zero, q, one);
}

function compose(position, quaternion, scale) {
  const te = mat4.create();

  var x = quaternion[0], y = quaternion[1], z = quaternion[2], w = quaternion[3];
  var x2 = x + x,	y2 = y + y, z2 = z + z;
  var xx = x * x2, xy = x * y2, xz = x * z2;
  var yy = y * y2, yz = y * z2, zz = z * z2;
  var wx = w * x2, wy = w * y2, wz = w * z2;

  var sx = scale[0], sy = scale[1], sz = scale[2];

  te[ 0 ] = ( 1 - ( yy + zz ) ) * sx;
  te[ 1 ] = ( xy + wz ) * sx;
  te[ 2 ] = ( xz - wy ) * sx;
  te[ 3 ] = 0;

  te[ 4 ] = ( xy - wz ) * sy;
  te[ 5 ] = ( 1 - ( xx + zz ) ) * sy;
  te[ 6 ] = ( yz + wx ) * sy;
  te[ 7 ] = 0;

  te[ 8 ] = ( xz + wy ) * sz;
  te[ 9 ] = ( yz - wx ) * sz;
  te[ 10 ] = ( 1 - ( xx + yy ) ) * sz;
  te[ 11 ] = 0;

  te[ 12 ] = position[0];
  te[ 13 ] = position[1];
  te[ 14 ] = position[2];
  te[ 15 ] = 1;

  return te;
}