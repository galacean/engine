import { MathUtil } from "./MathUtil";
import { Matrix4x4 } from "./Matrix4x4";
import { Quaternion } from "./Quaternion";
import { Vector2 } from "./Vector2";
import { Vector3 } from "./Vector3";

/**
 * 3x3矩阵
 */
export class Matrix3x3 {
  /**
   * 将两个矩阵相加
   *
   * @param a - 矩阵
   * @param b - 矩阵
   * @param out - 矩阵相加的结果
   */
  static add(a: Matrix3x3, b: Matrix3x3, out: Matrix3x3): void {
    const ae = a.elements;
    const be = b.elements;
    const oe = out.elements;

    oe[0] = ae[0] + be[0];
    oe[1] = ae[1] + be[1];
    oe[2] = ae[2] + be[2];
    oe[3] = ae[3] + be[3];
    oe[4] = ae[4] + be[4];
    oe[5] = ae[5] + be[5];
    oe[6] = ae[6] + be[6];
    oe[7] = ae[7] + be[7];
    oe[8] = ae[8] + be[8];
  }

  /**
   * 将两个矩阵相减 merge~sub
   *
   * @param a - 矩阵
   * @param b - 矩阵
   * @param out - 矩阵相减的结果
   */
  static subtract(a: Matrix3x3, b: Matrix3x3, out: Matrix3x3): void {
    const ae = a.elements;
    const be = b.elements;
    const oe = out.elements;

    oe[0] = ae[0] - be[0];
    oe[1] = ae[1] - be[1];
    oe[2] = ae[2] - be[2];
    oe[3] = ae[3] - be[3];
    oe[4] = ae[4] - be[4];
    oe[5] = ae[5] - be[5];
    oe[6] = ae[6] - be[6];
    oe[7] = ae[7] - be[7];
    oe[8] = ae[8] - be[8];
  }

  /**
   * 将两个矩阵相乘 merge~mul
   *
   * @param a - 矩阵
   * @param b - 矩阵
   * @param out - 矩阵相乘的结果
   */
  static multiply(a: Matrix3x3, b: Matrix3x3, out: Matrix3x3): void {
    const ae = a.elements;
    const be = b.elements;
    const oe = out.elements;

    const a11 = ae[0];
    const a12 = ae[1];
    const a13 = ae[2];
    const a21 = ae[3];
    const a22 = ae[4];
    const a23 = ae[5];
    const a31 = ae[6];
    const a32 = ae[7];
    const a33 = ae[8];

    const b11 = be[0];
    const b12 = be[1];
    const b13 = be[2];
    const b21 = be[3];
    const b22 = be[4];
    const b23 = be[5];
    const b31 = be[6];
    const b32 = be[7];
    const b33 = be[8];

    oe[0] = a11 * b11 + a21 * b12 + a31 * b13;
    oe[1] = a12 * b11 + a22 * b12 + a32 * b13;
    oe[2] = a13 * b11 + a23 * b12 + a33 * b13;

    oe[3] = a11 * b21 + a21 * b22 + a31 * b23;
    oe[4] = a12 * b21 + a22 * b22 + a32 * b23;
    oe[5] = a13 * b21 + a23 * b22 + a33 * b23;

    oe[6] = a11 * b31 + a21 * b32 + a31 * b33;
    oe[7] = a12 * b31 + a22 * b32 + a32 * b33;
    oe[8] = a13 * b31 + a23 * b32 + a33 * b33;
  }

  /**
   * 判断两个三维矩阵的值是否相等 merge~exactEquals
   *
   * @param a - 矩阵
   * @param b - 矩阵
   */
  static equals(a: Matrix3x3, b: Matrix3x3): boolean {
    const ae = a.elements;
    const be = b.elements;

    return (
      MathUtil.equals(ae[0], be[0]) &&
      MathUtil.equals(ae[1], be[1]) &&
      MathUtil.equals(ae[2], be[2]) &&
      MathUtil.equals(ae[3], be[3]) &&
      MathUtil.equals(ae[4], be[4]) &&
      MathUtil.equals(ae[5], be[5]) &&
      MathUtil.equals(ae[6], be[6]) &&
      MathUtil.equals(ae[7], be[7]) &&
      MathUtil.equals(ae[8], be[8])
    );
  }

  /**
   * 从4x4矩阵转换为一个3x3矩阵，upper-left原则，即忽略第4行第4列
   *
   * @param a - 4x4矩阵
   * @param out - 转换后的3x3矩阵
   */
  static fromMat4(a: Matrix4x4, out: Matrix3x3): void {
    const oe = out.elements;
    const ae = a.elements;

    oe[0] = ae[0];
    oe[1] = ae[1];
    oe[2] = ae[2];
    oe[3] = ae[4];
    oe[4] = ae[5];
    oe[5] = ae[6];
    oe[6] = ae[8];
    oe[7] = ae[9];
    oe[8] = ae[10];
  }

  /**
   * 从四元数转换为一个3x3矩阵
   *
   * @param q - 四元数
   * @param out - 转换后的3x3矩阵
   */
  static fromQuat(q: Quaternion, out: Matrix3x3): void {
    const oe = out.elements;
    const { x, y, z, w } = q;
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
   * 通过指定旋转生成3x3矩阵
   *
   * @param rad - 旋转角度
   * @param out - 指定旋转后矩阵
   */
  static fromRotation(rad: number, out: Matrix3x3): void {
    const oe = out.elements;
    const s = Math.sin(rad);
    const c = Math.cos(rad);

    oe[0] = c;
    oe[1] = s;
    oe[2] = 0;

    oe[3] = -s;
    oe[4] = c;
    oe[5] = 0;

    oe[6] = 0;
    oe[7] = 0;
    oe[8] = 1;
  }

  /**
   * 通过指定缩放生成3x3矩阵
   *
   * @param scale - 缩放向量
   * @param out - 指定缩放后矩阵
   */
  static fromScaling(scale: Vector3, out: Matrix3x3): void {
    const oe = out.elements;

    oe[0] = scale.x;
    oe[1] = 0;
    oe[2] = 0;

    oe[3] = 0;
    oe[4] = scale.y;
    oe[5] = 0;

    oe[6] = 0;
    oe[7] = 0;
    oe[8] = scale.z;
  }

  /**
   * 通过指定平移生成3x3矩阵
   *
   * @param trans - 平移向量
   * @param out - 指定平移后矩阵
   */
  static fromTranslation(trans: Vector2, out: Matrix3x3): void {
    const oe = out.elements;

    oe[0] = 1;
    oe[1] = 0;
    oe[2] = 0;
    oe[3] = 0;
    oe[4] = 1;
    oe[5] = 0;
    oe[6] = trans.x;
    oe[7] = trans.y;
    oe[8] = 1;
  }

  /**
   * 计算矩阵a的逆矩阵，并将结果输出到out
   *
   * @param a - 矩阵
   * @param out - 逆矩阵
   */
  static invert(a: Matrix3x3, out: Matrix3x3): void {
    const ae = a.elements;
    const oe = out.elements;

    const a11 = ae[0];
    const a12 = ae[1];
    const a13 = ae[2];
    const a21 = ae[3];
    const a22 = ae[4];
    const a23 = ae[5];
    const a31 = ae[6];
    const a32 = ae[7];
    const a33 = ae[8];

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
   * 从4x4矩阵中计算出3x3法线矩阵
   *
   * @param a - 4x4矩阵
   * @param out - 计算出来的3x3法线矩阵
   */
  static normalFromMat4(a: Matrix4x4, out: Matrix3x3): void {
    const ae = a.elements;
    const oe = out.elements;

    const a11 = ae[0];
    const a12 = ae[1];
    const a13 = ae[2];
    const a14 = ae[3];
    const a21 = ae[4];
    const a22 = ae[5];
    const a23 = ae[6];
    const a24 = ae[7];
    const a31 = ae[8];
    const a32 = ae[9];
    const a33 = ae[10];
    const a34 = ae[11];
    const a41 = ae[12];
    const a42 = ae[13];
    const a43 = ae[14];
    const a44 = ae[15];

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
   * 将矩阵a按给定角度旋转，并将结果输出到out
   *
   * @param a - 矩阵
   * @param rad - 给定的旋转角度
   * @param out - 旋转后的矩阵
   */
  static rotate(a: Matrix3x3, rad: number, out: Matrix3x3): void {
    const ae = a.elements;
    const oe = out.elements;
    const s = Math.sin(rad);
    const c = Math.cos(rad);

    const a11 = ae[0];
    const a12 = ae[1];
    const a13 = ae[2];
    const a21 = ae[3];
    const a22 = ae[4];
    const a23 = ae[5];
    const a31 = ae[6];
    const a32 = ae[7];
    const a33 = ae[8];

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
   * 将矩阵a按给定向量v缩放，并将结果输出到out
   *
   * @param a - 矩阵
   * @param s - 缩放向量
   * @param out - 缩放后的矩阵
   */
  static scale(a: Matrix3x3, s: Vector2, out: Matrix3x3): void {
    const { x, y } = s;
    const ae = a.elements;
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
   * 将矩阵a按给定向量v转换，并将结果输出到out
   *
   * @param a - 矩阵
   * @param v - 转换向量
   * @param out - 转换后的结果
   */
  static translate(a: Matrix3x3, v: Vector2, out: Matrix3x3): void {
    const { x, y } = v;
    const ae = a.elements;
    const oe = out.elements;

    const a11 = ae[0];
    const a12 = ae[1];
    const a13 = ae[2];
    const a21 = ae[3];
    const a22 = ae[4];
    const a23 = ae[5];
    const a31 = ae[6];
    const a32 = ae[7];
    const a33 = ae[8];

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
   * 计算矩阵a的转置矩阵，并将结果输出到out
   *
   * @param a - 矩阵
   * @param out - 转置矩阵
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

  /** 矩阵元素数组 */
  elements: Float32Array = new Float32Array(9);

  /**
   * 创建3x3矩阵实例，默认创建单位矩阵，我们采用列矩阵
   *
   * @param m11 - 默认值1 column 1, row 1
   * @param m12 - 默认值0 column 1, row 2
   * @param m13 - 默认值0 column 1, row 3
   * @param m21 - 默认值0 column 2, row 1
   * @param m22 - 默认值1 column 2, row 2
   * @param m23 - 默认值0 column 2, row 3
   * @param m31 - 默认值0 column 3, row 1
   * @param m32 - 默认值0 column 3, row 2
   * @param m33 - 默认值1 column 3, row 3
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
   * 给矩阵设置值，并返回当前值
   *
   * @param m11
   * @param m12
   * @param m13
   * @param m21
   * @param m22
   * @param m23
   * @param m31
   * @param m32
   * @param m33
   */
  setValue(
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
   * 创建一个新的三维矩阵，并用当前矩阵值初始化
   */
  clone(): Matrix3x3 {
    const e = this.elements;
    let ret = new Matrix3x3(e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7], e[8]);
    return ret;
  }

  /**
   * 将当前矩阵值拷贝给out矩阵 rename~copy
   *
   * @param out - 目标矩阵
   */
  cloneTo(out: Matrix3x3): void {
    const e = this.elements;
    const oe = out.elements;

    oe[0] = e[0];
    oe[1] = e[1];
    oe[2] = e[2];
    oe[3] = e[3];
    oe[4] = e[4];
    oe[5] = e[5];
    oe[6] = e[6];
    oe[7] = e[7];
    oe[8] = e[8];
  }

  /**
   * 将当前矩阵加上给定的向量a，并返回当前矩阵
   *
   * @param b - 给定的向量，右操作数
   */
  add(b: Matrix3x3): Matrix3x3 {
    const be = b.elements;
    const e = this.elements;

    e[0] += be[0];
    e[1] += be[1];
    e[2] += be[2];
    e[3] += be[3];
    e[4] += be[4];
    e[5] += be[5];
    e[6] += be[6];
    e[7] += be[7];
    e[8] += be[8];

    return this;
  }

  /**
   * 将当前矩阵减去给定的向量a，并返回当前矩阵
   *
   * @param b - 给定的向量，右操作数
   */
  subtract(b: Matrix3x3): Matrix3x3 {
    const be = b.elements;
    const e = this.elements;

    e[0] -= be[0];
    e[1] -= be[1];
    e[2] -= be[2];
    e[3] -= be[3];
    e[4] -= be[4];
    e[5] -= be[5];
    e[6] -= be[6];
    e[7] -= be[7];
    e[8] -= be[8];

    return this;
  }

  /**
   * 将当前矩阵乘以给定的向量a，并返回当前矩阵
   *
   * @param b - 给定的向量，右操作数
   */
  multiply(b: Matrix3x3): Matrix3x3 {
    const be = b.elements;
    const e = this.elements;

    const a11 = e[0];
    const a12 = e[1];
    const a13 = e[2];
    const a21 = e[3];
    const a22 = e[4];
    const a23 = e[5];
    const a31 = e[6];
    const a32 = e[7];
    const a33 = e[8];

    const b11 = be[0];
    const b12 = be[1];
    const b13 = be[2];
    const b21 = be[3];
    const b22 = be[4];
    const b23 = be[5];
    const b31 = be[6];
    const b32 = be[7];
    const b33 = be[8];

    e[0] = a11 * b11 + a21 * b12 + a31 * b13;
    e[1] = a12 * b11 + a22 * b12 + a32 * b13;
    e[2] = a13 * b11 + a23 * b12 + a33 * b13;

    e[3] = a11 * b21 + a21 * b22 + a31 * b23;
    e[4] = a12 * b21 + a22 * b22 + a32 * b23;
    e[5] = a13 * b21 + a23 * b22 + a33 * b23;

    e[6] = a11 * b31 + a21 * b32 + a31 * b33;
    e[7] = a12 * b31 + a22 * b32 + a32 * b33;
    e[8] = a13 * b31 + a23 * b32 + a33 * b33;

    return this;
  }

  /**
   * 计算3x3矩阵的行列式
   */
  determinant(): number {
    const e = this.elements;

    const a11 = e[0];
    const a12 = e[1];
    const a13 = e[2];
    const a21 = e[3];
    const a22 = e[4];
    const a23 = e[5];
    const a31 = e[6];
    const a32 = e[7];
    const a33 = e[8];

    const b12 = a33 * a22 - a23 * a32;
    const b22 = -a33 * a21 + a23 * a31;
    const b32 = a32 * a21 - a22 * a31;

    return a11 * b12 + a12 * b22 + a13 * b32;
  }

  /**
   * 将矩阵设置为单位矩阵，并返回
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
   * 计算当前矩阵的逆矩阵，并返回
   */
  invert(): Matrix3x3 {
    const ae = this.elements;

    const a11 = ae[0];
    const a12 = ae[1];
    const a13 = ae[2];
    const a21 = ae[3];
    const a22 = ae[4];
    const a23 = ae[5];
    const a31 = ae[6];
    const a32 = ae[7];
    const a33 = ae[8];

    const b12 = a33 * a22 - a23 * a32;
    const b22 = -a33 * a21 + a23 * a31;
    const b32 = a32 * a21 - a22 * a31;

    let det = a11 * b12 + a12 * b22 + a13 * b32;
    if (!det) {
      return;
    }
    det = 1.0 / det;

    ae[0] = b12 * det;
    ae[1] = (-a33 * a12 + a13 * a32) * det;
    ae[2] = (a23 * a12 - a13 * a22) * det;
    ae[3] = b22 * det;
    ae[4] = (a33 * a11 - a13 * a31) * det;
    ae[5] = (-a23 * a11 + a13 * a21) * det;
    ae[6] = b32 * det;
    ae[7] = (-a32 * a11 + a12 * a31) * det;
    ae[8] = (a22 * a11 - a12 * a21) * det;

    return this;
  }

  /**
   * 将当前矩阵按给定角度旋转，并返回
   *
   * @param rad - 给定的旋转角度
   */
  rotate(rad: number): Matrix3x3 {
    const ae = this.elements;
    const s = Math.sin(rad);
    const c = Math.cos(rad);

    const a11 = ae[0];
    const a12 = ae[1];
    const a13 = ae[2];
    const a21 = ae[3];
    const a22 = ae[4];
    const a23 = ae[5];

    ae[0] = c * a11 + s * a21;
    ae[1] = c * a12 + s * a22;
    ae[2] = c * a13 + s * a23;

    ae[3] = c * a21 - s * a11;
    ae[4] = c * a22 - s * a12;
    ae[5] = c * a23 - s * a13;

    return this;
  }

  /**
   * 将当前矩阵按给定向量v缩放，并返回
   *
   * @param s - 缩放向量
   */
  scale(s: Vector2): Matrix3x3 {
    const { x, y } = s;
    const ae = this.elements;

    ae[0] *= x;
    ae[1] *= x;
    ae[2] *= x;

    ae[3] *= y;
    ae[4] *= y;
    ae[5] *= y;

    return this;
  }

  /**
   * 将当前矩阵按给定向量v转换，并返回
   *
   * @param v - 转换向量
   */
  translate(v: Vector2): Matrix3x3 {
    const { x, y } = v;
    const ae = this.elements;

    const a11 = ae[0];
    const a12 = ae[1];
    const a13 = ae[2];
    const a21 = ae[3];
    const a22 = ae[4];
    const a23 = ae[5];
    const a31 = ae[6];
    const a32 = ae[7];
    const a33 = ae[8];

    ae[6] = x * a11 + y * a21 + a31;
    ae[7] = x * a12 + y * a22 + a32;
    ae[8] = x * a13 + y * a23 + a33;

    return this;
  }

  /**
   * 计算当前矩阵的转置矩阵，并返回
   */
  transpose(): Matrix3x3 {
    const ae = this.elements;

    const a12 = ae[1];
    const a13 = ae[2];
    const a23 = ae[5];
    ae[1] = ae[3];
    ae[2] = ae[6];
    ae[3] = a12;
    ae[5] = ae[7];
    ae[6] = a13;
    ae[7] = a23;

    return this;
  }
}
