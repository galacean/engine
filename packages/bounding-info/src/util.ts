import { Mat4 } from "./type";
import { Primitive } from "@alipay/o3-primitive";
import { vec3 } from "@alipay/o3-math";

/**
 * 一个点到一个平面的距离
 * @param {Vec4} plane - 平面方程
 * @param {Vec3} pt - 点的位置矢量
 * @private
 */
export function pointDistanceToPlane(plane, pt) {
  return plane[0] * pt[0] + plane[1] * pt[1] + plane[2] * pt[2] + plane[3];
}

/**
 * 从列主序矩阵获取最大轴向的 scale
 * @param {Mat4} modelMatrix - Local to World矩阵
 * */
export function getMaxScaleByModelMatrix(modelMatrix: Mat4): number {
  let m = modelMatrix;
  let scaleXSq = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
  let scaleYSq = m[4] * m[4] + m[5] * m[5] + m[6] * m[6];
  let scaleZSq = m[8] * m[8] + m[9] * m[9] + m[10] * m[10];
  return Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq));
}

/**
 * 通过 primitive 计算本地/世界坐标系的 min/max
 * @param {Primitive}  primitive - Oasis primitive
 * @param {Mat4} modelMatrix - Local to World矩阵,如果传此值，则计算min/max时将考虑RTS变换，如果不传，则计算local min/max
 * @param {boolean} littleEndian - 是否以小端字节序读取，默认true
 * */
export function getMinMaxFromPrimitive(primitive: Primitive, modelMatrix: Mat4, littleEndian = true) {
  let {
    vertexCount,
    vertexBuffers,
    vertexAttributes: {
      POSITION: { size, offset, stride, vertexBufferIndex }
    }
  } = primitive;
  let arrayBuffer = vertexBuffers[vertexBufferIndex];
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    arrayBuffer = arrayBuffer.buffer;
  }
  if (stride === 0) {
    stride = size * 4;
  }
  const dataView = new DataView(arrayBuffer, offset);

  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertexCount; i++) {
    const base = offset + stride * i;
    const position = [
      dataView.getFloat32(base, littleEndian),
      dataView.getFloat32(base + 4, littleEndian),
      dataView.getFloat32(base + 8, littleEndian)
    ];
    modelMatrix && vec3.transformMat4(position, position, modelMatrix);
    vec3.min(min, min, position);
    vec3.max(max, max, position);
  }

  return {
    min,
    max
  };
}
