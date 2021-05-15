import { BufferUsage } from "./enums/BufferUsage";
import { VertexElementFormat } from "./enums/VertexElementFormat";
import { DataType } from "../base/Constant";
import { IndexFormat } from "./enums/IndexFormat";

export interface ElementInfo {
  size: number;
  type: DataType;
  normalized: boolean;
}

export class BufferUtil {
  /**
   * @internal
   */
  static _getGLBufferUsage(gl: WebGLRenderingContext, bufferUsage: BufferUsage): number {
    switch (bufferUsage) {
      case BufferUsage.Static:
        return gl.STATIC_DRAW;
      case BufferUsage.Dynamic:
        return gl.DYNAMIC_DRAW;
      case BufferUsage.Stream:
        return gl.STREAM_DRAW;
    }
  }

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

  static _getGLIndexByteCount(indexFormat: IndexFormat): DataType {
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
      case VertexElementFormat.Byte2:
        size = 2;
        type = DataType.BYTE;
        break;
      case VertexElementFormat.UByte2:
        size = 2;
        type = DataType.UNSIGNED_BYTE;
        break;
      case VertexElementFormat.NormalizedByte2:
        size = 2;
        type = DataType.BYTE;
        normalized = true;
        break;
      case VertexElementFormat.NormalizedUByte2:
        size = 2;
        type = DataType.UNSIGNED_BYTE;
        normalized = true;
        break;
      case VertexElementFormat.Byte3:
        size = 3;
        type = DataType.BYTE;
        break;
      case VertexElementFormat.UByte3:
        size = 3;
        type = DataType.UNSIGNED_BYTE;
        break;
      case VertexElementFormat.NormalizedByte3:
        size = 3;
        type = DataType.BYTE;
        normalized = true;
        break;
      case VertexElementFormat.NormalizedUByte3:
        size = 3;
        type = DataType.UNSIGNED_BYTE;
        normalized = true;
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
        break;
      case VertexElementFormat.NormalizedUByte4:
        size = 4;
        type = DataType.UNSIGNED_BYTE;
        normalized = true;
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
        break;
      case VertexElementFormat.NormalizedUShort2:
        size = 2;
        type = DataType.UNSIGNED_SHORT;
        normalized = true;
        break;
      case VertexElementFormat.Short3:
        size = 3;
        type = DataType.SHORT;
        break;
      case VertexElementFormat.UShort3:
        size = 3;
        type = DataType.UNSIGNED_SHORT;
        break;
      case VertexElementFormat.NormalizedShort3:
        size = 3;
        type = DataType.SHORT;
        normalized = true;
        break;
      case VertexElementFormat.NormalizedUShort3:
        size = 3;
        type = DataType.UNSIGNED_SHORT;
        normalized = true;
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
        break;
      case VertexElementFormat.NormalizedUShort4:
        size = 4;
        type = DataType.UNSIGNED_SHORT;
        normalized = true;
        break;
      default:
        break;
    }
    return { size, type, normalized };
  }
}
