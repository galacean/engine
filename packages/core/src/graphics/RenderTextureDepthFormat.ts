/**
 * 渲染纹理深度格式枚举。
 */
export enum RenderTextureDepthFormat {
  /** 至少16位深度缓冲，无模版缓冲。*/
  Depth16 = 0,
  /** 深度缓冲和模板缓冲至少24位。*/
  DepthStencil24 = 1,
  /** 无深度缓冲和模板缓冲。*/
  None = 2
}
