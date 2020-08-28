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
