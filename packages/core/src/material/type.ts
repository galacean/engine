import { DataType, UniformSemantic } from "../base/Constant";

export interface RenderTargetConfig {
  width?: number;
  height?: number;
  clearColor?;
  enableDepthTexture?: boolean;
  isCube?: boolean;
  /** WebGL2 时，可以开启硬件层的 MSAA */
  samples?: number;
  isMulti?: boolean;
  /** color Buffer 输出是否要 float 浮点类型 */
  colorBufferFloat?: boolean;
}

export type Rect = { x: number; y: number; width: number; height: number };

export type TechniqueStates = {
  enable?: GLenum[];
  disable?: GLenum[];
  functions?: {
    [key: string]: any;
  };
};

export interface Attributes {
  [key: string]: {
    name: string;
    semantic: string;
    type: DataType;
  };
}

export interface Uniforms {
  [key: string]: {
    name: string;
    semantic?: UniformSemantic | string;
    type: DataType;
  };
}

export interface TextureFormatDetail {
  internalFormat: GLint;
  baseFormat?: GLenum;
  dataType?: GLenum;
  isCompressed: boolean;
  attachment?: GLenum;
}

/**
 * @deprecated
 */
export enum GLCompressedTextureInternalFormat {
  // astc
  RGBA_ASTC_4X4_KHR = 0x93b0,
  RGBA_ASTC_5X4_KHR = 0x93b1,
  RGBA_ASTC_5X5_KHR = 0x93b2,
  RGBA_ASTC_6X5_KHR = 0x93b3,
  RGBA_ASTC_6X6_KHR = 0x93b4,
  RGBA_ASTC_8X5_KHR = 0x93b5,
  RGBA_ASTC_8X6_KHR = 0x93b6,
  RGBA_ASTC_8X8_KHR = 0x93b7,
  RGBA_ASTC_10X5_KHR = 0x93b8,
  RGBA_ASTC_10X6_KHR = 0x93b9,
  RGBA_ASTC_10X8_KHR = 0x93ba,
  RGBA_ASTC_10X10_KHR = 0x93bb,
  RGBA_ASTC_12X10_KHR = 0x93bc,
  RGBA_ASTC_12X12_KHR = 0x93bd,
  SRGB8_ALPHA8_ASTC_4X4_KHR = 0x93d0,
  SRGB8_ALPHA8_ASTC_5X4_KHR = 0x93d1,
  SRGB8_ALPHA8_ASTC_5X5_KHR = 0x93d2,
  SRGB8_ALPHA8_ASTC_6X5_KHR = 0x93d3,
  SRGB8_ALPHA8_ASTC_6X6_KHR = 0x93d4,
  SRGB8_ALPHA8_ASTC_8X5_KHR = 0x93d5,
  SRGB8_ALPHA8_ASTC_8X6_KHR = 0x93d6,
  SRGB8_ALPHA8_ASTC_8X8_KHR = 0x93d7,
  SRGB8_ALPHA8_ASTC_10X5_KHR = 0x93d8,
  SRGB8_ALPHA8_ASTC_10X6_KHR = 0x93d9,
  SRGB8_ALPHA8_ASTC_10X8_KHR = 0x93da,
  SRGB8_ALPHA8_ASTC_10X10_KHR = 0x93db,
  SRGB8_ALPHA8_ASTC_12X10_KHR = 0x93dc,
  SRGB8_ALPHA8_ASTC_12X12_KHR = 0x93dd,

  // etc1
  RGB_ETC1_WEBGL = 0x8d64,

  // etc2
  R11_EAC = 0x9270,
  SIGNED_R11_EAC = 0x9271,
  RG11_EAC = 0x9272,
  SIGNED_RG11_EAC = 0x9273,
  RGB8_ETC2 = 0x9274,
  SRGB8_ETC2 = 0x9275,
  RGB8_PUNCHTHROUGH_ALPHA1_ETC2 = 0x9276,
  SRGB8_PUNCHTHROUGH_ALPHA1_ETC2 = 0x9277,
  RGBA8_ETC2_EAC = 0x9278,
  SRGB8_ALPHA8_ETC2_EAC = 0x9279,

  // pvrtc
  RGB_PVRTC_4BPPV1_IMG = 0x8c00,
  RGB_PVRTC_2BPPV1_IMG = 0x8c01,
  RGBA_PVRTC_4BPPV1_IMG = 0x8c02,
  RGBA_PVRTC_2BPPV1_IMG = 0x8c03,

  // s3tc
  RGB_S3TC_DXT1_EXT = 0x83f0,
  RGBA_S3TC_DXT1_EXT = 0x83f1,
  RGBA_S3TC_DXT3_EXT = 0x83f2,
  RGBA_S3TC_DXT5_EXT = 0x83f3
}

/**
 * 纹理的循环模式。
 */
export enum TextureWrapMode {
  /** 截取模式，超过纹理边界使用边缘像素的颜色。 */
  Clamp = 0,
  /** 重复模式，超过纹理边界会循环平铺。*/
  Repeat = 1,
  /** 镜像重复模式，超过纹理边界会镜像循环平铺。*/
  Mirror = 2
}

/**
 * 纹理的过滤模式。
 */
export enum TextureFilterMode {
  /** 点过滤。*/
  Point = 0,
  /** 双线性过滤。*/
  Bilinear = 1,
  /** 三线性过滤。*/
  Trilinear = 2
}

/**
 * 纹理格式枚举。
 */
export enum TextureFormat {
  /** RGB格式，每通道8 bits。*/
  R8G8B8 = 0,
  /** RGBA格式，每通道8 bits。*/
  R8G8B8A8 = 1,
  /** RGB格式,R通道5 bits，G通道6 bits，B通道5 bits。*/
  R5G6B5 = 2,
  /** 透明格式，8 bits。*/
  Alpha8 = 3,
  /** RGBA格式，每个通道32 bits。*/
  R32G32B32A32 = 4,
  /** RGB压缩格式的压缩格式。*/
  DXT1 = 5,
  /** RGBA压缩格式的压缩格式。*/
  DXT5 = 6,
  /** RGB压缩格式，4 bits每像素。*/
  ETC1_RGB = 7,
  /** RGB压缩格式，4 bits每像素。*/
  ETC2_RGB = 8,
  /** RGBA压缩格式，5 bits每像素,RGB 4 bit,Alpha 1 bit。*/
  ETC2_RGBA5 = 9,
  /** RGB压缩格式，8 bits每像素。*/
  ETC2_RGBA8 = 10,
  /** RGB压缩格式，2 bits每像素。*/
  PVRTC_RGB2 = 11,
  /** RGBA压缩格式，2 bits每像素。*/
  PVRTC_RGBA2 = 12,
  /** RGB压缩格式，4 bits每像素。*/
  PVRTC_RGB4 = 13,
  /** RGBA压缩格式，4 bits每像素。*/
  PVRTC_RGBA4 = 14,
  /** RGB(A)压缩格式，128 bits 每4x4像素块。*/
  ASTC_4x4 = 15,
  /** RGB(A)压缩格式，128 bits 每5x5像素块。*/
  ASTC_5x5 = 16,
  /** RGB(A)压缩格式，128 bits 每6x6像素块。*/
  ASTC_6x6 = 17,
  /** RGB(A)压缩格式，128 bits 每8x8像素块。*/
  ASTC_8x8 = 18,
  /** RGB(A)压缩格式，128 bits 每10x10像素块。*/
  ASTC_10x10 = 19,
  /** RGB(A)压缩格式，128 bits 每12x12像素块。*/
  ASTC_12x12 = 20
}

/**
 * 立方体纹理面。
 */
export enum TextureCubeFace {
  /** X轴正方向。 */
  PositiveX = 0,
  /** X轴负方向。 */
  NegativeX = 1,
  /** Y轴正方向。 */
  PositiveY = 2,
  /** Y轴负方向。 */
  NegativeY = 3,
  /** Z轴正方向。 */
  PositiveZ = 4,
  /** Z轴负方向。 */
  NegativeZ = 5
}

/**
 * 渲染缓冲颜色格式枚举。
 */
export enum RenderBufferColorFormat {
  /** RGB格式，每通道8 bits。*/
  R8G8B8 = 0,
  /** RGBA格式，每通道8 bits。*/
  R8G8B8A8 = 1,
  /** 透明格式，8 bits。*/
  Alpha8 = 2,
  /** RGBA格式,每通道16 bits。*/
  R16G16B16A16 = 3,
  /** RGBA格式，每个通道32 bits。*/
  R32G32B32A32 = 4
}

/**
 * 渲染缓冲深度格式枚举。
 */
export enum RenderBufferDepthFormat {
  /** 深度缓冲，自动选择精度 */
  Depth = 0,
  /** 深度模版缓冲，自动选择精度 */
  DepthStencil = 1,
  /** 模板缓冲 */
  Stencil = 2,

  /** 强制16位深度缓冲 */
  Depth16 = 3,
  /** 强制24位深度缓冲 */
  Depth24 = 4,
  /** 强制32位深度缓冲 */
  Depth32 = 5,
  /** 强制24位深度缓冲+8位模版缓冲 */
  Depth24Stencil8 = 6,
  /** 强制32位深度缓冲+8位模版缓冲 */
  Depth32Stencil8 = 7
}
