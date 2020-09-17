import { BufferUsage } from "./enums/BufferUsage";
import { VertexElementFormat } from "./enums/VertexElementFormat";
import { DataType } from "../base/Constant";
import { IndexFormat } from "./enums/IndexFormat";

export interface ElementInfo {
  size: number;
  type: DataType;
}

const vertexDataTypeSizeHash = {};
vertexDataTypeSizeHash[DataType.BYTE] = 1;
vertexDataTypeSizeHash[DataType.UNSIGNED_BYTE] = 1;
vertexDataTypeSizeHash[DataType.SHORT] = 2;
vertexDataTypeSizeHash[DataType.UNSIGNED_SHORT] = 2;
vertexDataTypeSizeHash[DataType.INT] = 4;
vertexDataTypeSizeHash[DataType.UNSIGNED_INT] = 4;
vertexDataTypeSizeHash[DataType.FLOAT] = 4;

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

  /**
   * @internal
   */
  static _getElementInfo(format: VertexElementFormat): ElementInfo {
    let size: number;
    let type: DataType;
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
      case VertexElementFormat.UShort2:
        size = 2;
        type = DataType.UNSIGNED_SHORT;
        break;
      case VertexElementFormat.UShort4:
        size = 4;
        type = DataType.UNSIGNED_SHORT;
        break;
      default:
        break;
    }
    return { size, type };
  }

  /**
   * @internal
   */
  static _getVertexDataTypeSize(type: DataType): number {
    return vertexDataTypeSizeHash[type];
  }
}
