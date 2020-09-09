/**
 * 渲染缓冲颜色格式枚举。
 */
export enum RenderBufferColorFormat {
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
  /** RGBA格式,每通道16 bits。*/
  R16G16B16A16,
  /** RGBA格式，每个通道32 bits。*/
  R32G32B32A32
}
