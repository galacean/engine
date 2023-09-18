import { DataType } from "../base/Constant";
import { IndexFormat } from "./enums/IndexFormat";
import { VertexElementFormat } from "./enums/VertexElementFormat";

export interface ElementInfo {
  size: number;
  type: DataType;
  normalized: boolean;
  normalizedScaleFactor: number;
}

export class BufferUtil {
  static _getGLIndexType(indexFormat: IndexFormat): DataType {
    switch (indexFormat) {
      case IndexFormat.UInt8:
        return DataType.UNSIGNED_BYTE;
      case IndexFormat.UInt16:
        return DataType.UNSIGNED_SHORT;
      case IndexFormat.UInt32:
        return DataType.UNSIGNED_INT;
    }
  }

  static _getGLIndexByteCount(indexFormat: IndexFormat): number {
    switch (indexFormat) {
      case IndexFormat.UInt8:
        return 1;
      case IndexFormat.UInt16:
        return 2;
      case IndexFormat.UInt32:
        return 4;
    }
  }

  /**
   * @internal
   */
  static _getElementInfo(format: VertexElementFormat): ElementInfo {
    let size: number;
    let type: DataType;
    let normalized: boolean = false;
    let normalizedScaleFactor: number;

    switch (format) {
      case VertexElementFormat.Float:
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
        type = DataType.BYTE;
        break;
      case VertexElementFormat.UByte4:
        size = 4;
        type = DataType.UNSIGNED_BYTE;
        break;
      case VertexElementFormat.NormalizedByte4:
        size = 4;
        type = DataType.BYTE;
        normalized = true;
        normalizedScaleFactor = 1 / 127;
        break;
      case VertexElementFormat.NormalizedUByte4:
        size = 4;
        type = DataType.UNSIGNED_BYTE;
        normalized = true;
        normalizedScaleFactor = 1 / 255;
        break;
      case VertexElementFormat.Short2:
        size = 2;
        type = DataType.SHORT;
        break;
      case VertexElementFormat.UShort2:
        size = 2;
        type = DataType.UNSIGNED_SHORT;
        break;
      case VertexElementFormat.NormalizedShort2:
        size = 2;
        type = DataType.SHORT;
        normalized = true;
        normalizedScaleFactor = 1 / 32767;
        break;
      case VertexElementFormat.NormalizedUShort2:
        size = 2;
        type = DataType.UNSIGNED_SHORT;
        normalized = true;
        normalizedScaleFactor = 1 / 65535;
        break;
      case VertexElementFormat.Short4:
        size = 4;
        type = DataType.SHORT;
        break;
      case VertexElementFormat.UShort4:
        size = 4;
        type = DataType.UNSIGNED_SHORT;
        break;
      case VertexElementFormat.NormalizedShort4:
        size = 4;
        type = DataType.SHORT;
        normalized = true;
        normalizedScaleFactor = 1 / 32767;
        break;
      case VertexElementFormat.NormalizedUShort4:
        size = 4;
        type = DataType.UNSIGNED_SHORT;
        normalized = true;
        normalizedScaleFactor = 1 / 65535;
        break;
      default:
        break;
    }
    return { size, type, normalized, normalizedScaleFactor };
  }
}
