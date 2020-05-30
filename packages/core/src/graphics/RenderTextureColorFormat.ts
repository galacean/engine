/**
 * 渲染纹理颜色格式枚举。
 */
export enum RenderTextureColorFormat {
  /** RGB格式，每通道8 bits。*/
  R8G8B8 = 0,
  /** RGBA格式，每通道8 bits。*/
  R8G8B8A8 = 1,
  /** 透明格式，8 bits。*/
  Alpha8 = 2,
  /** RGBA格式,每通道16 bits。*/
  R16G16B16A16 = 3
}
