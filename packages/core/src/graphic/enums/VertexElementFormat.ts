/**
 * 顶点元素格式。
 */
export enum VertexElementFormat {
  /** 32-bit 浮点数。*/
  Single,
  /** 二维 32-bit 浮点数。*/
  Vector2,
  /** 三维 32-bit 浮点数。*/
  Vector3,
  /** 四维 32-bit 浮点数。*/
  Vector4,
  /** 四维 8-bit 整型,范围是 [-128,127]。*/
  Byte4,
  /** 四维 8-bit 无符号整型，范围是 [0,255]。*/
  UByte4,
  /** 四维 8-bit 归一化整型，范围是 [-1,1]。*/
  NormalizedByte4,
  /** 四维 8-bit 归一化无符号整型，范围是 [0,1]。*/
  NormalizedUByte4,
  /** 二维 16-bit 整型，范围是 [-32768, 32767]。*/
  Short2,
  /** 二维 16-bit 无符号整型，范围是 [0, 65535]。*/
  UShort2,
  /** 二维 16-bit 归一化整型，范围是 [-1, 1]。*/
  NormalizedShort2,
  /** 二维 16-bit 归一化无符号整型，范围是 [0, 1]。*/
  NormalizedUShort2,
  /** 四维 16-bit 整型，范围是 [-32768, 32767]。*/
  Short4,
  /** 四维 16-bit 无符号整型，范围是 [0, 65535]。*/
  UShort4,
  /** 四维 16-bit 归一化整型，范围是 [-1, 1]。*/
  NormalizedShort4,
  /** 四维 16-bit 归一化无符号整型，范围是 [0, 1]。*/
  NormalizedUShort4
}
