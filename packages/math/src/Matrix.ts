import { IClone } from "./IClone";
import { ICopy } from "./ICopy";
import { MathUtil } from "./MathUtil";
import { Matrix3x3 } from "./Matrix3x3";
import { Quaternion } from "./Quaternion";
import { Vector3 } from "./Vector3";

/**
 * Represents a 4x4 mathematical matrix.
 */
export class Matrix implements IClone<Matrix>, ICopy<Matrix, Matrix> {
  private static readonly _tempVec30: Vector3 = new Vector3();
  private static readonly _tempVec31: Vector3 = new Vector3();
  private static readonly _tempVec32: Vector3 = new Vector3();
  private static readonly _tempMat30: Matrix3x3 = new Matrix3x3();

  /** @internal Identity matrix. */
  static readonly _identity: Matrix = new Matrix(
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0
  );

  /**
   * Determines the product of two matrices.
   * @param left - The first matrix to multiply
   * @param right - The second matrix to multiply
   * @param out - The product of the two matrices
   */
  static multiply(left: Matrix, right: Matrix, out: Matrix): void {
    const le = left.elements;
    const re = right.elements;
    const oe = out.elements;

    // prettier-ignore
    const l11 = le[0], l12 = le[1], l13 = le[2], l14 = le[3],
    l21 = le[4], l22 = le[5], l23 = le[6], l24 = le[7],
    l31 = le[8], l32 = le[9], l33 = le[10], l34 = le[11],
    l41 = le[12], l42 = le[13], l43 = le[14], l44 = le[15];

    // prettier-ignore
    const r11 = re[0], r12 = re[1], r13 = re[2], r14 = re[3],
    r21 = re[4], r22 = re[5], r23 = re[6], r24 = re[7],
    r31 = re[8], r32 = re[9], r33 = re[10], r34 = re[11],
    r41 = re[12], r42 = re[13], r43 = re[14], r44 = re[15];

    oe[0] = l11 * r11 + l21 * r12 + l31 * r13 + l41 * r14;
    oe[1] = l12 * r11 + l22 * r12 + l32 * r13 + l42 * r14;
    oe[2] = l13 * r11 + l23 * r12 + l33 * r13 + l43 * r14;
    oe[3] = l14 * r11 + l24 * r12 + l34 * r13 + l44 * r14;

    oe[4] = l11 * r21 + l21 * r22 + l31 * r23 + l41 * r24;
    oe[5] = l12 * r21 + l22 * r22 + l32 * r23 + l42 * r24;
    oe[6] = l13 * r21 + l23 * r22 + l33 * r23 + l43 * r24;
    oe[7] = l14 * r21 + l24 * r22 + l34 * r23 + l44 * r24;

    oe[8] = l11 * r31 + l21 * r32 + l31 * r33 + l41 * r34;
    oe[9] = l12 * r31 + l22 * r32 + l32 * r33 + l42 * r34;
    oe[10] = l13 * r31 + l23 * r32 + l33 * r33 + l43 * r34;
    oe[11] = l14 * r31 + l24 * r32 + l34 * r33 + l44 * r34;

    oe[12] = l11 * r41 + l21 * r42 + l31 * r43 + l41 * r44;
    oe[13] = l12 * r41 + l22 * r42 + l32 * r43 + l42 * r44;
    oe[14] = l13 * r41 + l23 * r42 + l33 * r43 + l43 * r44;
    oe[15] = l14 * r41 + l24 * r42 + l34 * r43 + l44 * r44;
  }

  /**
   * Determines whether the specified matrices are equals.
   * @param left - The first matrix to compare
   * @param right - The second matrix to compare
   * @returns True if the specified matrices are equals, false otherwise
   */
  static equals(left: Matrix, right: Matrix): boolean {
    const le = left.elements;
    const re = right.elements;

    return (
      MathUtil.equals(le[0], re[0]) &&
      MathUtil.equals(le[1], re[1]) &&
      MathUtil.equals(le[2], re[2]) &&
      MathUtil.equals(le[3], re[3]) &&
      MathUtil.equals(le[4], re[4]) &&
      MathUtil.equals(le[5], re[5]) &&
      MathUtil.equals(le[6], re[6]) &&
      MathUtil.equals(le[7], re[7]) &&
      MathUtil.equals(le[8], re[8]) &&
      MathUtil.equals(le[9], re[9]) &&
      MathUtil.equals(le[10], re[10]) &&
      MathUtil.equals(le[11], re[11]) &&
      MathUtil.equals(le[12], re[12]) &&
      MathUtil.equals(le[13], re[13]) &&
      MathUtil.equals(le[14], re[14]) &&
      MathUtil.equals(le[15], re[15])
    );
  }

  /**
   * Performs a linear interpolation between two matrices.
   * @param start - The first matrix
   * @param end - The second matrix
   * @param t - The blend amount where 0 returns start and 1 end
   * @param out - The result of linear blending between two matrices
   */
  static lerp(start: Matrix, end: Matrix, t: number, out: Matrix): void {
    const se = start.elements;
    const ee = end.elements;
    const oe = out.elements;
    const inv = 1.0 - t;

    oe[0] = se[0] * inv + ee[0] * t;
    oe[1] = se[1] * inv + ee[1] * t;
    oe[2] = se[2] * inv + ee[2] * t;
    oe[3] = se[3] * inv + ee[3] * t;

    oe[4] = se[4] * inv + ee[4] * t;
    oe[5] = se[5] * inv + ee[5] * t;
    oe[6] = se[6] * inv + ee[6] * t;
    oe[7] = se[7] * inv + ee[7] * t;

    oe[8] = se[8] * inv + ee[8] * t;
    oe[9] = se[9] * inv + ee[9] * t;
    oe[10] = se[10] * inv + ee[10] * t;
    oe[11] = se[11] * inv + ee[11] * t;

    oe[12] = se[12] * inv + ee[12] * t;
    oe[13] = se[13] * inv + ee[13] * t;
    oe[14] = se[14] * inv + ee[14] * t;
    oe[15] = se[15] * inv + ee[15] * t;
  }

  /**
   * Determines the sum of two matrices.
   * @param left - The first matrix to add
   * @param right - The second matrix to add
   * @param out - The sum of two matrices
   */
  static add(left: Matrix, right: Matrix, out: Matrix): void {
    const le = left.elements;
    const re = right.elements;
    const oe = out.elements;
    oe[0] = le[0] + re[0];
    oe[1] = le[1] + re[1];
    oe[2] = le[2] + re[2];
    oe[3] = le[3] + re[3];
    oe[4] = le[4] + re[4];
    oe[5] = le[5] + re[5];
    oe[6] = le[6] + re[6];
    oe[7] = le[7] + re[7];
    oe[8] = le[8] + re[8];
    oe[9] = le[9] + re[9];
    oe[10] = le[10] + re[10];
    oe[11] = le[11] + re[11];
    oe[12] = le[12] + re[12];
    oe[13] = le[13] + re[13];
    oe[14] = le[14] + re[14];
    oe[15] = le[15] + re[15];
  }

  /**
   * Multiplies a matrix by a scalar.
   * @param source - The matrix to multiply
   * @param scalar - The scalar to multiply
   * @param out - The result of multiplying a matrix by a scalar
   */
  static multiplyScalar(source: Matrix, scalar: number, out: Matrix): void {
    const se = source.elements;
    const oe = out.elements;

    oe[0] = se[0] * scalar;
    oe[1] = se[1] * scalar;
    oe[2] = se[2] * scalar;
    oe[3] = se[3] * scalar;
    oe[4] = se[4] * scalar;
    oe[5] = se[5] * scalar;
    oe[6] = se[6] * scalar;
    oe[7] = se[7] * scalar;
    oe[8] = se[8] * scalar;
    oe[9] = se[9] * scalar;
    oe[10] = se[10] * scalar;
    oe[11] = se[11] * scalar;
    oe[12] = se[12] * scalar;
    oe[13] = se[13] * scalar;
    oe[14] = se[14] * scalar;
    oe[15] = se[15] * scalar;
  }

  /**
   * Calculate a rotation matrix from a quaternion.
   * @param quaternion - The quaternion used to calculate the matrix
   * @param out - The calculated rotation matrix
   */
  static rotationQuaternion(quaternion: Quaternion, out: Matrix): void {
    const oe = out.elements;
    const { _x: x, _y: y, _z: z, _w: w } = quaternion;
    let x2 = x + x;
    let y2 = y + y;
    let z2 = z + z;

    let xx = x * x2;
    let yx = y * x2;
    let yy = y * y2;
    let zx = z * x2;
    let zy = z * y2;
    let zz = z * z2;
    let wx = w * x2;
    let wy = w * y2;
    let wz = w * z2;

    oe[0] = 1 - yy - zz;
    oe[1] = yx + wz;
    oe[2] = zx - wy;
    oe[3] = 0;

    oe[4] = yx - wz;
    oe[5] = 1 - xx - zz;
    oe[6] = zy + wx;
    oe[7] = 0;

    oe[8] = zx + wy;
    oe[9] = zy - wx;
    oe[10] = 1 - xx - yy;
    oe[11] = 0;

    oe[12] = 0;
    oe[13] = 0;
    oe[14] = 0;
    oe[15] = 1;
  }

  /**
   * Calculate a matrix rotates around an arbitrary axis.
   * @param axis - The axis
   * @param r - The rotation angle in radians
   * @param out - The matrix after rotate
   */
  static rotationAxisAngle(axis: Vector3, r: number, out: Matrix): void {
    const oe = out.elements;
    let { _x: x, _y: y, _z: z } = axis;
    let len = Math.sqrt(x * x + y * y + z * z);
    let s, c, t;

    if (Math.abs(len) < MathUtil.zeroTolerance) {
      return;
    }

    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;

    s = Math.sin(r);
    c = Math.cos(r);
    t = 1 - c;

    // Perform rotation-specific matrix multiplication
    oe[0] = x * x * t + c;
    oe[1] = y * x * t + z * s;
    oe[2] = z * x * t - y * s;
    oe[3] = 0;

    oe[4] = x * y * t - z * s;
    oe[5] = y * y * t + c;
    oe[6] = z * y * t + x * s;
    oe[7] = 0;

    oe[8] = x * z * t + y * s;
    oe[9] = y * z * t - x * s;
    oe[10] = z * z * t + c;
    oe[11] = 0;

    oe[12] = 0;
    oe[13] = 0;
    oe[14] = 0;
    oe[15] = 1;
  }

  /**
   * Calculate a matrix from a quaternion and a translation.
   * @param quaternion - The quaternion used to calculate the matrix
   * @param translation - The translation used to calculate the matrix
   * @param out - The calculated matrix
   */
  static rotationTranslation(quaternion: Quaternion, translation: Vector3, out: Matrix): void {
    Matrix.rotationQuaternion(quaternion, out);

    const oe = out.elements;
    oe[12] = translation._x;
    oe[13] = translation._y;
    oe[14] = translation._z;
  }

  /**
   * Calculate an affine matrix.
   * @param scale - The scale used to calculate matrix
   * @param rotation - The rotation used to calculate matrix
   * @param translation - The translation used to calculate matrix
   * @param out - The calculated matrix
   */
  static affineTransformation(scale: Vector3, rotation: Quaternion, translation: Vector3, out: Matrix): void {
    const oe = out.elements;
    const { _x: x, _y: y, _z: z, _w: w } = rotation;
    let x2 = x + x;
    let y2 = y + y;
    let z2 = z + z;

    let xx = x * x2;
    let xy = x * y2;
    let xz = x * z2;
    let yy = y * y2;
    let yz = y * z2;
    let zz = z * z2;
    let wx = w * x2;
    let wy = w * y2;
    let wz = w * z2;
    let sx = scale._x;
    let sy = scale._y;
    let sz = scale._z;

    oe[0] = (1 - (yy + zz)) * sx;
    oe[1] = (xy + wz) * sx;
    oe[2] = (xz - wy) * sx;
    oe[3] = 0;

    oe[4] = (xy - wz) * sy;
    oe[5] = (1 - (xx + zz)) * sy;
    oe[6] = (yz + wx) * sy;
    oe[7] = 0;

    oe[8] = (xz + wy) * sz;
    oe[9] = (yz - wx) * sz;
    oe[10] = (1 - (xx + yy)) * sz;
    oe[11] = 0;

    oe[12] = translation._x;
    oe[13] = translation._y;
    oe[14] = translation._z;
    oe[15] = 1;
  }

  /**
   * Calculate a matrix from scale vector.
   * @param s - The scale vector
   * @param out - The calculated matrix
   */
  static scaling(s: Vector3, out: Matrix): void {
    const oe = out.elements;
    oe[0] = s._x;
    oe[1] = 0;
    oe[2] = 0;
    oe[3] = 0;

    oe[4] = 0;
    oe[5] = s._y;
    oe[6] = 0;
    oe[7] = 0;

    oe[8] = 0;
    oe[9] = 0;
    oe[10] = s._z;
    oe[11] = 0;

    oe[12] = 0;
    oe[13] = 0;
    oe[14] = 0;
    oe[15] = 1;
  }

  /**
   * Calculate a matrix from translation vector.
   * @param translation - The translation vector
   * @param out - The calculated matrix
   */
  static translation(translation: Vector3, out: Matrix): void {
    const oe = out.elements;
    oe[0] = 1;
    oe[1] = 0;
    oe[2] = 0;
    oe[3] = 0;

    oe[4] = 0;
    oe[5] = 1;
    oe[6] = 0;
    oe[7] = 0;

    oe[8] = 0;
    oe[9] = 0;
    oe[10] = 1;
    oe[11] = 0;

    oe[12] = translation._x;
    oe[13] = translation._y;
    oe[14] = translation._z;
    oe[15] = 1;
  }

  /**
   * Calculate the inverse of the specified matrix.
   * @param a - The matrix whose inverse is to be calculated
   * @param out - The inverse of the specified matrix
   */
  static invert(a: Matrix, out: Matrix): void {
    const ae = a.elements;
    const oe = out.elements;

    const a11 = ae[0],
      a12 = ae[1],
      a13 = ae[2],
      a14 = ae[3];
    const a21 = ae[4],
      a22 = ae[5],
      a23 = ae[6],
      a24 = ae[7];
    const a31 = ae[8],
      a32 = ae[9],
      a33 = ae[10],
      a34 = ae[11];
    const a41 = ae[12],
      a42 = ae[13],
      a43 = ae[14],
      a44 = ae[15];

    const b00 = a11 * a22 - a12 * a21;
    const b01 = a11 * a23 - a13 * a21;
    const b02 = a11 * a24 - a14 * a21;
    const b03 = a12 * a23 - a13 * a22;
    const b04 = a12 * a24 - a14 * a22;
    const b05 = a13 * a24 - a14 * a23;
    const b06 = a31 * a42 - a32 * a41;
    const b07 = a31 * a43 - a33 * a41;
    const b08 = a31 * a44 - a34 * a41;
    const b09 = a32 * a43 - a33 * a42;
    const b10 = a32 * a44 - a34 * a42;
    const b11 = a33 * a44 - a34 * a43;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) {
      return null;
    }
    det = 1.0 / det;

    oe[0] = (a22 * b11 - a23 * b10 + a24 * b09) * det;
    oe[1] = (a13 * b10 - a12 * b11 - a14 * b09) * det;
    oe[2] = (a42 * b05 - a43 * b04 + a44 * b03) * det;
    oe[3] = (a33 * b04 - a32 * b05 - a34 * b03) * det;

    oe[4] = (a23 * b08 - a21 * b11 - a24 * b07) * det;
    oe[5] = (a11 * b11 - a13 * b08 + a14 * b07) * det;
    oe[6] = (a43 * b02 - a41 * b05 - a44 * b01) * det;
    oe[7] = (a31 * b05 - a33 * b02 + a34 * b01) * det;

    oe[8] = (a21 * b10 - a22 * b08 + a24 * b06) * det;
    oe[9] = (a12 * b08 - a11 * b10 - a14 * b06) * det;
    oe[10] = (a41 * b04 - a42 * b02 + a44 * b00) * det;
    oe[11] = (a32 * b02 - a31 * b04 - a34 * b00) * det;

    oe[12] = (a22 * b07 - a21 * b09 - a23 * b06) * det;
    oe[13] = (a11 * b09 - a12 * b07 + a13 * b06) * det;
    oe[14] = (a42 * b01 - a41 * b03 - a43 * b00) * det;
    oe[15] = (a31 * b03 - a32 * b01 + a33 * b00) * det;
  }

  /**
   * Calculate a right-handed look-at matrix.
   * @param eye - The position of the viewer's eye
   * @param target - The camera look-at target
   * @param up - The camera's up vector
   * @param out - The calculated look-at matrix
   */
  static lookAt(eye: Vector3, target: Vector3, up: Vector3, out: Matrix): void {
    const oe = out.elements;
    const xAxis: Vector3 = Matrix._tempVec30;
    const yAxis: Vector3 = Matrix._tempVec31;
    const zAxis: Vector3 = Matrix._tempVec32;

    Vector3.subtract(eye, target, zAxis);
    zAxis.normalize();
    Vector3.cross(up, zAxis, xAxis);
    xAxis.normalize();
    Vector3.cross(zAxis, xAxis, yAxis);

    oe[0] = xAxis._x;
    oe[1] = yAxis._x;
    oe[2] = zAxis._x;
    oe[3] = 0;

    oe[4] = xAxis._y;
    oe[5] = yAxis._y;
    oe[6] = zAxis._y;
    oe[7] = 0;

    oe[8] = xAxis._z;
    oe[9] = yAxis._z;
    oe[10] = zAxis._z;
    oe[11] = 0;

    oe[12] = -Vector3.dot(xAxis, eye);
    oe[13] = -Vector3.dot(yAxis, eye);
    oe[14] = -Vector3.dot(zAxis, eye);
    oe[15] = 1;
  }

  /**
   * Calculate an orthographic projection matrix.
   * @param left - The left edge of the viewing
   * @param right - The right edge of the viewing
   * @param bottom - The bottom edge of the viewing
   * @param top - The top edge of the viewing
   * @param near - The depth of the near plane
   * @param far - The depth of the far plane
   * @param out - The calculated orthographic projection matrix
   */
  static ortho(left: number, right: number, bottom: number, top: number, near: number, far: number, out: Matrix): void {
    const oe = out.elements;
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);

    oe[0] = -2 * lr;
    oe[1] = 0;
    oe[2] = 0;
    oe[3] = 0;

    oe[4] = 0;
    oe[5] = -2 * bt;
    oe[6] = 0;
    oe[7] = 0;

    oe[8] = 0;
    oe[9] = 0;
    oe[10] = 2 * nf;
    oe[11] = 0;

    oe[12] = (left + right) * lr;
    oe[13] = (top + bottom) * bt;
    oe[14] = (far + near) * nf;
    oe[15] = 1;
  }

  /**
   * Calculate a perspective projection matrix.
   * @param fovY - Field of view in the y direction, in radians
   * @param aspect - Aspect ratio, defined as view space width divided by height
   * @param near - The depth of the near plane
   * @param far - The depth of the far plane
   * @param out - The calculated perspective projection matrix
   */
  static perspective(fovY: number, aspect: number, near: number, far: number, out: Matrix): void {
    const oe = out.elements;
    const f = 1.0 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);

    oe[0] = f / aspect;
    oe[1] = 0;
    oe[2] = 0;
    oe[3] = 0;

    oe[4] = 0;
    oe[5] = f;
    oe[6] = 0;
    oe[7] = 0;

    oe[8] = 0;
    oe[9] = 0;
    oe[10] = (far + near) * nf;
    oe[11] = -1;

    oe[12] = 0;
    oe[13] = 0;
    oe[14] = 2 * far * near * nf;
    oe[15] = 0;
  }

  /**
   * The specified matrix rotates around an arbitrary axis.
   * @param m - The specified matrix
   * @param axis - The axis
   * @param r - The rotation angle in radians
   * @param out - The rotated matrix
   */
  static rotateAxisAngle(m: Matrix, axis: Vector3, r: number, out: Matrix): void {
    let { _x: x, _y: y, _z: z } = axis;
    let len = Math.sqrt(x * x + y * y + z * z);

    if (Math.abs(len) < MathUtil.zeroTolerance) {
      return;
    }

    const me = m.elements;
    const oe = out.elements;
    let s, c, t;

    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;

    s = Math.sin(r);
    c = Math.cos(r);
    t = 1 - c;

    let a11 = me[0],
      a12 = me[1],
      a13 = me[2],
      a14 = me[3];
    let a21 = me[4],
      a22 = me[5],
      a23 = me[6],
      a24 = me[7];
    let a31 = me[8],
      a32 = me[9],
      a33 = me[10],
      a34 = me[11];

    // Construct the elements of the rotation matrix
    let b11 = x * x * t + c;
    let b12 = y * x * t + z * s;
    let b13 = z * x * t - y * s;
    let b21 = x * y * t - z * s;
    let b22 = y * y * t + c;
    let b23 = z * y * t + x * s;
    let b31 = x * z * t + y * s;
    let b32 = y * z * t - x * s;
    let b33 = z * z * t + c;

    // Perform rotation-specific matrix multiplication
    oe[0] = a11 * b11 + a21 * b12 + a31 * b13;
    oe[1] = a12 * b11 + a22 * b12 + a32 * b13;
    oe[2] = a13 * b11 + a23 * b12 + a33 * b13;
    oe[3] = a14 * b11 + a24 * b12 + a34 * b13;

    oe[4] = a11 * b21 + a21 * b22 + a31 * b23;
    oe[5] = a12 * b21 + a22 * b22 + a32 * b23;
    oe[6] = a13 * b21 + a23 * b22 + a33 * b23;
    oe[7] = a14 * b21 + a24 * b22 + a34 * b23;

    oe[8] = a11 * b31 + a21 * b32 + a31 * b33;
    oe[9] = a12 * b31 + a22 * b32 + a32 * b33;
    oe[10] = a13 * b31 + a23 * b32 + a33 * b33;
    oe[11] = a14 * b31 + a24 * b32 + a34 * b33;

    if (m !== out) {
      // If the source and destination differ, copy the unchanged last row
      oe[12] = me[12];
      oe[13] = me[13];
      oe[14] = me[14];
      oe[15] = me[15];
    }
  }

  /**
   * Scale a matrix by a given vector.
   * @param m - The matrix
   * @param s - The given vector
   * @param out - The scaled matrix
   */
  static scale(m: Matrix, s: Vector3, out: Matrix): void {
    const me = m.elements;
    const oe = out.elements;
    const { _x: x, _y: y, _z: z } = s;

    oe[0] = me[0] * x;
    oe[1] = me[1] * x;
    oe[2] = me[2] * x;
    oe[3] = me[3] * x;

    oe[4] = me[4] * y;
    oe[5] = me[5] * y;
    oe[6] = me[6] * y;
    oe[7] = me[7] * y;

    oe[8] = me[8] * z;
    oe[9] = me[9] * z;
    oe[10] = me[10] * z;
    oe[11] = me[11] * z;

    oe[12] = me[12];
    oe[13] = me[13];
    oe[14] = me[14];
    oe[15] = me[15];
  }

  /**
   * Translate a matrix by a given vector.
   * @param m - The matrix
   * @param v - The given vector
   * @param out - The translated matrix
   */
  static translate(m: Matrix, v: Vector3, out: Matrix): void {
    const me = m.elements;
    const oe = out.elements;
    const { _x: x, _y: y, _z: z } = v;

    if (m === out) {
      oe[12] = me[0] * x + me[4] * y + me[8] * z + me[12];
      oe[13] = me[1] * x + me[5] * y + me[9] * z + me[13];
      oe[14] = me[2] * x + me[6] * y + me[10] * z + me[14];
      oe[15] = me[3] * x + me[7] * y + me[11] * z + me[15];
    } else {
      const a11 = me[0],
        a12 = me[1],
        a13 = me[2],
        a14 = me[3];
      const a21 = me[4],
        a22 = me[5],
        a23 = me[6],
        a24 = me[7];
      const a31 = me[8],
        a32 = me[9],
        a33 = me[10],
        a34 = me[11];

      (oe[0] = a11), (oe[1] = a12), (oe[2] = a13), (oe[3] = a14);
      (oe[4] = a21), (oe[5] = a22), (oe[6] = a23), (oe[7] = a24);
      (oe[8] = a31), (oe[9] = a32), (oe[10] = a33), (oe[11] = a34);

      oe[12] = a11 * x + a21 * y + a31 * z + me[12];
      oe[13] = a12 * x + a22 * y + a32 * z + me[13];
      oe[14] = a13 * x + a23 * y + a33 * z + me[14];
      oe[15] = a14 * x + a24 * y + a34 * z + me[15];
    }
  }

  /**
   * Calculate the transpose of the specified matrix.
   * @param a - The specified matrix
   * @param out - The transpose of the specified matrix
   */
  static transpose(a: Matrix, out: Matrix): void {
    const ae = a.elements;
    const oe = out.elements;

    if (out === a) {
      const a12 = ae[1];
      const a13 = ae[2];
      const a14 = ae[3];
      const a23 = ae[6];
      const a24 = ae[7];
      const a34 = ae[11];

      oe[1] = ae[4];
      oe[2] = ae[8];
      oe[3] = ae[12];

      oe[4] = a12;
      oe[6] = ae[9];
      oe[7] = ae[13];

      oe[8] = a13;
      oe[9] = a23;
      oe[11] = ae[14];

      oe[12] = a14;
      oe[13] = a24;
      oe[14] = a34;
    } else {
      oe[0] = ae[0];
      oe[1] = ae[4];
      oe[2] = ae[8];
      oe[3] = ae[12];

      oe[4] = ae[1];
      oe[5] = ae[5];
      oe[6] = ae[9];
      oe[7] = ae[13];

      oe[8] = ae[2];
      oe[9] = ae[6];
      oe[10] = ae[10];
      oe[11] = ae[14];

      oe[12] = ae[3];
      oe[13] = ae[7];
      oe[14] = ae[11];
      oe[15] = ae[15];
    }
  }

  /**
   * An array containing the elements of the matrix (column matrix).
   * @remarks
   * elements[0] first column and first row value m11
   * elements[1] first column and second row value m12
   * elements[2] first column and third row value m13
   * elements[3] first column and fourth row value m14
   * elements[4] second column and first row value m21
   * and so on
   */
  elements: Float32Array = new Float32Array(16);

  /**
   * Constructor of 4x4 Matrix.
   * @param m11 - default 1, column 1, row 1
   * @param m12 - default 0, column 1, row 2
   * @param m13 - default 0, column 1, row 3
   * @param m14 - default 0, column 1, row 4
   * @param m21 - default 0, column 2, row 1
   * @param m22 - default 1, column 2, row 2
   * @param m23 - default 0, column 2, row 3
   * @param m24 - default 0, column 2, row 4
   * @param m31 - default 0, column 3, row 1
   * @param m32 - default 0, column 3, row 2
   * @param m33 - default 1, column 3, row 3
   * @param m34 - default 0, column 3, row 4
   * @param m41 - default 0, column 4, row 1
   * @param m42 - default 0, column 4, row 2
   * @param m43 - default 0, column 4, row 3
   * @param m44 - default 1, column 4, row 4
   */
  constructor(
    m11: number = 1,
    m12: number = 0,
    m13: number = 0,
    m14: number = 0,
    m21: number = 0,
    m22: number = 1,
    m23: number = 0,
    m24: number = 0,
    m31: number = 0,
    m32: number = 0,
    m33: number = 1,
    m34: number = 0,
    m41: number = 0,
    m42: number = 0,
    m43: number = 0,
    m44: number = 1
  ) {
    const e: Float32Array = this.elements;

    e[0] = m11;
    e[1] = m12;
    e[2] = m13;
    e[3] = m14;

    e[4] = m21;
    e[5] = m22;
    e[6] = m23;
    e[7] = m24;

    e[8] = m31;
    e[9] = m32;
    e[10] = m33;
    e[11] = m34;

    e[12] = m41;
    e[13] = m42;
    e[14] = m43;
    e[15] = m44;
  }

  /**
   * Set the value of this matrix, and return this matrix.
   * @param m11 - column 1, row 1
   * @param m12 - column 1, row 2
   * @param m13 - column 1, row 3
   * @param m14 - column 1, row 4
   * @param m21 - column 2, row 1
   * @param m22 - column 2, row 2
   * @param m23 - column 2, row 3
   * @param m24 - column 2, row 4
   * @param m31 - column 3, row 1
   * @param m32 - column 3, row 2
   * @param m33 - column 3, row 3
   * @param m34 - column 3, row 4
   * @param m41 - column 4, row 1
   * @param m42 - column 4, row 2
   * @param m43 - column 4, row 3
   * @param m44 - column 4, row 4
   * @returns This matrix
   */
  set(
    m11: number,
    m12: number,
    m13: number,
    m14: number,
    m21: number,
    m22: number,
    m23: number,
    m24: number,
    m31: number,
    m32: number,
    m33: number,
    m34: number,
    m41: number,
    m42: number,
    m43: number,
    m44: number
  ): Matrix {
    const e = this.elements;

    e[0] = m11;
    e[1] = m12;
    e[2] = m13;
    e[3] = m14;

    e[4] = m21;
    e[5] = m22;
    e[6] = m23;
    e[7] = m24;

    e[8] = m31;
    e[9] = m32;
    e[10] = m33;
    e[11] = m34;

    e[12] = m41;
    e[13] = m42;
    e[14] = m43;
    e[15] = m44;

    return this;
  }

  /**
   * Determines the product of this matrix and the specified matrix.
   * @param right - The specified matrix
   * @returns This matrix that store the product of the two matrices
   */
  multiply(right: Matrix): Matrix {
    Matrix.multiply(this, right, this);
    return this;
  }

  /**
   * Calculate a determinant of this matrix.
   * @returns The determinant of this matrix
   */
  determinant(): number {
    const e = this.elements;

    const a11 = e[0],
      a12 = e[1],
      a13 = e[2],
      a14 = e[3];
    const a21 = e[4],
      a22 = e[5],
      a23 = e[6],
      a24 = e[7];
    const a31 = e[8],
      a32 = e[9],
      a33 = e[10],
      a34 = e[11];
    const a41 = e[12],
      a42 = e[13],
      a43 = e[14],
      a44 = e[15];

    const b00 = a11 * a22 - a12 * a21;
    const b01 = a11 * a23 - a13 * a21;
    const b02 = a11 * a24 - a14 * a21;
    const b03 = a12 * a23 - a13 * a22;
    const b04 = a12 * a24 - a14 * a22;
    const b05 = a13 * a24 - a14 * a23;
    const b06 = a31 * a42 - a32 * a41;
    const b07 = a31 * a43 - a33 * a41;
    const b08 = a31 * a44 - a34 * a41;
    const b09 = a32 * a43 - a33 * a42;
    const b10 = a32 * a44 - a34 * a42;
    const b11 = a33 * a44 - a34 * a43;

    // Calculate the determinant
    return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  }

  /**
   * Decompose this matrix to translation, rotation and scale elements.
   * @param translation - Translation vector as an output parameter
   * @param rotation - Rotation quaternion as an output parameter
   * @param scale - Scale vector as an output parameter
   * @returns True if this matrix can be decomposed, false otherwise
   */
  decompose(translation: Vector3, rotation: Quaternion, scale: Vector3): boolean {
    const rm: Matrix3x3 = Matrix._tempMat30;

    const e = this.elements;
    const rme = rm.elements;

    const m11 = e[0];
    const m12 = e[1];
    const m13 = e[2];
    const m21 = e[4];
    const m22 = e[5];
    const m23 = e[6];
    const m31 = e[8];
    const m32 = e[9];
    const m33 = e[10];
    translation.set(e[12], e[13], e[14]);

    let sx = Math.sqrt(m11 * m11 + m12 * m12 + m13 * m13);
    const sy = Math.sqrt(m21 * m21 + m22 * m22 + m23 * m23);
    const sz = Math.sqrt(m31 * m31 + m32 * m32 + m33 * m33);
    if (this.determinant() < 0) sx = -sx;
    scale.set(sx, sy, sz);

    if (
      Math.abs(sx) < MathUtil.zeroTolerance ||
      Math.abs(sy) < MathUtil.zeroTolerance ||
      Math.abs(sz) < MathUtil.zeroTolerance
    ) {
      rotation.identity();
      return false;
    } else {
      const invSX = 1 / sx;
      const invSY = 1 / sy;
      const invSZ = 1 / sz;

      rme[0] = m11 * invSX;
      rme[1] = m12 * invSX;
      rme[2] = m13 * invSX;
      rme[3] = m21 * invSY;
      rme[4] = m22 * invSY;
      rme[5] = m23 * invSY;
      rme[6] = m31 * invSZ;
      rme[7] = m32 * invSZ;
      rme[8] = m33 * invSZ;
      Quaternion.rotationMatrix3x3(rm, rotation);
      return true;
    }
  }

  /**
   * Get rotation from this matrix.
   * @param out - Rotation quaternion as an output parameter
   * @returns The out
   */
  getRotation(out: Quaternion): Quaternion {
    const e = this.elements;
    let trace = e[0] + e[5] + e[10];

    if (trace > MathUtil.zeroTolerance) {
      let s = Math.sqrt(trace + 1.0) * 2;
      out._w = 0.25 * s;
      out._x = (e[6] - e[9]) / s;
      out._y = (e[8] - e[2]) / s;
      out._z = (e[1] - e[4]) / s;
    } else if (e[0] > e[5] && e[0] > e[10]) {
      let s = Math.sqrt(1.0 + e[0] - e[5] - e[10]) * 2;
      out._w = (e[6] - e[9]) / s;
      out._x = 0.25 * s;
      out._y = (e[1] + e[4]) / s;
      out._z = (e[8] + e[2]) / s;
    } else if (e[5] > e[10]) {
      let s = Math.sqrt(1.0 + e[5] - e[0] - e[10]) * 2;
      out._w = (e[8] - e[2]) / s;
      out._x = (e[1] + e[4]) / s;
      out._y = 0.25 * s;
      out._z = (e[6] + e[9]) / s;
    } else {
      let s = Math.sqrt(1.0 + e[10] - e[0] - e[5]) * 2;
      out._w = (e[1] - e[4]) / s;
      out._x = (e[8] + e[2]) / s;
      out._y = (e[6] + e[9]) / s;
      out._z = 0.25 * s;
    }

    out._onValueChanged?.();
    return out;
  }

  /**
   * Get scale from this matrix.
   * @param out - Scale vector as an output parameter
   * @returns The out
   */
  getScaling(out: Vector3): Vector3 {
    //getScale()
    const e = this.elements;
    const m11 = e[0],
      m12 = e[1],
      m13 = e[2];
    const m21 = e[4],
      m22 = e[5],
      m23 = e[6];
    const m31 = e[8],
      m32 = e[9],
      m33 = e[10];

    out.set(
      Math.sqrt(m11 * m11 + m12 * m12 + m13 * m13),
      Math.sqrt(m21 * m21 + m22 * m22 + m23 * m23),
      Math.sqrt(m31 * m31 + m32 * m32 + m33 * m33)
    );

    return out;
  }

  /**
   * Get translation from this matrix.
   * @param out - Translation vector as an output parameter
   * @returns The out
   */
  getTranslation(out: Vector3): Vector3 {
    const e = this.elements;
    out.set(e[12], e[13], e[14]);
    return out;
  }

  /**
   * Identity this matrix.
   * @returns This matrix after identity
   */
  identity(): Matrix {
    const e = this.elements;

    e[0] = 1;
    e[1] = 0;
    e[2] = 0;
    e[3] = 0;

    e[4] = 0;
    e[5] = 1;
    e[6] = 0;
    e[7] = 0;

    e[8] = 0;
    e[9] = 0;
    e[10] = 1;
    e[11] = 0;

    e[12] = 0;
    e[13] = 0;
    e[14] = 0;
    e[15] = 1;

    return this;
  }

  /**
   * Invert the matrix.
   * @returns The matrix after invert
   */
  invert(): Matrix {
    Matrix.invert(this, this);
    return this;
  }

  /**
   * This matrix rotates around an arbitrary axis.
   * @param axis - The axis
   * @param r - The rotation angle in radians
   * @returns This matrix after rotate
   */
  rotateAxisAngle(axis: Vector3, r: number): Matrix {
    Matrix.rotateAxisAngle(this, axis, r, this);
    return this;
  }

  /**
   * Scale this matrix by a given vector.
   * @param s - The given vector
   * @returns This matrix after scale
   */
  scale(s: Vector3): Matrix {
    Matrix.scale(this, s, this);
    return this;
  }

  /**
   * Translate this matrix by a given vector.
   * @param v - The given vector
   * @returns This matrix after translate
   */
  translate(v: Vector3): Matrix {
    Matrix.translate(this, v, this);
    return this;
  }

  /**
   * Calculate the transpose of this matrix.
   * @returns This matrix after transpose
   */
  transpose(): Matrix {
    Matrix.transpose(this, this);
    return this;
  }

  /**
   * Creates a clone of this matrix.
   * @returns A clone of this matrix
   */
  clone(): Matrix {
    const e = this.elements;
    let ret = new Matrix(
      e[0],
      e[1],
      e[2],
      e[3],
      e[4],
      e[5],
      e[6],
      e[7],
      e[8],
      e[9],
      e[10],
      e[11],
      e[12],
      e[13],
      e[14],
      e[15]
    );
    return ret;
  }

  /**
   * Copy this matrix from the specified matrix.
   * @param source - The specified matrix
   * @returns This matrix
   */
  copyFrom(source: Matrix): Matrix {
    const e = this.elements;
    const se = source.elements;

    e[0] = se[0];
    e[1] = se[1];
    e[2] = se[2];
    e[3] = se[3];

    e[4] = se[4];
    e[5] = se[5];
    e[6] = se[6];
    e[7] = se[7];

    e[8] = se[8];
    e[9] = se[9];
    e[10] = se[10];
    e[11] = se[11];

    e[12] = se[12];
    e[13] = se[13];
    e[14] = se[14];
    e[15] = se[15];

    return this;
  }

  /**
   * Copy the value of this matrix from an array.
   * @param array - The array
   * @param offset - The start offset of the array
   * @returns This matrix
   */
  copyFromArray(array: ArrayLike<number>, offset: number = 0): Matrix {
    const srce = this.elements;
    for (let i = 0; i < 16; i++) {
      srce[i] = array[i + offset];
    }
    return this;
  }

  /**
   * Copy the value of this matrix to an array.
   * @param out - The array
   * @param outOffset - The start offset of the array
   */
  copyToArray(out: number[] | Float32Array | Float64Array, outOffset: number = 0): void {
    const e = this.elements;

    out[outOffset] = e[0];
    out[outOffset + 1] = e[1];
    out[outOffset + 2] = e[2];
    out[outOffset + 3] = e[3];
    out[outOffset + 4] = e[4];
    out[outOffset + 5] = e[5];
    out[outOffset + 6] = e[6];
    out[outOffset + 7] = e[7];
    out[outOffset + 8] = e[8];
    out[outOffset + 9] = e[9];
    out[outOffset + 10] = e[10];
    out[outOffset + 11] = e[11];
    out[outOffset + 12] = e[12];
    out[outOffset + 13] = e[13];
    out[outOffset + 14] = e[14];
    out[outOffset + 15] = e[15];
  }
}
