import { IClone } from "./IClone";
import { ICopy } from "./ICopy";
import { MathUtil } from "./MathUtil";
import { Matrix } from "./Matrix";
import { Quaternion } from "./Quaternion";
import { Vector2 } from "./Vector2";

/**
 * Represents a 3x3 mathematical matrix.
 */
export class Matrix3x3 implements IClone<Matrix3x3>, ICopy<Matrix3x3, Matrix3x3> {
  /**
   * Determines the sum of two matrices.
   * @param left - The first matrix to add
   * @param right - The second matrix to add
   * @param out - The sum of two matrices
   */
  static add(left: Matrix3x3, right: Matrix3x3, out: Matrix3x3): void {
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
  }

  /**
   * Determines the difference between two matrices.
   * @param left - The first matrix to subtract
   * @param right - The second matrix to subtract
   * @param out - The difference between two matrices
   */
  static subtract(left: Matrix3x3, right: Matrix3x3, out: Matrix3x3): void {
    const le = left.elements;
    const re = right.elements;
    const oe = out.elements;

    oe[0] = le[0] - re[0];
    oe[1] = le[1] - re[1];
    oe[2] = le[2] - re[2];

    oe[3] = le[3] - re[3];
    oe[4] = le[4] - re[4];
    oe[5] = le[5] - re[5];

    oe[6] = le[6] - re[6];
    oe[7] = le[7] - re[7];
    oe[8] = le[8] - re[8];
  }

  /**
   * Determines the product of two matrices.
   * @param left - The first matrix to multiply
   * @param right - The second matrix to multiply
   * @param out - The product of two matrices
   */
  static multiply(left: Matrix3x3, right: Matrix3x3, out: Matrix3x3): void {
    const le = left.elements;
    const re = right.elements;
    const oe = out.elements;

    const l11 = le[0],
      l12 = le[1],
      l13 = le[2];
    const l21 = le[3],
      l22 = le[4],
      l23 = le[5];
    const l31 = le[6],
      l32 = le[7],
      l33 = le[8];

    const r11 = re[0],
      r12 = re[1],
      r13 = re[2];
    const r21 = re[3],
      r22 = re[4],
      r23 = re[5];
    const r31 = re[6],
      r32 = re[7],
      r33 = re[8];

    oe[0] = l11 * r11 + l21 * r12 + l31 * r13;
    oe[1] = l12 * r11 + l22 * r12 + l32 * r13;
    oe[2] = l13 * r11 + l23 * r12 + l33 * r13;

    oe[3] = l11 * r21 + l21 * r22 + l31 * r23;
    oe[4] = l12 * r21 + l22 * r22 + l32 * r23;
    oe[5] = l13 * r21 + l23 * r22 + l33 * r23;

    oe[6] = l11 * r31 + l21 * r32 + l31 * r33;
    oe[7] = l12 * r31 + l22 * r32 + l32 * r33;
    oe[8] = l13 * r31 + l23 * r32 + l33 * r33;
  }

  /**
   * Determines whether the specified matrices are equals.
   * @param left - The first matrix to compare
   * @param right - The second matrix to compare
   * @returns True if the specified matrices are equals, false otherwise
   */
  static equals(left: Matrix3x3, right: Matrix3x3): boolean {
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
      MathUtil.equals(le[8], re[8])
    );
  }

  /**
   * Performs a linear interpolation between two matrices.
   * @param start - The first matrix
   * @param end - The second matrix
   * @param t - The blend amount where 0 returns start and 1 end
   * @param out - The result of linear blending between two matrices
   */
  static lerp(start: Matrix3x3, end: Matrix3x3, t: number, out: Matrix3x3): void {
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
  }

  /**
   * Calculate a rotation matrix from a quaternion.
   * @param quaternion - The quaternion used to calculate the matrix
   * @param out - The calculated rotation matrix
   */
  static rotationQuaternion(quaternion: Quaternion, out: Matrix3x3): void {
    const oe = out.elements;
    const { _x: x, _y: y, _z: z, _w: w } = quaternion;
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;
    const xx = x * x2;
    const yx = y * x2;
    const yy = y * y2;
    const zx = z * x2;
    const zy = z * y2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;

    oe[0] = 1 - yy - zz;
    oe[3] = yx - wz;
    oe[6] = zx + wy;

    oe[1] = yx + wz;
    oe[4] = 1 - xx - zz;
    oe[7] = zy - wx;

    oe[2] = zx - wy;
    oe[5] = zy + wx;
    oe[8] = 1 - xx - yy;
  }

  /**
   * Calculate a matrix from scale vector.
   * @param s - The scale vector
   * @param out - The calculated matrix
   */
  static scaling(s: Vector2, out: Matrix3x3): void {
    const oe = out.elements;

    oe[0] = s._x;
    oe[1] = 0;
    oe[2] = 0;

    oe[3] = 0;
    oe[4] = s._y;
    oe[5] = 0;

    oe[6] = 0;
    oe[7] = 0;
    oe[8] = 1;
  }

  /**
   * Calculate a matrix from translation vector.
   * @param translation - The translation vector
   * @param out - The calculated matrix
   */
  static translation(translation: Vector2, out: Matrix3x3): void {
    const oe = out.elements;

    oe[0] = 1;
    oe[1] = 0;
    oe[2] = 0;

    oe[3] = 0;
    oe[4] = 1;
    oe[5] = 0;

    oe[6] = translation._x;
    oe[7] = translation._y;
    oe[8] = 1;
  }

  /**
   * Calculate the inverse of the specified matrix.
   * @param a - The matrix whose inverse is to be calculated
   * @param out - The inverse of the specified matrix
   */
  static invert(a: Matrix3x3, out: Matrix3x3): void {
    const ae = a.elements;
    const oe = out.elements;

    const a11 = ae[0],
      a12 = ae[1],
      a13 = ae[2];
    const a21 = ae[3],
      a22 = ae[4],
      a23 = ae[5];
    const a31 = ae[6],
      a32 = ae[7],
      a33 = ae[8];

    const b12 = a33 * a22 - a23 * a32;
    const b22 = -a33 * a21 + a23 * a31;
    const b32 = a32 * a21 - a22 * a31;

    let det = a11 * b12 + a12 * b22 + a13 * b32;
    if (!det) {
      return;
    }
    det = 1.0 / det;

    oe[0] = b12 * det;
    oe[1] = (-a33 * a12 + a13 * a32) * det;
    oe[2] = (a23 * a12 - a13 * a22) * det;

    oe[3] = b22 * det;
    oe[4] = (a33 * a11 - a13 * a31) * det;
    oe[5] = (-a23 * a11 + a13 * a21) * det;

    oe[6] = b32 * det;
    oe[7] = (-a32 * a11 + a12 * a31) * det;
    oe[8] = (a22 * a11 - a12 * a21) * det;
  }

  /**
   * Calculate a 3x3 normal matrix from a 4x4 matrix.
   * @remarks The calculation process is the transpose matrix of the inverse matrix.
   * @param mat4 - The 4x4 matrix
   * @param out - THe 3x3 normal matrix
   */
  static normalMatrix(mat4: Matrix, out: Matrix3x3): void {
    const ae = mat4.elements;
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
    oe[1] = (a23 * b08 - a21 * b11 - a24 * b07) * det;
    oe[2] = (a21 * b10 - a22 * b08 + a24 * b06) * det;

    oe[3] = (a13 * b10 - a12 * b11 - a14 * b09) * det;
    oe[4] = (a11 * b11 - a13 * b08 + a14 * b07) * det;
    oe[5] = (a12 * b08 - a11 * b10 - a14 * b06) * det;

    oe[6] = (a42 * b05 - a43 * b04 + a44 * b03) * det;
    oe[7] = (a43 * b02 - a41 * b05 - a44 * b01) * det;
    oe[8] = (a41 * b04 - a42 * b02 + a44 * b00) * det;
  }

  /**
   * The specified matrix rotates around an angle.
   * @param a - The specified matrix
   * @param r - The rotation angle in radians
   * @param out - The rotated matrix
   */
  static rotate(a: Matrix3x3, r: number, out: Matrix3x3): void {
    const ae = a.elements;
    const oe = out.elements;
    const s = Math.sin(r);
    const c = Math.cos(r);

    const a11 = ae[0],
      a12 = ae[1],
      a13 = ae[2];
    const a21 = ae[3],
      a22 = ae[4],
      a23 = ae[5];
    const a31 = ae[6],
      a32 = ae[7],
      a33 = ae[8];

    oe[0] = c * a11 + s * a21;
    oe[1] = c * a12 + s * a22;
    oe[2] = c * a13 + s * a23;

    oe[3] = c * a21 - s * a11;
    oe[4] = c * a22 - s * a12;
    oe[5] = c * a23 - s * a13;

    oe[6] = a31;
    oe[7] = a32;
    oe[8] = a33;
  }

  /**
   * Scale a matrix by a given vector.
   * @param m - The matrix
   * @param s - The given vector
   * @param out - The scaled matrix
   */
  static scale(m: Matrix3x3, s: Vector2, out: Matrix3x3): void {
    const { _x: x, _y: y } = s;
    const ae = m.elements;
    const oe = out.elements;

    oe[0] = x * ae[0];
    oe[1] = x * ae[1];
    oe[2] = x * ae[2];

    oe[3] = y * ae[3];
    oe[4] = y * ae[4];
    oe[5] = y * ae[5];

    oe[6] = ae[6];
    oe[7] = ae[7];
    oe[8] = ae[8];
  }

  /**
   * Translate a matrix by a given vector.
   * @param m - The matrix
   * @param translation - The given vector
   * @param out - The translated matrix
   */
  static translate(m: Matrix3x3, translation: Vector2, out: Matrix3x3): void {
    const { _x: x, _y: y } = translation;
    const ae = m.elements;
    const oe = out.elements;

    const a11 = ae[0],
      a12 = ae[1],
      a13 = ae[2];
    const a21 = ae[3],
      a22 = ae[4],
      a23 = ae[5];
    const a31 = ae[6],
      a32 = ae[7],
      a33 = ae[8];

    oe[0] = a11;
    oe[1] = a12;
    oe[2] = a13;

    oe[3] = a21;
    oe[4] = a22;
    oe[5] = a23;

    oe[6] = x * a11 + y * a21 + a31;
    oe[7] = x * a12 + y * a22 + a32;
    oe[8] = x * a13 + y * a23 + a33;
  }

  /**
   * Calculate the transpose of the specified matrix.
   * @param a - The specified matrix
   * @param out - The transpose of the specified matrix
   */
  static transpose(a: Matrix3x3, out: Matrix3x3): void {
    const ae = a.elements;
    const oe = out.elements;

    if (out === a) {
      const a12 = ae[1];
      const a13 = ae[2];
      const a23 = ae[5];
      oe[1] = ae[3];
      oe[2] = ae[6];
      oe[3] = a12;
      oe[5] = ae[7];
      oe[6] = a13;
      oe[7] = a23;
    } else {
      oe[0] = ae[0];
      oe[1] = ae[3];
      oe[2] = ae[6];

      oe[3] = ae[1];
      oe[4] = ae[4];
      oe[5] = ae[7];

      oe[6] = ae[2];
      oe[7] = ae[5];
      oe[8] = ae[8];
    }
  }

  /**
   * An array containing the elements of the matrix (column matrix).
   * @remarks
   * elements[0] first column and first row value m11
   * elements[1] first column and second row value m12
   * elements[2] first column and third row value m13
   * elements[3] second column and first row value m21
   * and so on
   */
  elements: Float32Array = new Float32Array(9);

  /**
   * Constructor of 3*3 matrix.
   * @param m11 - Default 1 column 1, row 1
   * @param m12 - Default 0 column 1, row 2
   * @param m13 - Default 0 column 1, row 3
   * @param m21 - Default 0 column 2, row 1
   * @param m22 - Default 1 column 2, row 2
   * @param m23 - Default 0 column 2, row 3
   * @param m31 - Default 0 column 3, row 1
   * @param m32 - Default 0 column 3, row 2
   * @param m33 - Default 1 column 3, row 3
   */
  constructor(
    m11: number = 1,
    m12: number = 0,
    m13: number = 0,
    m21: number = 0,
    m22: number = 1,
    m23: number = 0,
    m31: number = 0,
    m32: number = 0,
    m33: number = 1
  ) {
    const e: Float32Array = this.elements;

    e[0] = m11;
    e[1] = m12;
    e[2] = m13;

    e[3] = m21;
    e[4] = m22;
    e[5] = m23;

    e[6] = m31;
    e[7] = m32;
    e[8] = m33;
  }

  /**
   * Set the value of this matrix, and return this matrix.
   * @param m11
   * @param m12
   * @param m13
   * @param m21
   * @param m22
   * @param m23
   * @param m31
   * @param m32
   * @param m33
   * @returns This matrix
   */
  set(
    m11: number,
    m12: number,
    m13: number,
    m21: number,
    m22: number,
    m23: number,
    m31: number,
    m32: number,
    m33: number
  ): Matrix3x3 {
    const e: Float32Array = this.elements;

    e[0] = m11;
    e[1] = m12;
    e[2] = m13;

    e[3] = m21;
    e[4] = m22;
    e[5] = m23;

    e[6] = m31;
    e[7] = m32;
    e[8] = m33;

    return this;
  }

  /**
   * Determines the sum of this matrix and the specified matrix.
   * @param right - The specified matrix
   * @returns This matrix that store the sum of the two matrices
   */
  add(right: Matrix3x3): Matrix3x3 {
    Matrix3x3.add(this, right, this);
    return this;
  }

  /**
   * Determines the difference between this matrix and the specified matrix.
   * @param right - The specified matrix
   * @returns This matrix that store the difference between the two matrices
   */
  subtract(right: Matrix3x3): Matrix3x3 {
    Matrix3x3.subtract(this, right, this);
    return this;
  }

  /**
   * Determines the product of this matrix and the specified matrix.
   * @param right - The specified matrix
   * @returns This matrix that store the product of the two matrices
   */
  multiply(right: Matrix3x3): Matrix3x3 {
    Matrix3x3.multiply(this, right, this);
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
      a13 = e[2];
    const a21 = e[3],
      a22 = e[4],
      a23 = e[5];
    const a31 = e[6],
      a32 = e[7],
      a33 = e[8];

    const b12 = a33 * a22 - a23 * a32;
    const b22 = -a33 * a21 + a23 * a31;
    const b32 = a32 * a21 - a22 * a31;

    return a11 * b12 + a12 * b22 + a13 * b32;
  }

  /**
   * Identity this matrix.
   * @returns This matrix after identity
   */
  identity(): Matrix3x3 {
    const e = this.elements;

    e[0] = 1;
    e[1] = 0;
    e[2] = 0;

    e[3] = 0;
    e[4] = 1;
    e[5] = 0;

    e[6] = 0;
    e[7] = 0;
    e[8] = 1;

    return this;
  }

  /**
   * Invert the matrix.
   * @returns The matrix after invert
   */
  invert(): Matrix3x3 {
    Matrix3x3.invert(this, this);
    return this;
  }

  /**
   * This matrix rotates around an angle.
   * @param r - The rotation angle in radians
   * @returns This matrix after rotate
   */
  rotate(r: number): Matrix3x3 {
    Matrix3x3.rotate(this, r, this);
    return this;
  }

  /**
   * Scale this matrix by a given vector.
   * @param s - The given vector
   * @returns This matrix after scale
   */
  scale(s: Vector2): Matrix3x3 {
    Matrix3x3.scale(this, s, this);
    return this;
  }

  /**
   * Translate this matrix by a given vector.
   * @param translation - The given vector
   * @returns This matrix after translate
   */
  translate(translation: Vector2): Matrix3x3 {
    Matrix3x3.translate(this, translation, this);
    return this;
  }

  /**
   * Calculate the transpose of this matrix.
   * @returns This matrix after transpose
   */
  transpose(): Matrix3x3 {
    Matrix3x3.transpose(this, this);
    return this;
  }

  /**
   * Creates a clone of this matrix.
   * @returns A clone of this matrix
   */
  clone(): Matrix3x3 {
    const e = this.elements;
    let ret = new Matrix3x3(e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7], e[8]);
    return ret;
  }

  /**
   * Copy this matrix from the specified matrix.
   * @param source - The specified matrix
   * @returns This matrix
   */
  copyFrom(source: Matrix3x3): Matrix3x3 {
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

    return this;
  }

  /**
   * Copy the value of this matrix from an array.
   * @param array - The array
   * @param offset - The start offset of the array
   * @returns This matrix
   */
  copyFromArray(array: ArrayLike<number>, offset: number = 0): Matrix3x3 {
    const srce = this.elements;
    for (let i = 0; i < 12; i++) {
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
  }

  /**
   * Copy the value of this 3x3 matrix from the specified 4x4 matrix.
   * upper-left principle
   * @param source - The specified 4x4 matrix
   * @returns This 3x3 matrix
   */
  copyFromMatrix(source: Matrix): Matrix3x3 {
    const ae = source.elements;
    const e = this.elements;

    e[0] = ae[0];
    e[1] = ae[1];
    e[2] = ae[2];

    e[3] = ae[4];
    e[4] = ae[5];
    e[5] = ae[6];

    e[6] = ae[8];
    e[7] = ae[9];
    e[8] = ae[10];

    return this;
  }
}
