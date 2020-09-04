/**
 * 纹理格式枚举。
 */
export enum TextureFormat {
  /** RGB格式，每通道8 bits。*/
  R8G8B8,
  /** RGBA格式，每通道8 bits。*/
  R8G8B8A8,
  /** RGBA格式,每通道4 bits*/
  R4G4B4A4,
  /** RGBA格式,R通道5 bits，G通道5 bits，B通道5 bits， A通道1 bit。*/
  R5G5B5A1,
  /** RGB格式,R通道5 bits，G通道6 bits，B通道5 bits。*/
  R5G6B5,
  /** 透明格式，8 bits。*/
  Alpha8,
  /** RGBA格式，每个通道32 bits。*/
  R32G32B32A32,
  /** RGB压缩格式的压缩格式。*/
  DXT1,
  /** RGBA压缩格式的压缩格式。*/
  DXT5,
  /** RGB压缩格式，4 bits每像素。*/
  ETC1_RGB,
  /** RGB压缩格式，4 bits每像素。*/
  ETC2_RGB,
  /** RGBA压缩格式，5 bits每像素,RGB 4 bit,Alpha 1 bit。*/
  ETC2_RGBA5,
  /** RGB压缩格式，8 bits每像素。*/
  ETC2_RGBA8,
  /** RGB压缩格式，2 bits每像素。*/
  PVRTC_RGB2,
  /** RGBA压缩格式，2 bits每像素。*/
  PVRTC_RGBA2,
  /** RGB压缩格式，4 bits每像素。*/
  PVRTC_RGB4,
  /** RGBA压缩格式，4 bits每像素。*/
  PVRTC_RGBA4,
  /** RGB(A)压缩格式，128 bits 每4x4像素块。*/
  ASTC_4x4,
  /** RGB(A)压缩格式，128 bits 每5x5像素块。*/
  ASTC_5x5,
  /** RGB(A)压缩格式，128 bits 每6x6像素块。*/
  ASTC_6x6,
  /** RGB(A)压缩格式，128 bits 每8x8像素块。*/
  ASTC_8x8,
  /** RGB(A)压缩格式，128 bits 每10x10像素块。*/
  ASTC_10x10,
  /** RGB(A)压缩格式，128 bits 每12x12像素块。*/
  ASTC_12x12
}
