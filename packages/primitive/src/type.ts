import { DataType, UpdateType, BufferUsage } from "@alipay/o3-core";

interface AttributeParam {
  semantic: string;
  size: number;
  type: DataType;
  normalized: boolean;
  instanced?: number;
  usage?: BufferUsage;
}
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
  usage: BufferUsage = BufferUsage.STATIC_DRAW;
  constructor(param: AttributeParam) {
    this.semantic = param.semantic;
    this.size = param.size;
    this.type = param.type;
    this.normalized = param.normalized;
    if (param.instanced !== undefined) {
      this.instanced = param.instanced;
    }
    if (param.usage !== undefined) {
      this.usage = param.usage;
    }
  }

  resetUpdateRange() {
    this.updateRange = {
      byteOffset: 0,
      byteLength: -1,
      bufferByteOffset: 0
    };
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

export interface Attribute {
  name?: string;
  semantic: string;
  size: number;
  type: DataType;
  normalized?: boolean;
  instanced?: number;
  interleaved?: boolean;
  stride?: number;
  offset?: number;
  vertexBufferIndex?: number;
}
