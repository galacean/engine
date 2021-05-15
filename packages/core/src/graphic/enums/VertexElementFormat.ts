/**
 * Vertex element format.
 */
export enum VertexElementFormat {
  /** 32-bit float */
  Float,
  /** Two-dimensional 32-bit float */
  Vector2,
  /** Three-dimensional 32-bit float */
  Vector3,
  /** Four-dimensional 32-bit float */
  Vector4,
  /** Two-dimensional 8-bit integer,range is [-128,127] */
  Byte2,
  /** Two-dimensional 8-bit Unsigned integer, range is [0,255] */
  UByte2,
  /** Two-dimensional 8-bit Normalized integer, range is [-1,1] */
  NormalizedByte2,
  /** Two-dimensional 8-bit Normalized unsigned integer, range is [0,1] */
  NormalizedUByte2,
  /** Three-dimensional 8-bit integer,range is [-128,127] */
  Byte3,
  /** Three-dimensional 8-bit Unsigned integer, range is [0,255] */
  UByte3,
  /** Three-dimensional 8-bit Normalized integer, range is [-1,1] */
  NormalizedByte3,
  /** Three-dimensional 8-bit Normalized unsigned integer, range is [0,1] */
  NormalizedUByte3,
  /** Four-dimensional 8-bit integer,range is [-128,127] */
  Byte4,
  /** Four-dimensional 8-bit Unsigned integer, range is [0,255] */
  UByte4,
  /** Four-dimensional 8-bit Normalized integer, range is [-1,1] */
  NormalizedByte4,
  /** Four-dimensional 8-bit Normalized unsigned integer, range is [0,1] */
  NormalizedUByte4,
  /** Two-dimensional 16-bit integer, range is[-32768, 32767] */
  Short2,
  /** Two-dimensional 16-bit Unsigned integer, range is [0, 65535] */
  UShort2,
  /** Two-dimensional 16-bit Unsigned integer, range is [-1, 1] */
  NormalizedShort2,
  /** Two-dimensional 16-bit Normalized unsigned integer, range is [0, 1] */
  NormalizedUShort2,
  /** Three-dimensional 16-bit integer, range is[-32768, 32767] */
  Short3,
  /** Three-dimensional 16-bit Unsigned integer, range is [0, 65535] */
  UShort3,
  /** Three-dimensional 16-bit Unsigned integer, range is [-1, 1] */
  NormalizedShort3,
  /** Three-dimensional 16-bit Normalized unsigned integer, range is [0, 1] */
  NormalizedUShort3,
  /** Four-dimensional 16-bit integer, range is [-32768, 32767] */
  Short4,
  /** Four-dimensional 16-bit Unsigned integer, range is [0, 65535] */
  UShort4,
  /** Four-dimensional 16-bit Normalized integer, range is[-1, 1] */
  NormalizedShort4,
  /** Four-dimensional 16-bit Normalized unsigned integer, range is [0, 1] */
  NormalizedUShort4
}
