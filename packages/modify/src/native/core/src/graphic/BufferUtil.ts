import { DataType } from "../base/Constant";
import { IndexFormat } from "./enums/IndexFormat";
import { VertexElementFormat } from "./enums/VertexElementFormat";

/**
 * @internal
 */
export interface ElementInfo {
  size: number;
  type: DataType;
  normalized: boolean;
  integer?: boolean;
  normalizedScaleFactor: number;
}

/**
 * @internal
 */
export class BufferUtil {
  /** Copy a readable vertex element to numeric data, applying its native normalization.
   * Works with interleaved buffers and byte views; never reads back GPU memory.
   */
  static getVertexElementData(data: Uint8Array, format: VertexElementFormat, stride: number, offset: number): number[] {
    const info = BufferUtil._getElementInfo(format);
    const readers = {
      [DataType.FLOAT]: [4, (v: DataView, i: number) => v.getFloat32(i, true)],
      [DataType.BYTE]: [1, (v: DataView, i: number) => v.getInt8(i)],
      [DataType.UNSIGNED_BYTE]: [1, (v: DataView, i: number) => v.getUint8(i)],
      [DataType.SHORT]: [2, (v: DataView, i: number) => v.getInt16(i, true)],
      [DataType.UNSIGNED_SHORT]: [2, (v: DataView, i: number) => v.getUint16(i, true)],
      [DataType.UNSIGNED_INT]: [4, (v: DataView, i: number) => v.getUint32(i, true)]
    } as Record<number, [number, (v: DataView, i: number) => number]>;
    const reader = readers[info.type];
    if (
      !reader ||
      !info.size ||
      !Number.isSafeInteger(stride) ||
      stride <= 0 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset + info.size * reader[0] > stride ||
      data.byteLength % stride
    )
      throw new Error("Invalid readable vertex element layout");
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength),
      result: number[] = [];
    for (let start = offset; start < data.byteLength; start += stride) {
      for (let channel = 0; channel < info.size; channel++) {
        const value = reader[1](view, start + channel * reader[0]);
        result.push(info.normalized ? Math.max(-1, value * info.normalizedScaleFactor) : value);
      }
    }
    return result;
  }

  /** Copy a range from a readable native index buffer. */
  static getIndexData(data: Uint8Array, format: IndexFormat, start = 0, count?: number): number[] {
    const size = BufferUtil._getGLIndexByteCount(format);
    count ??= data.byteLength / size - start;
    if (
      !size ||
      data.byteLength % size ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(count) ||
      start < 0 ||
      count < 0 ||
      (start + count) * size > data.byteLength
    )
      throw new Error("Invalid readable index range");
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength),
      result: number[] = [];
    for (let i = start; i < start + count; i++)
      result.push(
        size === 4 ? view.getUint32(i * size, true) : size === 2 ? view.getUint16(i * size, true) : view.getUint8(i)
      );
    return result;
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

  static _getElementInfo(format: VertexElementFormat): ElementInfo {
    let size!: number;
    let type!: DataType;
    let normalized: boolean = false;
    let integer = false;
    let normalizedScaleFactor!: number;

    switch (format) {
      case VertexElementFormat.UInt4:
        size = 4;
        type = DataType.UNSIGNED_INT;
        integer = true;
        break;
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
    return { size, type, normalized, normalizedScaleFactor, integer };
  }
}
