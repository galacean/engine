import { DataType } from "../../base/Constant";
/**
 * 顶点元素格式。
 */
export enum VertexElementFormat {
  /** 单精度浮点数。*/
  Single,
  /** 二维单精度浮点数。 */
  Vector2,
  /** 三维单精度浮点数。 */
  Vector3,
  /** 四维单精度浮点数。 */
  Vector4,
  /** 四维字节整型。 */
  Byte4,
  /** 二维 Short 整型。 */
  Short2,
  /** 四维 Short 整型。 */
  Short4
}

export function getElementInfo(format: VertexElementFormat) {
  let size;
  let type;
  switch (format) {
    case VertexElementFormat.Single:
      size = 1;
      type = DataType.FLOAT;
      break;
    case VertexElementFormat.Vector2:
      size = 2;
      type = DataType.FLOAT;
      break;
    case VertexElementFormat.Vector3:
      size = 3;
      type = DataType.FLOAT;
      break;
    case VertexElementFormat.Vector4:
      size = 4;
      type = DataType.FLOAT;
      break;
    case VertexElementFormat.Byte4:
      size = 4;
      type = DataType.UNSIGNED_BYTE;
      break;
    case VertexElementFormat.Short2:
      size = 2;
      type = DataType.SHORT;
      break;
    case VertexElementFormat.Short4:
      size = 4;
      type = DataType.SHORT;
      break;
    default:
      break;
  }
  return { size, type };
}
