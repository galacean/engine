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
