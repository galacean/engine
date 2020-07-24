import { DataType, UpdateType } from "@alipay/o3-base";

export class BufferAttribute {
  name: string;
  semantic: string;
  size: number;
  type: DataType;
  normalized: boolean;
  instanced: number;
  interleaved: boolean;
  stride: number;
  offset: number;
  vertexBufferIndex: number;
  updateType: UpdateType = UpdateType.UPDATE_ALL;
  updateRange: UpdateRange = {
    byteOffset: 0,
    byteLength: -1,
    bufferByteOffset: 0
  };
  constructor({ semantic, size, type, normalized, instanced }) {
    this.semantic = semantic;
    this.size = size;
    this.type = type;
    this.normalized = normalized;
    this.instanced = instanced;
  }
}

export enum IndexFormat {
  UNSIGNED_BYTE = DataType.UNSIGNED_BYTE,
  UNSIGNED_SHORT = DataType.UNSIGNED_SHORT,
  UNSIGNED_INT = DataType.UNSIGNED_INT
}

export interface UpdateRange {
  byteOffset: number;
  byteLength: number;
  bufferByteOffset: number;
}
