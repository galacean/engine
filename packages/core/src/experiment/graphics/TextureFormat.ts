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
  /** RGB压缩格式，2 bits每像素。*/
  PVRTC_RGB2 = 8,
  /** RGBA压缩格式，2 bits每像素。*/
  PVRTC_RGBA2 = 9,
  /** RGB压缩格式，4 bits每像素。*/
  PVRTC_RGB4 = 10,
  /** RGBA压缩格式，4 bits每像素。*/
  PVRTC_RGBA4 = 11
}
