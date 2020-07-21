import { DataType } from "@alipay/o3-base";

export interface BufferAttribute {
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

export enum IndexFormat {
  UNSIGNED_BYTE = DataType.UNSIGNED_BYTE,
  UNSIGNED_SHORT = DataType.UNSIGNED_SHORT,
  UNSIGNED_INT = DataType.UNSIGNED_INT
}
