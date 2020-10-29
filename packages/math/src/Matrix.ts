import { IClone } from "@alipay/o3-design";
import { MathUtil } from "./MathUtil";
import { Matrix3x3 } from "./Matrix3x3";
import { Quaternion } from "./Quaternion";
import { Vector3 } from "./Vector3";

/**
 * 4x4矩阵。
 */
export class Matrix implements IClone {
  /** @internal */
  private static readonly _tempVec30: Vector3 = new Vector3();
  /** @internal */
  private static readonly _tempVec31: Vector3 = new Vector3();
  /** @internal */
  private static readonly _tempVec32: Vector3 = new Vector3();
  /** @internal */
  private static readonly _tempMat30: Matrix3x3 = new Matrix3x3();
  /** @internal */
  private static readonly _tempMat40: Matrix = new Matrix();

  /** @internal 单位矩阵。*/
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
   * 将两个矩阵相乘。
   * @param left - 左矩阵
   * @param right - 右矩阵
   * @param out - 矩阵相乘的结果
   */
  static multiply(left: Matrix, right: Matrix, out: Matrix): void {
    const le = left.elements;
    const re = right.elements;
    const oe = out.elements;

    const l11 = le[0],
      l12 = le[1],
      l13 = le[2],
      l14 = le[3];
    const l21 = le[4],
      l22 = le[5],
      l23 = le[6],
      l24 = le[7];
    const l31 = le[8],
      l32 = le[9],
      l33 = le[10],
      l34 = le[11];
    const l41 = le[12],
      l42 = le[13],
      l43 = le[14],
      l44 = le[15];

    const r11 = re[0],
      r12 = re[1],
      r13 = re[2],
      r14 = re[3];
    const r21 = re[4],
      r22 = re[5],
      r23 = re[6],
      r24 = re[7];
    const r31 = re[8],
      r32 = re[9],
      r33 = re[10],
      r34 = re[11];
    const r41 = re[12],
      r42 = re[13],
      r43 = re[14],
      r44 = re[15];

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
   * 判断两个矩阵的值是否相等。
   * @param left - 左矩阵
   * @param right - 右矩阵
   * @returns 两个矩阵是否相等，是返回 true，否则返回 false
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
   * 通过四元数生成旋转矩阵。
   * @param q - 四元数
   * @param out - 转换后的4x4矩阵
   */
  static rotationQuaternion(q: Quaternion, out: Matrix): void {
    const oe = out.elements;
    const { x, y, z, w } = q;
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
   * 通过绕任意轴旋转生成4x4矩阵。
   * * @param axis - 旋转轴
   * @param r - 旋转角度
   * @param out - 指定旋转后矩阵
   */
  static rotationAxisAngle(axis: Vector3, r: number, out: Matrix): void {
    //CM：stride实现
    const oe = out.elements;
    let { x, y, z } = axis;
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
   * 通过指定的旋转四元数,转换向量生成4x4矩阵。
   * @param q - 旋转四元数
   * @param trans - 转换向量
   * @param out - 生成的4x4矩阵
   */
  static rotationTranslation(q: Quaternion, trans: Vector3, out: Matrix): void {
    Matrix.rotationQuaternion(q, out);

    const oe = out.elements;
    oe[12] = trans.x;
    oe[13] = trans.y;
    oe[14] = trans.z;
  }

  /**
   * 创建仿射矩阵。
   * @param scale - 缩放向量
   * @param rotation - 旋转四元数
   * @param trans - 转换向量
   * @param out - 生成的4x4矩阵
   */
  static affineTransformation(scale: Vector3, rotation: Quaternion, trans: Vector3, out: Matrix): void {
    const oe = out.elements;
    const { x, y, z, w } = rotation;
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
    let sx = scale.x;
    let sy = scale.y;
    let sz = scale.z;

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

    oe[12] = trans.x;
    oe[13] = trans.y;
    oe[14] = trans.z;
    oe[15] = 1;
  }

  /**
   * 通过指定缩放生成4x4矩阵。
   * @param s - 缩放向量
   * @param out - 指定缩放后矩阵
   */
  static scaling(s: Vector3, out: Matrix): void {
    const oe = out.elements;
    oe[0] = s.x;
    oe[1] = 0;
    oe[2] = 0;
    oe[3] = 0;

    oe[4] = 0;
    oe[5] = s.y;
    oe[6] = 0;
    oe[7] = 0;

    oe[8] = 0;
    oe[9] = 0;
    oe[10] = s.z;
    oe[11] = 0;

    oe[12] = 0;
    oe[13] = 0;
    oe[14] = 0;
    oe[15] = 1;
  }

  /**
   * 通过指定平移生成4x4矩阵。
   * @param trans - 平移向量
   * @param out - 指定平移后矩阵
   */
  static translation(trans: Vector3, out: Matrix): void {
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

    oe[12] = trans.x;
    oe[13] = trans.y;
    oe[14] = trans.z;
    oe[15] = 1;
  }

  /**
   * 计算矩阵 a 的逆矩阵，并将结果输出到 out。
   * @param a - 矩阵
   * @param out - 逆矩阵
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
   * 计算观察矩阵，基于右手坐标系。
   * @param eye - 观察者视点位置
   * @param target - 视点目标
   * @param up - 向上向量
   * @param out - 观察矩阵
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

    oe[0] = xAxis.x;
    oe[1] = yAxis.x;
    oe[2] = zAxis.x;
    oe[3] = 0;

    oe[4] = xAxis.y;
    oe[5] = yAxis.y;
    oe[6] = zAxis.y;
    oe[7] = 0;

    oe[8] = xAxis.z;
    oe[9] = yAxis.z;
    oe[10] = zAxis.z;
    oe[11] = 0;

    oe[12] = -Vector3.dot(xAxis, eye);
    oe[13] = -Vector3.dot(yAxis, eye);
    oe[14] = -Vector3.dot(zAxis, eye);
    oe[15] = 1;
  }

  /**
   * 计算正交投影矩阵。
   * @param left - 视锥左边界
   * @param right - 视锥右边界
   * @param bottom - 视锥底边界
   * @param top - 视锥顶边界
   * @param near - 视锥近边界
   * @param far - 视锥远边界
   * @param out - 正交投影矩阵
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
   * 计算透视投影矩阵。
   * @param fovy - 视角
   * @param aspect - 视图的宽高比
   * @param near - 近裁面
   * @param far - 远裁面
   * @param out - 透视投影矩阵
   */
  static perspective(fovy: number, aspect: number, near: number, far: number, out: Matrix): void {
    const oe = out.elements;
    const f = 1.0 / Math.tan(fovy / 2);
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
   * 将矩阵 a 按给定角度旋转，并将结果输出到 out。
   * @param m - 矩阵
   * @param axis - 旋转轴
   * @param r - 给定的旋转角度
   * @param out - 旋转后的矩阵
   */
  static rotateAxisAngle(m: Matrix, axis: Vector3, r: number, out: Matrix): void {
    let { x, y, z } = axis;
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
   * 将矩阵 a 按给定向量 v 缩放，并将结果输出到 out。
   * @param m - 矩阵
   * @param s - 缩放向量
   * @param out - 缩放后的矩阵
   */
  static scale(m: Matrix, s: Vector3, out: Matrix): void {
    const me = m.elements;
    const oe = out.elements;
    const { x, y, z } = s;

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
   * 将矩阵 a 按给定向量 v 转换，并将结果输出到 out。
   * @param m - 矩阵
   * @param v - 转换向量
   * @param out - 转换后的结果
   */
  static translate(m: Matrix, v: Vector3, out: Matrix): void {
    const me = m.elements;
    const oe = out.elements;
    const { x, y, z } = v;

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
   * 计算矩阵 a 的转置矩阵，并将结果输出到 out。
   * @param a - 矩阵
   * @param out - 转置矩阵
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
   * 矩阵元素数组，采用列矩阵的模式存储。
   * @remarks
   * elements[0] 表示第 1 列第 1 行 m11
   * elements[1] 表示第 1 列第 2 行 m12
   * elements[2] 表示第 1 列第 3 行 m13
   * elements[3] 表示第 1 列第 4 行 m14
   * elements[4] 表示第 2 列第 1 行 m21
   * 依次类推
   */
  elements: Float32Array = new Float32Array(16);

  /**
   * 创建4x4矩阵实例，默认创建单位矩阵，采用列矩阵的模式存储。
   * @param m11 - 默认值 1，column 1, row 1
   * @param m12 - 默认值 0，column 1, row 2
   * @param m13 - 默认值 0，column 1, row 3
   * @param m14 - 默认值 0，column 1, row 4
   * @param m21 - 默认值 0，column 2, row 1
   * @param m22 - 默认值 1，column 2, row 2
   * @param m23 - 默认值 0，column 2, row 3
   * @param m24 - 默认值 0，column 2, row 4
   * @param m31 - 默认值 0，column 3, row 1
   * @param m32 - 默认值 0，column 3, row 2
   * @param m33 - 默认值 1，column 3, row 3
   * @param m34 - 默认值 0，column 3, row 4
   * @param m41 - 默认值 0，column 4, row 1
   * @param m42 - 默认值 0，column 4, row 2
   * @param m43 - 默认值 0，column 4, row 3
   * @param m44 - 默认值 1，column 4, row 4
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
   * 给矩阵设置值，并返回当前值。
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
   * @returns 当前矩阵
   */
  setValue(
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
   * 通过数组设置值，并返回当前矩阵。
   * @param array - 数组
   * @param offset - 数组偏移
   * @returns 当前矩阵
   */
  setValueByArray(array: ArrayLike<number>, offset: number = 0): Matrix {
    const srce = this.elements;
    for (let i = 0; i < 16; i++) {
      srce[i] = array[i + offset];
    }
    return this;
  }

  /**
   * 拷贝到数组。
   * @param out - 数组。
   * @param outOffset - 数组偏移。
   */
  toArray(out: number[] | Float32Array | Float64Array, outOffset: number = 0) {
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

  /**
   * 创建一个新的矩阵，并用当前矩阵值初始化。
   * @returns 一个新的矩阵，并且拷贝当前矩阵的值
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
   * 将当前矩阵值拷贝给 out 矩阵。
   * @param out - 目标矩阵
   */
  cloneTo(out: Matrix): Matrix {
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
    oe[9] = e[9];
    oe[10] = e[10];
    oe[11] = e[11];

    oe[12] = e[12];
    oe[13] = e[13];
    oe[14] = e[14];
    oe[15] = e[15];

    return out;
  }

  /**
   * 将当前矩阵乘以给定的向量 right，并返回当前矩阵。
   * @param right - 给定的向量，右操作数
   * @returns 当前矩阵
   */
  multiply(right: Matrix): Matrix {
    Matrix.multiply(this, right, this);
    return this;
  }

  /**
   * 计算4x4矩阵的行列式。
   * @returns 当前矩阵的行列式
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
   * 将矩阵分解为平移向量、旋转四元数、缩放向量。
   * @param pos - 平移向量
   * @param q - 旋转四元数
   * @param s - 缩放向量
   * @returns 是否可以分解。
   */
  decompose(pos: Vector3, q: Quaternion, s: Vector3): boolean {
    const rm: Matrix3x3 = Matrix._tempMat30;

    const e = this.elements;
    const rme = rm.elements;

    const m11 = e[0];
    const m12 = e[1];
    const m13 = e[2];
    const m14 = e[3];
    const m21 = e[4];
    const m22 = e[5];
    const m23 = e[6];
    const m24 = e[7];
    const m31 = e[8];
    const m32 = e[9];
    const m33 = e[10];
    const m34 = e[11];

    pos.x = e[12];
    pos.y = e[13];
    pos.z = e[14];

    const xs = Math.sign(m11 * m12 * m13 * m14) < 0 ? -1 : 1;
    const ys = Math.sign(m21 * m22 * m23 * m24) < 0 ? -1 : 1;
    const zs = Math.sign(m31 * m32 * m33 * m34) < 0 ? -1 : 1;

    const sx = xs * Math.sqrt(m11 * m11 + m12 * m12 + m13 * m13);
    const sy = ys * Math.sqrt(m21 * m21 + m22 * m22 + m23 * m23);
    const sz = zs * Math.sqrt(m31 * m31 + m32 * m32 + m33 * m33);

    s.x = sx;
    s.y = sy;
    s.z = sz;

    if (
      Math.abs(sx) < MathUtil.zeroTolerance ||
      Math.abs(sy) < MathUtil.zeroTolerance ||
      Math.abs(sz) < MathUtil.zeroTolerance
    ) {
      q.identity();
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
      Quaternion.rotationMatrix3x3(rm, q);
      return true;
    }
  }

  /**
   * 从矩阵中返回表示旋转的四元数。
   * @param a - 转换矩阵
   * @param out - 表示旋转的四元数
   * @returns 当前矩阵的旋转四元数
   */
  getRotation(out: Quaternion): Quaternion {
    const e = this.elements;
    let trace = e[0] + e[5] + e[10];
    let S = 0;

    if (trace > MathUtil.zeroTolerance) {
      S = Math.sqrt(trace + 1.0) * 2;
      out.w = 0.25 * S;
      out.x = (e[6] - e[9]) / S;
      out.y = (e[8] - e[2]) / S;
      out.z = (e[1] - e[4]) / S;
    } else if (e[0] > e[5] && e[0] > e[10]) {
      S = Math.sqrt(1.0 + e[0] - e[5] - e[10]) * 2;
      out.w = (e[6] - e[9]) / S;
      out.x = 0.25 * S;
      out.y = (e[1] + e[4]) / S;
      out.z = (e[8] + e[2]) / S;
    } else if (e[5] > e[10]) {
      S = Math.sqrt(1.0 + e[5] - e[0] - e[10]) * 2;
      out.w = (e[8] - e[2]) / S;
      out.x = (e[1] + e[4]) / S;
      out.y = 0.25 * S;
      out.z = (e[6] + e[9]) / S;
    } else {
      S = Math.sqrt(1.0 + e[10] - e[0] - e[5]) * 2;
      out.w = (e[1] - e[4]) / S;
      out.x = (e[8] + e[2]) / S;
      out.y = (e[6] + e[9]) / S;
      out.z = 0.25 * S;
    }

    return out;
  }

  /**
   * 从矩阵中返回缩放向量。
   * @param out - 缩放向量
   * @returns 当前矩阵的缩放向量
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

    out.x = Math.sqrt(m11 * m11 + m12 * m12 + m13 * m13);
    out.y = Math.sqrt(m21 * m21 + m22 * m22 + m23 * m23);
    out.z = Math.sqrt(m31 * m31 + m32 * m32 + m33 * m33);

    return out;
  }

  /**
   * 从矩阵中返回转换向量。
   * @param out - 转换向量
   * @returns 当前矩阵的转换向量
   */
  getTranslation(out: Vector3): Vector3 {
    const e = this.elements;

    out.x = e[12];
    out.y = e[13];
    out.z = e[14];

    return out;
  }

  /**
   * 将矩阵设置为单位矩阵。
   * @returns 当前矩阵
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
   * 计算当前矩阵的逆矩阵，并返回。
   * @returns 当前矩阵
   */
  invert(): Matrix {
    Matrix.invert(this, this);
    return this;
  }

  /**
   * 将当前矩阵按给定角度旋转，并返回。
   * @param axis - 旋转轴
   * @param r - 给定的旋转角度
   * @returns 当前矩阵
   */
  rotateAxisAngle(axis: Vector3, r: number): Matrix {
    Matrix.rotateAxisAngle(this, axis, r, this);
    return this;
  }

  /**
   * 将当前矩阵按给定向量 v 缩放，并返回。
   * @param s
   * @returns 当前矩阵
   */
  scale(s: Vector3): Matrix {
    Matrix.scale(this, s, this);
    return this;
  }

  /**
   * 将当前矩阵按给定向量 v 转换，并返回。
   * @param v - 转换向量
   * @returns 当前矩阵
   */
  translate(v: Vector3): Matrix {
    Matrix.translate(this, v, this);
    return this;
  }

  /**
   * 计算当前矩阵的转置矩阵，并返回。
   * @returns 当前矩阵
   */
  transpose(): Matrix {
    Matrix.transpose(this, this);
    return this;
  }
}
